import mongoose from 'mongoose';
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
  const userId = new mongoose.Types.ObjectId(notification.userId.toString());
  let tokens = await DeviceToken.find({
    userId: userId,
    userModel: notification.userModel,
    isActive: true,
  }).select('fcmToken platform isActive lastSeenAt isLegacy').lean();

  logger.info(`[FCM] Found ${tokens.length} tokens in DeviceToken for ${userId}`);
  if (tokens.length > 0) {
    logger.info(`[FCM] First token snippet: ${tokens[0].fcmToken?.substring(0, 10)}...`);
  }

  const Model = notification.userModel === 'Engineer' ? Engineer : User;

  // --- INTEGRITY FALLBACK: Check old tokens if new ones missing ---
  if (tokens.length === 0) {
    logger.info(`[FCM] No tokens in DeviceToken for ${notification.userId}, checking legacy...`);
    const legacyEntity = await Model.findById(userId).select('fcmTokens').lean();
    logger.info(`[FCM] Legacy entity found: ${!!legacyEntity} | Tokens: ${legacyEntity?.fcmTokens?.length || 0}`);
    
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
            userId: userId,
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
    return { success: false, reason: 'NO_TOKENS', skipped: true };
  }

  const stringData = {
    notificationId: notification._id.toString(),
    type: notification.type,
    ...Object.fromEntries(
      Object.entries(notification.data || {})
        .map(([k, v]) => [k, String(v)])
    ),
  };

  // Deduplicate tokens to prevent multiple notifications to the same device
  const uniqueTokens = [...new Set(tokens.map(t => t.fcmToken))];

  const message = {
    tokens: uniqueTokens,
    notification: { title: notification.title, body: notification.body },
    data: {
      ...stringData,
      title: notification.title,
      body: notification.body,
    },
    android: {
      priority: 'high',
    },
    // apns: {
    //   payload: { aps: { sound: 'default', badge: 1 } },
    // },
  };

  try {
    const projectId = admin.app().options.credential?.projectId || process.env.FIREBASE_PROJECT_ID;
    logger.info(`[FCM] Sending to ${tokens.length} token(s) for notification ${notification._id} via project: ${projectId}`);

    let response;

    if (uniqueTokens.length === 1) {
      const singleMessage = {
        token: uniqueTokens[0],
        notification: { title: notification.title, body: notification.body },
        data: {
          ...stringData,
          title: notification.title,
          body: notification.body,
        },
        android: { priority: 'high' },
        // apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      };

      try {
        const messageId = await admin.messaging().send(singleMessage);
        logger.info(`[FCM] Single send successful, ID: ${messageId}`);
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
              Model.findByIdAndUpdate(userId, { $pull: { fcmTokens: { token: expiredToken } } })
            );
          }
        }
      }
    });

    if (invalidations.length > 0) {
      await Promise.allSettled(invalidations);
    }

    logger.info(`[FCM] Final response for ${notification._id}: successCount=${response.successCount}, failureCount=${response.failureCount}`);
    if (response.responses && response.responses.length > 0) {
      logger.info(`[FCM] First response sample:`, JSON.stringify(response.responses[0]));
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
