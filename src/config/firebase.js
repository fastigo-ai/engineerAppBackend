import admin from "firebase-admin";

let isFirebaseConnected = false;
try {
  admin.initializeApp({
    credential: admin.credential.cert({
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/"/g, "").replace(/\\n/g, "\n"),
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
