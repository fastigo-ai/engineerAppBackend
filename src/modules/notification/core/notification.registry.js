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

  ENGINEER_DECLINED_REASSIGNING: {
    title: 'Expert Matching...',
    body: 'The assigned professional declined your {{serviceName}} order. We are searching for a new nearby expert for you.',
    type: 'MATCHING',
  },

  // --- Job Phase ---
  JOB_STARTED: {
    title: 'Service Started',
    body: 'Your service for {{serviceName}} has officially started. Please share the OTP {{otp}} with the expert to complete the job.',
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
  ENGINEER_PAYMENT_RECEIVED: {
    title: 'Payment Confirmed!',
    body: 'Great news! Customer has paid ₹{{amount}} for order {{orderId}}. You can now mark the job as finished if not already done.',
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
  },
  SEARCHING_DELAYED: {
    title: 'Expert Not Available',
    body: "We couldn't find an expert for your scheduled {{serviceName}} at the moment. Please reschedule your booking or cancel for a full refund.",
    type: 'ORDER_UPDATE',
  },
  ENGINEER_NOSHOW_PING: {
    title: 'Are you coming?',
    body: 'Hi {{name}}, you have a scheduled job starting now. Please update your status or reach the location immediately.',
    type: 'MATCHING',
  },
  USER_NOSHOW_ALERT: {
    title: 'Professional Unavailable',
    body: 'The assigned professional for your {{serviceName}} is unable to reach your location due to some technical issues. You can now reschedule this booking or cancel it for a full refund.',
    type: 'ORDER_UPDATE',
  },
  ENGINEER_REMINDER_5M: {
    title: 'Upcoming Order!',
    body: 'Hi {{name}}, you have a scheduled order for {{serviceName}} starting in 5 minutes. Please reach location on time.',
    type: 'MATCHING',
  },
  QUICK_REPLY: {
    title: 'Message from Expert',
    body: '{{message}}',
    type: 'ORDER_UPDATE',
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
