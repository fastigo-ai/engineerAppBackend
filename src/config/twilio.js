import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;


console.log(accountSid, authToken, verifySid);

if (!accountSid || !authToken || !verifySid) {
    console.warn('⚠️  Twilio Verify credentials not configured. OTP functionality will not work.');
    console.warn('Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID');
}

const twilioClient = twilio(accountSid, authToken);

export { twilioClient, verifySid };
