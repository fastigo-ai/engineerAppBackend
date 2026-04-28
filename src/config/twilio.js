import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;


if (!accountSid || !authToken || !verifySid) {
    console.warn('Twilio Verify credentials not configured. OTP functionality will not work.');
    console.warn('Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID');
}

let twilioClient;
try {
  if (accountSid && accountSid.startsWith('AC')) {
    twilioClient = twilio(accountSid, authToken);
  } else {
    console.warn("Twilio credentials missing or invalid. OTP services will not work.");
    twilioClient = null;
  }
} catch (error) {
  console.warn("Twilio initialization failed.");
  twilioClient = null;
}

export { twilioClient, verifySid };
