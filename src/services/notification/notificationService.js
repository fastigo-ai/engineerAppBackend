import { admin } from '../../config/firebase.js';
import User from '../../models/user.js';
import { Engineer } from '../../models/engineersModal.js';

/**
 * Production-grade notification service handling multi-device FCM delivery,
 * batching, and automatic token cleanup.
 */
export const sendPushNotification = async ({ targetId, targetModel, payload }) => {
  try {
    const Model = targetModel === 'User' ? User : Engineer;
    const entity = await Model.findById(targetId).select('fcmTokens').lean();

    if (!entity || !entity.fcmTokens || entity.fcmTokens.length === 0) {
      console.log(`[NotificationService] No FCM tokens found for ${targetModel} ${targetId}`);
      return { success: true, sentCount: 0 };
    }

    const tokens = entity.fcmTokens.map(t => t.token);

    // Prepare FCM message
    const message = {
      notification: payload.notification,
      data: payload.data || {},
      tokens: tokens,
    };

    // Use fire-and-forget for sending to avoid blocking main flow
    setImmediate(async () => {
      try {
        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`[NotificationService] Sent push to ${targetModel} ${targetId}. Success: ${response.successCount}, Failure: ${response.failureCount}`);

        // Token Cleanup logic
        if (response.failureCount > 0) {
          const tokensToRemove = [];
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const errorCode = resp.error?.code;
              // Cleanup tokens that are no longer valid
              if (
                errorCode === 'messaging/registration-token-not-registered' ||
                errorCode === 'messaging/invalid-registration-token'
              ) {
                tokensToRemove.push(tokens[idx]);
              }
              console.error(`[NotificationService] Push failure for token ${tokens[idx]}:`, resp.error);
            }
          });

          if (tokensToRemove.length > 0) {
            await Model.findByIdAndUpdate(targetId, {
              $pull: { fcmTokens: { token: { $in: tokensToRemove } } }
            });
            console.log(`[NotificationService] Pruned ${tokensToRemove.length} invalid tokens for ${targetModel} ${targetId}`);
          }
        }
      } catch (sendError) {
        console.error(`[NotificationService] Batch send error for ${targetModel} ${targetId}:`, sendError);
      }
    });

    return { success: true, queued: true };
  } catch (error) {
    console.error(`[NotificationService] Initialization error for ${targetModel} ${targetId}:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Sends a notification to multiple targets (Engineers or Users) efficiently.
 */
export const sendBatchPushNotification = async ({ targetIds, targetModel, payload }) => {
  try {
    const Model = targetModel === 'User' ? User : Engineer;
    
    // Fetch all tokens for all targets in one query
    const entities = await Model.find({ _id: { $in: targetIds } }).select('_id fcmTokens').lean();
    
    if (!entities || entities.length === 0) {
      console.log(`[NotificationService] No targets found for batch push`);
      return { success: true, sentCount: 0 };
    }

    // Map targets to their tokens for later cleanup if needed
    const tokenMap = {}; // token -> targetId
    const allTokens = [];

    entities.forEach(entity => {
      if (entity.fcmTokens) {
        entity.fcmTokens.forEach(t => {
          allTokens.push(t.token);
          tokenMap[t.token] = entity._id;
        });
      }
    });

    if (allTokens.length === 0) {
      console.log(`[NotificationService] No FCM tokens found for batch`);
      return { success: true, sentCount: 0 };
    }

    // Prepare FCM multicast message
    const message = {
      notification: payload.notification,
      data: payload.data || {},
      tokens: allTokens,
    };

    setImmediate(async () => {
      try {
        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`[NotificationService] Batch sent. Success: ${response.successCount}, Failure: ${response.failureCount}`);

        if (response.failureCount > 0) {
          const cleanupMap = {}; // targetId -> [tokens]

          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const token = allTokens[idx];
              const targetId = tokenMap[token];
              const errorCode = resp.error?.code;

              if (
                errorCode === 'messaging/registration-token-not-registered' ||
                errorCode === 'messaging/invalid-registration-token'
              ) {
                if (!cleanupMap[targetId]) cleanupMap[targetId] = [];
                cleanupMap[targetId].push(token);
              }
              console.error(`[NotificationService] Batch failure for token ${token} (Target: ${targetId}):`, resp.error);
            }
          });

          // Perform cleanup for each affected target
          const cleanupPromises = Object.entries(cleanupMap).map(([id, tokens]) => 
            Model.findByIdAndUpdate(id, {
              $pull: { fcmTokens: { token: { $in: tokens } } }
            })
          );
          await Promise.all(cleanupPromises);
          console.log(`[NotificationService] Pruned invalid tokens for ${Object.keys(cleanupMap).length} entities`);
        }
      } catch (sendError) {
        console.error(`[NotificationService] Multicast send error:`, sendError);
      }
    });

    return { success: true, queued: true };
  } catch (error) {
    console.error(`[NotificationService] Batch initialization error:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Shorthand for User notifications
 */
export const sendPushToUser = (userId, payload) => {
  return sendPushNotification({ targetId: userId, targetModel: 'User', payload });
};

/**
 * Shorthand for Engineer notifications
 */
export const sendPushToEngineer = (engineerId, payload) => {
  return sendPushNotification({ targetId: engineerId, targetModel: 'Engineer', payload });
};

/**
 * Shorthand for Bulk Engineer notifications
 */
export const sendPushToMatchedEngineers = (engineerIds, payload) => {
  return sendBatchPushNotification({ targetIds: engineerIds, targetModel: 'Engineer', payload });
};
