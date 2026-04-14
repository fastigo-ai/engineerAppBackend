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

/**
 * Admin: Send individual or list of notifications
 */
export const adminSendNotification = catchAsync(async (req, res) => {
  const { userIds, userModel, type, title, body, data, scheduledAt } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ success: false, message: 'Array of userIds is required' });
  }

  const delayMs = scheduledAt ? Math.max(0, new Date(scheduledAt).getTime() - Date.now()) : 0;

  // Use Bulk for efficiency even if it's 1 user
  const result = await Notification.insertMany(userIds.map(id => ({
    userId: id,
    userModel: userModel || 'User',
    type: type || 'SYSTEM',
    title,
    body,
    data: data || {},
    status: 'PENDING',
    nextRunAt: new Date(Date.now() + delayMs)
  })));

  res.status(200).json({
    success: true,
    message: `Enqueued ${result.length} notifications`,
    data: { count: result.length }
  });
});

/**
 * Admin: Run a targeted campaign
 */
export const adminSendCampaign = catchAsync(async (req, res) => {
  const { 
    target, // 'all' | 'segment' | 'city'
    segment, // 'NEW' | 'ACTIVE' | 'INACTIVE' | 'VIP'
    city,
    userModel = 'User',
    type = 'PROMO',
    title,
    body,
    data = {},
    scheduledAt 
  } = req.body;

  if (!title || !body) {
    return res.status(400).json({ success: false, message: 'Title and body are required' });
  }

  const query = {};
  if (target === 'city' && city) {
    query.city = city;
  }

  // Fetch candidate users
  const Model = userModel === 'Engineer' ? Engineer : User;
  const users = await Model.find(query).select('_id').lean();
  let targetUserIds = users.map(u => u._id);

  // Apply segment filtering if requested
  if (target === 'segment' && segment) {
    const { getUserSegment } = await import('../user/user.segment.js');
    const filteredResults = await Promise.all(
      targetUserIds.map(async (id) => {
        const s = await getUserSegment(id);
        return s === segment ? id : null;
      })
    );
    targetUserIds = filteredResults.filter(id => id !== null);
  }

  if (targetUserIds.length === 0) {
    return res.status(200).json({ success: true, message: 'No users matched the targeting criteria', data: { count: 0 } });
  }

  const delayMs = scheduledAt ? Math.max(0, new Date(scheduledAt).getTime() - Date.now()) : 0;

  const docs = targetUserIds.map(userId => ({
    userId,
    userModel,
    type,
    title,
    body,
    data,
    status: 'PENDING',
    nextRunAt: new Date(Date.now() + delayMs),
  }));

  // Chunk insert for very large campaigns to prevent memory spikes
  const CHUNK_SIZE = 500;
  for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
    const chunk = docs.slice(i, i + CHUNK_SIZE);
    await Notification.insertMany(chunk, { ordered: false });
  }

  res.status(200).json({
    success: true,
    message: `Campaign started: Enqueued ${docs.length} notifications`,
    data: { count: docs.length }
  });
});
