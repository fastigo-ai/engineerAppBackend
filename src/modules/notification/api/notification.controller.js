import { catchAsync } from '../../../utils/catchAsync.js';
import * as service from '../core/notification.service.js';
import Notification from '../core/Notification.model.js';
import DeviceToken from '../core/DeviceToken.model.js';
import User from '../../auth/user/user.model.js';
import { Engineer } from "../../auth/engineer/engineer.model.js";

/**
 * Register/Update a device token
 */
export const registerDevice = catchAsync(async (req, res) => {
  const { fcmToken, platform, deviceId, appVersion } = req.body;
  const userId = req.user?._id || req.user?.id;
  const userModel = (req.user?.role === 'engineer' || req.engineer) ? 'Engineer' : 'User';

  if (!fcmToken) {
    return res.status(400).json({ success: false, message: 'FCM token is required' });
  }

  const token = await service.syncDeviceToken({
    userId,
    userModel,
    fcmToken,
    platform,
    deviceId,
    appVersion
  });

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
    is_deleted: { $ne: true }
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .select('type title body data openedAt createdAt')
    .lean();

  res.status(200).json({ success: true, data: notifications });
});

/**
 * Get unread notification count for the current user
 */
export const getUnreadCount = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const userModel = (req.user?.role === 'engineer' || req.engineer) ? 'Engineer' : 'User';

  const count = await Notification.countDocuments({
    userId,
    userModel,
    status: 'SENT',
    openedAt: null,
    is_deleted: { $ne: true }
  });

  res.status(200).json({ success: true, data: { count } });
});

/**
 * Admin: Send individual or list of notifications with staggering
 */
export const adminSendNotification = catchAsync(async (req, res) => {
  const {
    userIds,
    userModel = 'User',
    type = 'SYSTEM',
    title,
    body,
    image,
    screen,
    data = {},
    scheduledAt,
    batchSize,
    staggerMinutes = 0
  } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ success: false, message: 'Array of userIds is required' });
  }

  const Model = userModel === 'Engineer' ? Engineer : User;
  const users = await Model.find({ _id: { $in: userIds } }).select('_id name').lean();
  const userMap = users.reduce((acc, u) => {
    acc[u._id.toString()] = u.name;
    return acc;
  }, {});

  const baseDelayMs = scheduledAt ? Math.max(0, new Date(scheduledAt).getTime() - Date.now()) : 0;
  const effectiveBatchSize = batchSize || userIds.length;

  const docs = [];
  userIds.forEach((userId, index) => {
    const batchIndex = Math.floor(index / effectiveBatchSize);
    const staggerDelayMs = batchIndex * (staggerMinutes * 60000);

    const userName = userMap[userId.toString()] || 'User';
    const personalizedTitle = title.replace(/{name}/g, userName);
    const personalizedBody = body.replace(/{name}/g, userName);

    docs.push({
      userId,
      userModel,
      type,
      title: personalizedTitle,
      body: personalizedBody,
      image,
      screen,
      data,
      status: 'PENDING',
      nextRunAt: new Date(Date.now() + baseDelayMs + staggerDelayMs)
    });
  });

  const CHUNK_SIZE = 500;
  for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
    await Notification.insertMany(docs.slice(i, i + CHUNK_SIZE), { ordered: false });
  }

  res.status(200).json({
    success: true,
    message: `Enqueued ${docs.length} notifications`,
    data: { count: docs.length }
  });
});

/**
 * Admin: Run a targeted campaign with staggering
 */
export const adminSendCampaign = catchAsync(async (req, res) => {
  const {
    target,
    segment,
    city,
    userModel = 'User',
    type = 'PROMO',
    title,
    body,
    image,
    screen,
    data = {},
    scheduledAt,
    batchSize,
    staggerMinutes = 0
  } = req.body;

  if (!title || !body) {
    return res.status(400).json({ success: false, message: 'Title and body are required' });
  }

  const query = {};
  if (target === 'city' && city) {
    query.city = city;
  }

  const Model = userModel === 'Engineer' ? Engineer : User;
  const users = await Model.find(query).select('_id name').lean();
  let targetUsers = users;

  if (target === 'segment' && segment) {
    const { getUserSegment } = await import('../../user/user.segment.js');
    const filteredResults = await Promise.all(
      users.map(async (u) => {
        const s = await getUserSegment(u._id);
        return s === segment ? u : null;
      })
    );
    targetUsers = filteredResults.filter(u => u !== null);
  }

  if (targetUsers.length === 0) {
    return res.status(200).json({ success: true, message: 'No users matched', data: { count: 0 } });
  }

  const baseDelayMs = scheduledAt ? Math.max(0, new Date(scheduledAt).getTime() - Date.now()) : 0;
  const effectiveBatchSize = batchSize || targetUsers.length;

  const docs = targetUsers.map((user, index) => {
    const batchIndex = Math.floor(index / effectiveBatchSize);
    const staggerDelayMs = batchIndex * (staggerMinutes * 60000);

    // Personalization replacement
    const personalizedTitle = title.replace(/{name}/g, user.name || 'User');
    const personalizedBody = body.replace(/{name}/g, user.name || 'User');

    return {
      userId: user._id,
      userModel,
      type,
      title: personalizedTitle,
      body: personalizedBody,
      image,
      screen,
      data,
      status: 'PENDING',
      nextRunAt: new Date(Date.now() + baseDelayMs + staggerDelayMs),
    };
  });

  const CHUNK_SIZE = 500;
  for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
    await Notification.insertMany(docs.slice(i, i + CHUNK_SIZE), { ordered: false });
  }

  res.status(200).json({
    success: true,
    message: `Campaign started: ${docs.length} notifications enqueued`,
    data: { count: docs.length }
  });
});

/**
 * Admin: Get paginated notification history
 */
export const adminGetHistory = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, search = '', type, status } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = { is_deleted: { $ne: true } };
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { body: { $regex: search, $options: 'i' } }
    ];
  }
  if (type) query.type = type;
  if (status) query.status = status;

  const notifications = await Notification.find(query)
    .populate('userId', 'name mobile')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await Notification.countDocuments(query);
  const opened = await Notification.countDocuments({ ...query, openedAt: { $ne: null } });

  res.status(200).json({
    success: true,
    data: notifications,
    stats: {
      total,
      opened,
      openRate: total > 0 ? ((opened / total) * 100).toFixed(1) : 0
    },
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});

/**
 * Delete a specific notification (Soft delete)
 */
export const deleteNotification = catchAsync(async (req, res) => {
  // ... existing delete logic ...
  const query = { _id: req.params.id };
  // If admin, we don't need userId check
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    query.userId = req.user.id;
  }

  const notification = await Notification.findOneAndUpdate(
    query,
    { is_deleted: true },
    { new: true }
  );

  if (!notification) {
    return res.status(404).json({ success: false, message: 'Notification not found' });
  }

  res.status(200).json({ success: true, message: 'Notification deleted successfully' });
});

/**
 * Clear all notifications for the current user (Soft delete)
 */
export const clearAllNotifications = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const userModel = (req.user?.role === 'engineer' || req.engineer) ? 'Engineer' : 'User';

  await Notification.updateMany(
    { userId, userModel, is_deleted: { $ne: true } },
    { is_deleted: true }
  );

  res.status(200).json({ success: true, message: 'All notifications cleared successfully' });
});

