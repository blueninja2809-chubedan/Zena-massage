# SMS OTP Setup Guide

## ✅ What's Done

The app now has:
- ✅ 6-digit OTP validation (already working)
- ✅ SMS service file created with API integration ready
- ✅ SignUpScreen updated to call real SMS API instead of mock delays

## 📱 What You Need to Do

### Step 1: Create a Backend API

You need to create a simple backend server with two endpoints:

**Option A: Node.js + Express + Twilio (Recommended)**

1. Create a new folder for your backend:
```bash
mkdir massage-now-backend
cd massage-now-backend
npm init -y
npm install express dotenv twilio cors
```

2. Create `.env` file:
```
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
PORT=3000
```

3. Create `server.js`:
```javascript
const express = require('express');
const twilio = require('twilio');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const otpStore = {}; // In production, use database like MongoDB

// Generate 6-digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP endpoint
app.post('/api/send-otp', async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    // Validate phone number format
    if (!phoneNumber || phoneNumber.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number',
      });
    }

    const otp = generateOtp();
    otpStore[phoneNumber] = {
      code: otp,
      createdAt: Date.now(),
      attempts: 0,
    };

    // Send SMS via Twilio
    // Phone number must include country code: +84971234567 (for Vietnam)
    await client.messages.create({
      body: `Mã OTP của bạn là: ${otp}. Không chia sẻ mã này với ai.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    });

    res.json({
      success: true,
      message: 'Mã OTP đã được gửi tới số điện thoại của bạn',
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể gửi mã OTP',
      error: error.message,
    });
  }
});

// Verify OTP endpoint
app.post('/api/verify-otp', async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    const otpData = otpStore[phoneNumber];

    if (!otpData) {
      return res.status(400).json({
        success: false,
        message: 'Mã OTP không tìm thấy hoặc đã hết hạn',
      });
    }

    // Check if OTP expired (10 minutes)
    if (Date.now() - otpData.createdAt > 10 * 60 * 1000) {
      delete otpStore[phoneNumber];
      return res.status(400).json({
        success: false,
        message: 'Mã OTP đã hết hạn',
      });
    }

    // Check max attempts (3 attempts)
    if (otpData.attempts >= 3) {
      delete otpStore[phoneNumber];
      return res.status(400).json({
        success: false,
        message: 'Vượt quá số lần thử. Vui lòng yêu cầu mã OTP mới',
      });
    }

    if (otpData.code !== otp) {
      otpData.attempts++;
      return res.status(400).json({
        success: false,
        message: 'Mã OTP không chính xác',
      });
    }

    // OTP verified successfully
    delete otpStore[phoneNumber];
    res.json({
      success: true,
      message: 'Xác nhận mã OTP thành công',
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: 'Không thể xác nhận mã OTP',
      error: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

4. Run the server:
```bash
node server.js
```

### Step 2: Update API URL in App

Open `src/lib/smsService.ts` and update:

```typescript
// For local testing (if running on Windows with Android Emulator):
const API_BASE_URL = 'http://10.0.2.2:3000';

// For production:
// const API_BASE_URL = 'https://your-api-domain.com';
```

**Note:** Android Emulator uses `10.0.2.2` to access the host machine's localhost

### Step 3: Get Twilio Credentials

1. Sign up at [twilio.com](https://www.twilio.com)
2. Go to Console → Twilio Account
3. Copy your Account SID and Auth Token
4. Get a Twilio phone number (e.g., +1234567890)
5. Add credentials to `.env` file

## 🧪 Testing

1. Start your backend server
2. Open the app and go to Account tab
3. Click "Đăng ký" button
4. Enter your phone number (with country code like +84971234567)
5. Click "Gửi mã OTP"
6. Check your phone for the SMS message
7. Enter the 6-digit code
8. Click "Xác nhận"

## ⚠️ Important Notes

- Phone numbers must include country code (e.g., +84 for Vietnam, not just 84)
- Vietnamese phone: +84971234567 (or +84-9-7123-4567)
- OTP expires after 10 minutes
- Max 3 wrong attempts before needs new OTP
- In production, use a database (MongoDB, PostgreSQL) instead of in-memory object

## 🔗 API Integration in App

The app will authenticate users through this flow:
1. User enters phone number → Backend sends SMS OTP
2. User enters 6-digit code → Backend verifies OTP
3. After verification, you can:
   - Auto-login the user
   - Create user account in database
   - Issue JWT token

## 📚 Alternative SMS Services

- **AWS SNS** - Reliable, AWS integration
- **Vonage** - Good international coverage
- **Supabase Edge Functions** - Serverless, good for small projects
