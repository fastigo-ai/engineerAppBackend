import nodemailer from 'nodemailer';
import { logger } from '../config/logger.js'; // Assuming there is a logger in config

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.titan.email',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'akhil@door2fy.in',
    pass: process.env.SMTP_PASS || 'Akhil@2026',
  },
});

/**
 * Send an email notification to the admin when an order is confirmed/created.
 * @param {Object} order - The order object
 * @param {String} type - 'USER' or 'VENDOR'
 */
export const sendAdminOrderNotification = async (order, type) => {
  try {
    let subject = '';
    let htmlContent = '';

    if (type === 'USER') {
      subject = `New User Order Confirmed: ${order.orderId}`;
      const amount = order.amount || 0;
      const paymentMethod = order.paymentMode || 'ONLINE';
      
      let serviceNames = 'N/A';
      if (order.bookingDetails && order.bookingDetails.services) {
        serviceNames = order.bookingDetails.services.map(s => s.name).join(', ');
      } else if (order.servicePlans && order.servicePlans.length > 0) {
        // Fallback if populated
        serviceNames = order.servicePlans.map(sp => sp.name || 'Unknown Service').join(', ');
      }

      htmlContent = `
        <h2>New User Order Confirmed</h2>
        <p><strong>Order ID:</strong> ${order.orderId || order._id}</p>
        <p><strong>Service Type:</strong> ${serviceNames}</p>
        <p><strong>Amount:</strong> ₹${amount}</p>
        <p><strong>Payment Method:</strong> ${paymentMethod}</p>
        <p><strong>User ID:</strong> ${order.userId}</p>
        ${order.customerDetails ? `<p><strong>Customer:</strong> ${order.customerDetails.name} (${order.customerDetails.phone})</p>` : ''}
      `;
    } else if (type === 'VENDOR') {
      subject = `New Vendor Order Placed: ${order.call_id}`;
      const amount = order.order_price || 0;
      const paymentMethod = 'Vendor Account'; // Usually handled differently for vendors
      
      const serviceType = `${order.support_type || 'N/A'} - ${order.asset_type || 'N/A'}`;
      
      htmlContent = `
        <h2>New Vendor Order Placed</h2>
        <p><strong>Call ID (Order ID):</strong> ${order.call_id}</p>
        <p><strong>Internal ID:</strong> ${order._id}</p>
        <p><strong>Service Type:</strong> ${serviceType}</p>
        <p><strong>Amount:</strong> ₹${amount}</p>
        <p><strong>Payment Method:</strong> ${paymentMethod}</p>
        <p><strong>Vendor ID:</strong> ${order.vendor_id}</p>
        <p><strong>Project ID:</strong> ${order.projectId || 'N/A'}</p>
        <p><strong>Branch:</strong> ${order.branch_name || 'N/A'} (${order.state_name || 'N/A'})</p>
      `;
    } else {
      return; // Unknown type
    }

    const mailOptions = {
      from: '"Door2fy System" <akhil@door2fy.in>',
      to: 'akhil@door2fy.in',
      subject: subject,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    if (logger && logger.info) {
      logger.info(`Admin notification email sent: ${info.messageId}`);
    } else {
      console.log(`Admin notification email sent: ${info.messageId}`);
    }
  } catch (error) {
    if (logger && logger.error) {
      logger.error('Error sending admin order notification email: ' + error.message);
    } else {
      console.error('Error sending admin order notification email:', error);
    }
  }
};
