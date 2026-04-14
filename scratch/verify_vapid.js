import webpush from 'web-push';
import dotenv from 'dotenv';
import path from 'path';

// Fix for ESM __dirname
const __dirname = path.resolve();
dotenv.config({ path: path.join(__dirname, '.env') });

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

console.log('Public Key:', publicKey);
console.log('Private Key:', privateKey ? '***' : 'Missing');

if (!publicKey || !privateKey) {
  console.error('Keys are missing in .env');
  process.exit(1);
}

try {
  webpush.setVapidDetails(
    'mailto:admin@door2fy.com',
    publicKey,
    privateKey
  );
  console.log('VAPID signing verified successfully!');
  process.exit(0);
} catch (error) {
  console.error('VAPID verification failed:', error.message);
  process.exit(1);
}
