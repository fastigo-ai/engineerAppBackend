// Export routes
export { default as notificationRoutes } from './api/notification.routes.js';

// Export Facade (for sending notifications)
export * from './core/notification.facade.js';

// Export Cron & Worker starters (for server.js)
export { startNotificationWorker } from './infrastructure/notification.worker.js';
export { startAllNotificationCrons } from './infrastructure/notification.cron.js';

// Export Models
export { default as Notification } from './core/Notification.model.js';
export { default as DeviceToken } from './core/DeviceToken.model.js';

// Export Providers
export * from './providers/webPush.service.js';
