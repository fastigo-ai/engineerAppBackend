import { AuthRepository } from "../repositories/authRepository.js";

const authRepo = new AuthRepository();

export const sendOTPService = async (phone) => {
  if (!phone) throw new Error("Phone number is required");

  const otp = "1234"; 
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); 

  await authRepo.saveOTP(phone, otp, expiresAt);
  return { phone, otp }; 
};

export const verifyOTPService = async (phone, otp) => {
  const savedOTP = await authRepo.getOTP(phone);
  if (!savedOTP) throw new Error("OTP expired or not found");
  if (savedOTP.otp !== otp) throw new Error("Invalid OTP");

  await authRepo.deleteOTP(phone);
  return { phone, verified: true };
};
