/**
 * Đặt `EXPO_PUBLIC_SMS_OTP_SIGNUP=false` trong `.env` / EAS env để tắt gửi & xác thực OTP SMS (VietGuys)
 * khi đăng ký; luồng chỉ còn SĐT + mật khẩu qua Supabase.
 * Cần rebuild native (EAS) — biến EXPO_PUBLIC_* được embed lúc bundle.
 */
export const SMS_OTP_SIGNUP_ENABLED = process.env.EXPO_PUBLIC_SMS_OTP_SIGNUP !== 'false';
