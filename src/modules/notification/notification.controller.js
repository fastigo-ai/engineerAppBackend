import { catchAsync } from '../../utils/catchAsync.js';
import DeviceToken from './DeviceToken.model.js';
import Notification from './Notification.model.js';
import User from '../../models/user.js';
import { Engineer } from '../../models/engineersModal.js';

/**
 * Register/Update a device token
 */
export const registerDevice = catchAsync(async (req, res) => {
  const { fcmToken, platform, deviceId, appVersion } = req.body;
  const userId = req.user?._id || req.user?.id;
  const userModel = (req.user?.role === 'engineer' || req.engineer) ? 'Engineer' : 'User';

  if (!fcmToken || !platform || !deviceId) {
    return res.status(400).json({ success: false, message: 'Missing required device information' });
  }

  // OWNERSHIP GUARD: If this token belongs to someone else, deactivate it for them
  // This handles the "hijacking" or "shared device" scenario.
  await DeviceToken.updateMany(
    { fcmToken, $or: [{ userId: { $ne: userId } }, { userModel: { $ne: userModel } }] },
    { isActive: false, invalidatedAt: new Date() }
  );

  // Update/Upsert DeviceToken document
  const token = await DeviceToken.findOneAndUpdate(
    { deviceId, userId, userModel },
    {
      fcmToken,
      platform,
      appVersion,
      isActive: true,
      lastSeenAt: new Date(),
      invalidatedAt: null,
    },
    { upsert: true, new: true }
  );

  // For backward compatibility, also update the old fcmTokens array in User/Engineer model
  const Model = userModel === 'Engineer' ? Engineer : User;
  const existingToken = await Model.findOne({ _id: userId, 'fcmTokens.token': fcmToken });

  if (!existingToken) {
    await Model.findByIdAndUpdate(userId, {
      $addToSet: {
        fcmTokens: {
          token: fcmToken,
          device: platform,
          lastUsed: new Date()
        }
      }
    });
  } else {
    await Model.updateOne(
      { _id: userId, 'fcmTokens.token': fcmToken },
      { $set: { 'fcmTokens.$.lastUsed': new Date() } }
    );
  }

  res.status(200).json({ success: true, data: token });
});

/**
 * Unregister a device token (logout)
 */
export const unregisterDevice = catchAsync(async (req, res) => {
  const { deviceId, fcmToken } = req.body;
  const userId = req.user?._id || req.user?.id;
  const userModel = (req.user?.role === 'engineer' || req.engineer) ? 'Engineer' : 'User';

  const query = deviceId ? { deviceId, userId, userModel } : { fcmToken, userId, userModel };

  await DeviceToken.findOneAndUpdate(query, {
    isActive: false,
    invalidatedAt: new Date()
  });

  // Also remove from old array
  const Model = userModel === 'Engineer' ? Engineer : User;
  if (fcmToken) {
    await Model.findByIdAndUpdate(userId, {
      $pull: { fcmTokens: { token: fcmToken } }
    });
  }

  res.status(200).json({ success: true, message: 'Device unregistered successfully' });
});

/**
 * Mark a notification as opened
 */
export const markOpened = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const userModel = (req.user?.role === 'engineer' || req.engineer) ? 'Engineer' : 'User';

  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId, userModel },
    { openedAt: new Date() },
    { new: true }
  );

  if (!notification) {
    return res.status(404).json({ success: false, message: 'Notification not found' });
  }

  res.status(200).json({ success: true });
});

/**
 * Get notification history for the current user
 */
export const getHistory = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const userModel = (req.user?.role === 'engineer' || req.engineer) ? 'Engineer' : 'User';

  const notifications = await Notification.find({
    userId,
    userModel,
    status: 'SENT',
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .select('type title body data openedAt createdAt')
    .lean();

  res.status(200).json({ success: true, data: notifications });
});
