import DeviceToken from './DeviceToken.model.js';
import { admin } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import User from '../../models/user.js';
import { Engineer } from '../../models/engineersModal.js';

/**
 * Sends a notification using FCM
 * Extracted from original notification.service.js
 */
export async function sendPushNotification(notification) {
  console.log('--- DEBUG: DISPATCHING FCM ---', notification.userId, notification.userModel);
  let tokens = await DeviceToken.find({
    userId: notification.userId,
    userModel: notification.userModel,
    isActive: true,
  }).select('fcmToken platform isActive lastSeenAt isLegacy').lean();

  const Model = notification.userModel === 'Engineer' ? Engineer : User;

  // --- INTEGRITY FALLBACK: Check old tokens if new ones missing ---
  if (tokens.length === 0) {
    const legacyEntity = await Model.findById(notification.userId).select('fcmTokens').lean();
    if (legacyEntity?.fcmTokens?.length > 0) {
      logger.info(`[FCM] Fallback: Found ${legacyEntity.fcmTokens.length} legacy tokens for ${notification.userModel} ${notification.userId}`);
      
      tokens = legacyEntity.fcmTokens.map(t => ({
        fcmToken: t.token,
        platform: t.device || 'android',
        isLegacy: true
      }));

      // AUTO-HYDRATION
      setImmediate(async () => {
        try {
          const newTokens = legacyEntity.fcmTokens.map(t => ({
            userId: notification.userId,
            userModel: notification.userModel,
            fcmToken: t.token,
            platform: t.device || 'android',
            deviceId: `legacy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            isActive: true,
            lastSeenAt: t.lastUsed || new Date()
          }));
          await DeviceToken.insertMany(newTokens, { ordered: false }).catch(() => {});
        } catch (hErr) {
          logger.warn(`[FCM] Hydration failed for ${notification.userId}: ${hErr.message}`);
        }
      });
    }
  }

  if (tokens.length === 0) {
    logger.warn(`[FCM] No active tokens for ${notification.userModel} ${notification.userId}`);
    return { success: false, reason: 'NO_TOKENS' };
  }

  const stringData = {
    notificationId: notification._id.toString(),
    type: notification.type,
    ...Object.fromEntries(
      Object.entries(notification.data || {})
        .map(([k, v]) => [k, String(v)])
    ),
  };

  const message = {
    tokens: tokens.map(t => t.fcmToken),
    notification: { title: notification.title, body: notification.body },
    data: stringData,
    android: {
      priority: 'high',
      notification: { sound: 'default' },
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
  };

  try {
    const projectId = admin.app().options.credential?.projectId || process.env.FIREBASE_PROJECT_ID;
    logger.info(`[FCM] Sending to ${tokens.length} token(s) for notification ${notification._id} via project: ${projectId}`);

    let response;

    if (tokens.length === 1) {
      const singleMessage = {
        token: tokens[0].fcmToken,
        notification: { title: notification.title, body: notification.body },
        data: stringData,
        android: { priority: 'high', notification: { sound: 'default' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      };

      try {
        const messageId = await admin.messaging().send(singleMessage);
        response = { successCount: 1, failureCount: 0, responses: [{ success: true, messageId }] };
      } catch (sendErr) {
        response = { successCount: 0, failureCount: 1, responses: [{ success: false, error: sendErr }] };
      }
    } else {
      response = await admin.messaging().sendEachForMulticast(message);
    }
    
    logger.info(`[FCM] Successfully sent ${response.successCount} messages; failures: ${response.failureCount}`);

    const invalidations = [];
    const errorCodes = [];
    const FRESHNESS_WINDOW_MS = 5 * 60 * 1000;

    response.responses.forEach((result, i) => {
      if (!result.success) {
        const code = result.error?.code ?? 'UNKNOWN';
        errorCodes.push(code);
        logger.warn(`[FCM] Token[${i}] Error: ${code} | message: ${result.error?.message} | target: ${notification.userModel} ${notification.userId}`);

        if (code === 'messaging/invalid-registration-token' || code === 'messaging/registration-token-not-registered') {
          const expiredToken = tokens[i].fcmToken;
          const tokenLastSeen = tokens[i].lastSeenAt ? new Date(tokens[i].lastSeenAt).getTime() : 0;
          const isFresh = (Date.now() - tokenLastSeen) < FRESHNESS_WINDOW_MS;

          if (!isFresh) {
            invalidations.push(
              DeviceToken.findOneAndUpdate({ fcmToken: expiredToken }, { isActive: false, invalidatedAt: new Date() })
            );
            invalidations.push(
              Model.findByIdAndUpdate(notification.userId, { $pull: { fcmTokens: { token: expiredToken } } })
            );
          }
        }
      }
    });

    if (invalidations.length > 0) {
      await Promise.allSettled(invalidations);
    }

    const firstError = errorCodes.length > 0 ? errorCodes[0] : null;
    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
      fcmMessageId: response.responses.find(r => r.success)?.messageId ?? null,
      reason: firstError,
    };
  } catch (error) {
    logger.error(`[FCM] Fatal error for ${notification.userModel} ${notification.userId}:`, error);
    throw error;
  }
}

/**
 * Synchronizes a device token
 */
export async function syncDeviceToken({ userId, userModel, fcmToken, platform, deviceId, appVersion }) {
  if (!userId || !fcmToken) return null;

  const finalUserModel = userModel || 'User';
  const finalPlatform = platform || 'android';
  const finalDeviceId = deviceId || `gen_${fcmToken.substring(0, 10)}`;

  await DeviceToken.updateMany(
    { fcmToken, userModel: finalUserModel, userId: { $ne: userId } },
    { isActive: false, invalidatedAt: new Date() }
  );

  const tokenDoc = await DeviceToken.findOneAndUpdate(
    { deviceId: finalDeviceId, userId, userModel: finalUserModel },
    {
      fcmToken,
      platform: finalPlatform,
      appVersion,
      isActive: true,
      lastSeenAt: new Date(),
      invalidatedAt: null,
    },
    { upsert: true, new: true }
  );

  const Model = finalUserModel === 'Engineer' ? Engineer : User;
  
  await Model.findByIdAndUpdate(userId, {
    $pull: { fcmTokens: { token: fcmToken } }
  });

  await Model.findByIdAndUpdate(userId, {
    $push: {
      fcmTokens: {
        $each: [{
          token: fcmToken,
          device: finalPlatform,
          lastUsed: new Date()
        }],
        $position: 0,
        $slice: 10
      }
    }
  });

  if (finalUserModel === 'Engineer') {
    logger.info(`[FCM] Engineer token saved for future use. Engineer: ${userId}, DeviceId: ${finalDeviceId}`);
  }

  return tokenDoc;
}
