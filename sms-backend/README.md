# SMS OTP Backend (Copy and run)

Backend OTP API for app endpoints:
- `POST /api/send-otp`
- `POST /api/verify-otp`

Uses Twilio Verify to send/verify SMS OTP.

## 1) Quick run

```bash
cd sms-backend
npm install
copy .env.example .env
```

Edit `.env`:

```env
PORT=3000
FRONTEND_ORIGIN=*
SMS_API_KEY=change_me_to_a_strong_key
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_VERIFY_SERVICE_SID=VA...
```

Start server:

```bash
npm run dev
```

Health check:

`GET http://localhost:3000/health`

## 2) Connect app to this backend

In app root `.env` set:

```env
EXPO_PUBLIC_SMS_API_BASE_URL=http://10.0.2.2:3000
EXPO_PUBLIC_SMS_API_KEY=change_me_to_a_strong_key
EXPO_PUBLIC_SMS_API_TIMEOUT_MS=12000
```

Notes:
- Android emulator uses `10.0.2.2` to reach your PC localhost.
- Real device must use your LAN IP, e.g. `http://192.168.1.50:3000`.

Restart app bundler after env changes:

```bash
npx expo start -c
```

## 3) Required request format

### Send OTP
`POST /api/send-otp`

```json
{
  "phoneNumber": "0901234567"
}
```

### Verify OTP
`POST /api/verify-otp`

```json
{
  "phoneNumber": "0901234567",
  "otp": "123456"
}
```
