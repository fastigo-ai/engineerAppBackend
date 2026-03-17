
import Razorpay from "razorpay";
import config from "./config.js";

let razorpay;
try {
  razorpay = new Razorpay({
    key_id: config.razorpay.key_id || "mock",
    key_secret: config.razorpay.key_secret || "mock",
  });
} catch (error) {
  console.warn("⚠️ Razorpay initialization failed. Payments will not work.");
  razorpay = null;
}

export default razorpay;
