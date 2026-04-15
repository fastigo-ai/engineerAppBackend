/**
 * Notification Registry
 * Centralized templates for all system notifications to ensure consistency and modularity.
 */

export const NOTIFICATION_TEMPLATES = {
  // --- Booking Phase ---
  BOOKING_CONFIRMED: {
    title: 'Booking Confirmed!',
    body: 'Your booking for {{serviceName}} has been confirmed. We are searching for the best engineer for you.',
    type: 'ORDER_UPDATE',
  },
  BOOKING_RESCHEDULED: {
    title: 'Booking Rescheduled',
    body: 'Your booking for {{serviceName}} has been rescheduled to {{newTime}}.',
    type: 'ORDER_UPDATE',
  },
  BOOKING_CANCELLED: {
    title: 'Booking Cancelled',
    body: 'Your booking for {{serviceName}} has been cancelled successfully.',
    type: 'ORDER_UPDATE',
  },

  // --- Engineer Phase ---
  ENGINEER_ASSIGNED: {
    title: 'Engineer Assigned!',
    body: '{{engineerName}} has been assigned to your request and will arrive at your scheduled time.',
    type: 'MATCHING',
  },
  ENGINEER_EN_ROUTE: {
    title: 'Engineer on the way!',
    body: '{{engineerName}} is heading to your location for the {{serviceName}} job.',
    type: 'MATCHING',
  },
  ENGINEER_ARRIVED: {
    title: 'Engineer Arrived',
    body: '{{engineerName}} has reached your location.',
    type: 'MATCHING',
  },

  // --- Job Phase ---
  JOB_STARTED: {
    title: 'Job Started',
    body: 'Your service for {{serviceName}} has officially started.',
    type: 'SYSTEM',
  },
  JOB_COMPLETED: {
    title: 'Service Completed!',
    body: 'We hope you had a great experience. Your {{serviceName}} job is now finished.',
    type: 'SYSTEM',
  },

  // --- Payment Phase ---
  PAYMENT_RECEIVED: {
    title: 'Payment Received',
    body: 'Thank you! We have received your payment of ₹{{amount}} for order {{orderId}}.',
    type: 'PAYMENT',
  },
  REFUND_PROCESSED: {
    title: 'Refund Processed',
    body: 'A refund of ₹{{amount}} has been processed for your order {{orderId}}.',
    type: 'PAYMENT',
  },

  // --- System ---
  OTP_REreminder: {
    title: 'OTP Verification',
    body: 'Please share the OTP {{otp}} with your engineer to start/complete the job.',
    type: 'SYSTEM',
  }
};

/**
 * Formats a template with provided data
 */
export function formatTemplate(eventKey, data = {}) {
  const template = NOTIFICATION_TEMPLATES[eventKey];
  if (!template) return null;

  let body = template.body;
  Object.entries(data).forEach(([key, value]) => {
    body = body.replace(new RegExp(`{{${key}}}`, 'g'), value);
  });

  return {
    title: template.title,
    body: body,
    type: template.type,
  };
}
