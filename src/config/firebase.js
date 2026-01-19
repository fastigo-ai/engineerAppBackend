import admin from "firebase-admin";

let isFirebaseConnected = false;
 try {  
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });

  console.log("🚀 Firebase Admin: ✅ Connected successfully!");
  isFirebaseConnected = true;
} catch (err) {
  console.error("🚨 Firebase Admin: ❌ Initialization failed!");
  console.error("Reason:", err.message);
  isFirebaseConnected = false;
}

export { admin, isFirebaseConnected };
