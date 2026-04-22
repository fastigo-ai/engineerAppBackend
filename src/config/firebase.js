import admin from "firebase-admin";
import dotenv from "dotenv";
dotenv.config();

let isFirebaseConnected = false;
try {
  let rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
  // Remove all types of surrounding quotes and trim
  const privateKey = rawKey
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\r/g, '')
    .trim();

  console.log(`[FirebaseConfig] Attempting to initialize with key length: ${privateKey?.length}`);

  console.log(`[FirebaseConfig] Project ID: "${process.env.FIREBASE_PROJECT_ID}"`);
  console.log(`[FirebaseConfig] Client Email: "${process.env.FIREBASE_CLIENT_EMAIL}"`);
  console.log(`[FirebaseConfig] Private Key Sample: ${privateKey?.substring(0, 30)}...${privateKey?.substring(privateKey.length - 30)}`);

  admin.initializeApp({
    credential: admin.credential.cert({

      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/"/g, "").replace(/\\n/g, "\n"),

    }),
  });

  console.log(" Firebase Admin: Connected successfully!");
  isFirebaseConnected = true;
} catch (err) {
  console.error(" Firebase Admin:  Initialization failed!");
  console.error("Reason:", err.message);
  isFirebaseConnected = false;
}

export { admin, isFirebaseConnected };
