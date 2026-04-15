import Notification from './Notification.model.js';
import DeviceToken from './DeviceToken.model.js';
import { admin } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import User from '../../models/user.js';
import { Engineer } from '../../models/engineersModal.js';

/**
 * Enqueues a notification into the MongoDB queue
 */
export async function enqueueNotification({
  userId, userModel = 'User', type, title, body, data = {}, delayMs = 0,
}) {
  const nextRunAt = new Date(Date.now() + delayMs);
  return Notification.create({ userId, userModel, type, title, body, data, nextRunAt });
}

/**
 * Bulk enqueue for campaigns
 */
export async function enqueueBulk({ userIds, userModel = 'User', type, title, body, data = {} }) {
  const docs = userIds.map(userId => ({
    userId, userModel, type, title, body, data,
    status: 'PENDING',
    nextRunAt: new Date(),
  }));
  return Notification.insertMany(docs, { ordered: false });
}

/**
 * Sends a notification using FCM (Called by worker)
 * 
 * IMPORTANT: User App and Engineer App use DIFFERENT Firebase projects.
 * Currently only the User App's Firebase credentials are configured.
 * Engineer notifications are enqueued but FCM dispatch is skipped until
 * the Engineer App's Firebase credentials are added.
 */
export async function dispatchNotification(notification) {
  // --- MULTI-PROJECT GUARD ---
  // Engineer App uses a different Firebase project. Skip FCM until configured.
  // TODO: When Engineer Firebase credentials are added, initialize a second
  //       admin instance (e.g., adminEngineer) and route Engineer notifications to it.
  if (notification.userModel === 'Engineer') {
    logger.info(`[FCM] Skipping Engineer notification (Engineer Firebase not yet configured). NotifId: ${notification._id}`);
    return { success: true, reason: 'ENGINEER_FCM_PENDING', skipped: true };
  }

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
      
      // Map to compatible format
      tokens = legacyEntity.fcmTokens.map(t => ({
        fcmToken: t.token,
        platform: t.device || 'android',
        isLegacy: true // internal flag
      }));

      // AUTO-HYDRATION: Move legacy tokens to new standard (Async)
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
          await DeviceToken.insertMany(newTokens, { ordered: false }).catch(() => {}); // silence duplicate errors
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

  // FCM data payload only accepts strings
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
      // Use send() for single token — more reliable credential validation
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

    // Process per-token results for invalidation
    const invalidations = [];
    const errorCodes = [];
    const FRESHNESS_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

    response.responses.forEach((result, i) => {
      if (!result.success) {
        const code = result.error?.code ?? 'UNKNOWN';
        errorCodes.push(code);
        logger.warn(`[FCM] Token[${i}] Error: ${code} | message: ${result.error?.message} | target: ${notification.userModel} ${notification.userId}`);

        // Only invalidate for terminal token errors (NOT mismatched-credential, which is a config issue)
        if (
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered'
        ) {
          const expiredToken = tokens[i].fcmToken;

          // FRESHNESS GUARD: Don't invalidate tokens that were synced very recently.
          // This prevents the retry→invalidate→re-sync→retry death loop.
          const tokenLastSeen = tokens[i].lastSeenAt ? new Date(tokens[i].lastSeenAt).getTime() : 0;
          const isFresh = (Date.now() - tokenLastSeen) < FRESHNESS_WINDOW_MS;

          if (isFresh) {
            logger.info(`[FCM] Skipping invalidation for fresh token (synced ${Math.round((Date.now() - tokenLastSeen) / 1000)}s ago)`);
          } else {
            // 1. Deactivate in new collection
            invalidations.push(
              DeviceToken.findOneAndUpdate(
                { fcmToken: expiredToken },
                { isActive: false, invalidatedAt: new Date() }
              )
            );

            // 2. PRUNE FROM LEGACY MODEL (Integrity Protection)
            invalidations.push(
              Model.findByIdAndUpdate(notification.userId, {
                $pull: { fcmTokens: { token: expiredToken } }
              })
            );
          }
        } else if (code === 'messaging/mismatched-credential') {
          // This is a SERVER CONFIG issue, NOT a token issue.
          // The token itself is valid but was registered under a different Firebase project.
          // Log loudly but do NOT invalidate the token.
          logger.error(`[FCM] ⚠️ MISMATCHED CREDENTIAL — The backend Firebase project may not match the app's google-services.json. Token NOT invalidated.`);
        }
      }
    });

    if (invalidations.length > 0) {
      await Promise.allSettled(invalidations);
    }

    // Return actual error codes so the worker can log them properly
    const firstError = errorCodes.length > 0 ? errorCodes[0] : null;
    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
      fcmMessageId: response.responses.find(r => r.success)?.messageId ?? null,
      reason: firstError, // Propagate actual FCM error code to the worker
    };
  } catch (error) {
    logger.error(`[FCM] Multicast fatal error for ${notification.userModel} ${notification.userId}:`, error);
    throw error;
  }
}

/**
 * Synchronizes a device token across both new and legacy models.
 * Handles ownership guards and auto-activation.
 */
export async function syncDeviceToken({ userId, userModel, fcmToken, platform, deviceId, appVersion }) {
  if (!userId || !fcmToken) return null;

  const finalUserModel = userModel || 'User';
  const finalPlatform = platform || 'android';
  const finalDeviceId = deviceId || `gen_${fcmToken.substring(0, 10)}`;

  // 1. OWNERSHIP GUARD: If this token belongs to a DIFFERENT user of the SAME type, deactivate it.
  // User App and Engineer App are separate Firebase projects, so we only guard within the same userModel.
  // This prevents the "login as different user on same phone" cross-talk.
  await DeviceToken.updateMany(
    { fcmToken, userModel: finalUserModel, userId: { $ne: userId } },
    { isActive: false, invalidatedAt: new Date() }
  );

  // 2. NEW ARCHITECTURE: Update/Upsert DeviceToken collection.
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

  // 3. LEGACY ARCHITECTURE: Sync to User/Engineer model fcmTokens array.
  const Model = finalUserModel === 'Engineer' ? Engineer : User;
  
  // Prune any existing entries of this specific token for this user to avoid duplicates
  await Model.findByIdAndUpdate(userId, {
    $pull: { fcmTokens: { token: fcmToken } }
  });

  // Add fresh entry to the top of the array
  await Model.findByIdAndUpdate(userId, {
    $push: {
      fcmTokens: {
        $each: [{
          token: fcmToken,
          device: finalPlatform,
          lastUsed: new Date()
        }],
        $position: 0,
        $slice: 10 // Keep only last 10 tokens for performance
      }
    }
  });

  if (finalUserModel === 'Engineer') {
    logger.info(`[FCM] Engineer token saved for future use. Engineer: ${userId}, DeviceId: ${finalDeviceId}`);
  }

  return tokenDoc;
}
