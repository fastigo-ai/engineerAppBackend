const otpStore = [];
  
export class AuthRepository {
    async saveOTP(phone, otp, expiresAt) {
      otpStore.push({ phone, otp, expiresAt });
      return { phone, otp, expiresAt };
    }
  
    async getOTP(phone) {
      const entry = otpStore.find((o) => o.phone === phone && o.expiresAt > new Date());
      return entry || null;
    }
  
    async deleteOTP(phone) {
      const index = otpStore.findIndex((o) => o.phone === phone);
      if (index !== -1) otpStore.splice(index, 1);
    }
  }
  