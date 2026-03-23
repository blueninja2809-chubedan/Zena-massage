# SUPABASE + TWILIO OTP SETUP (A-Z)

Hướng dẫn này dùng cho app React Native native build, không cần Expo Go.

## 1) Tạo Supabase project

1. Vào [Supabase Dashboard](https://supabase.com/dashboard) và tạo project mới.
2. Chờ project `ACTIVE`.
3. Vào `Project Settings -> API` lấy:
   - `Project URL`
   - `anon public key`
   - `service_role key` (chỉ dùng server/admin, không nhúng app).

## 2) Bật Auth theo Email (mặc định)

1. Vào `Authentication -> Providers -> Email`.
2. Bật `Email` (thường đã bật sẵn).
3. (Tùy chọn) Bật `Confirm email` nếu muốn xác minh email trước khi đăng nhập.

## 3) Tạo schema database

1. Vào `SQL Editor`.
2. Mở file `supabase/migrations/001_init.sql`.
3. Chạy toàn bộ SQL.

## 4) Cấu hình env cho app

Tạo/cập nhật `.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
EXPO_PUBLIC_SUPABASE_SCHEMA=public
```

## 5) Cấu hình test số OTP (khuyến nghị)

Trong giai đoạn dev:
- Vào `Authentication -> Phone` và thêm test numbers (nếu cần).
- Hoặc dùng số thật đã enable trong Twilio Verify.

## 6) Chạy app native

```bash
npx expo start --dev-client -c
```

Terminal khác:

```bash
npx expo run:android --no-bundler
```

## 7) Flow auth đã triển khai trong app

- **Đăng ký**: Email + mật khẩu -> nhập thông tin (tên, số điện thoại, giới tính, quốc tịch, khu vực).
- **Đăng nhập**: Email + mật khẩu.
- Profile app được lưu ở bảng `profiles`.

## 8) Quản trị app trên Supabase

- Dữ liệu nghiệp vụ ở bảng:
  - `profiles`
  - `services`
  - `therapists`
  - `promotions`
  - `partner_applications`
  - `bookings`
  - `reviews`
  - `addresses`
  - `notifications`
- Admin thao tác trực tiếp ở `Table Editor` hoặc viết SQL.

## 9) Sửa lỗi "permission denied for table therapists/services/promotions"

Nếu app log ra lỗi kiểu:
- `permission denied for table therapists`
- `Supabase unavailable for therapists/services/promotions`

Thì project Supabase chưa apply đủ policy/grant cho role `anon`.

### Cách sửa nhanh

1. Vào `Supabase -> SQL Editor`.
2. Chạy file: `supabase/migrations/002_fix_public_catalog_access.sql`.
3. Reload app.

Migration này sẽ:
- Grant quyền `SELECT` cho role `anon` và `authenticated` trên bảng catalog.
- Recreate RLS policies `public read`.
- Seed dữ liệu mẫu tối thiểu nếu bảng đang trống.

