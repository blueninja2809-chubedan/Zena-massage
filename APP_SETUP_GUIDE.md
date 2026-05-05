# 🛠️ COMPLETE APP SETUP GUIDE - Massage Booking App (Zena)

## 📋 PROJECT STRUCTURE

```
src/
├── app/
│   ├── _layout.tsx              ✅ Root layout with providers
│   ├── index.tsx                ✅ Home/Browse Services (TODO: Replace with new design)
│   ├── explore.tsx              📌 Browse therapists & services
│   ├── bookings.tsx             📌 My bookings history
│   ├── account.tsx              ✅ User profile & settings
│   ├── service-details.tsx      📌 Service detail screen
│   ├── therapist-detail.tsx     📌 Therapist profile
│   ├── booking-confirm.tsx      📌 Booking confirmation
│   └── payment.tsx              📌 Payment screen
│
├── components/
│   ├── Onboarding.tsx           ✅ Language selection
│   ├── SignInScreen.tsx         ✅ Login
│   ├── SignUpScreen.tsx         ✅ Sign up
│   ├── animated-icon.tsx        ✅ Splash screen
│   ├── app-tabs.tsx             ✅ Bottom navigation
│   ├── ServiceCard.tsx          📌 Reusable service card
│   ├── TherapistCard.tsx        📌 Reusable therapist card
│   ├── BookingCard.tsx          📌 Reusable booking card
│   └── LocationPicker.tsx       📌 Map & location selection
│
├── contexts/
│   ├── LanguageContext.tsx      ✅ Language state
│   └── UserContext.tsx          ✅ User/Auth state
│
├── lib/
│   ├── supabase.ts              ✅ Supabase config
│   ├── supabaseService.ts       ✅ Database operations
│   ├── sampleData.ts            ✅ Sample data template
│   ├── types.ts                 ✅ TypeScript types/models
│   ├── smsService.ts            ✅ SMS OTP service
│
├── hooks/
│   ├── use-color-scheme.ts      ✅ Theme hook
│   ├── use-theme.ts             ✅ Color scheme hook
│   └── useBookings.ts           📌 Custom hook for bookings
│
└── constants/
    └── theme.ts                 ✅ Design tokens
```

## 🚀 IMMEDIATE SETUP STEPS

### 1. SETUP SUPABASE

1. Go to https://supabase.com/dashboard
2. Create new project
3. Get project URL and anon key
4. Update `.env` with your config

### 2. RUN DATABASE MIGRATIONS

Run the SQL files in `supabase/migrations/` in the Supabase SQL Editor:
- `001_init.sql` - Create tables
- `002_fix_public_catalog_access.sql` - Fix public access
- `003_email_auth_profiles.sql` - Profiles setup
- `custom_auth.sql` - Phone + password auth

### 3. ADD SAMPLE DATA (optional)

Import sample data from `sampleData.ts` into Supabase tables

## 📱 CURRENT APP FLOW

```
Onboarding (Language Selection)
    ↓
Sign In / Sign Up Screen
    ↓
Main App (3 tabs):
    ├─ Home (Browse Services) 
    ├─ Explore (Browse Therapists)
    └─ Account (Profile & Settings)
```

## 📄 SCREENS TO BUILD (Priority Order)

### HIGH PRIORITY (Core Booking Flow)

1. **Service List Screen** (Home tab)
   - Show all services from Supabase
   - Categories: Massage, Spa, Yoga, etc.
   - Search & filter
   - Show rating & price

2. **Service Details Screen**
   - Full service info
   - Available therapists
   - Pricing & duration
   - Reviews/ratings
   - "Book Now" button

3. **Therapist Selection**
   - List available therapists
   - Filter by rating, distance, availability
   - Show therapist details
   - Select therapist

4. **Date/Time Selection**
   - Calendar picker
   - Available time slots
   - Duration selector

5. **Location Selection**
   - Use saved addresses
   - Add new address
   - Map view
   - Delivery fee calculation

6. **Booking Confirmation**
   - Review all details
   - Apply promo code
   - Total price
   - "Confirm Booking" button

7. **Payment Screen**
   - Payment methods
   - Cash/Card options
   - Display total

8. **My Bookings Screen**
   - Show all user bookings
   - Bookmark status
   - Can cancel/reschedule
   - Leave review after completion

### MEDIUM PRIORITY (Supporting Features)

9. **Therapist Profile Screen**
   - Full bio
   - Specialties
   - Reviews from clients
   - Rating & stats
   - Book directly

10. **Reviews Screen**
    - Leave review after booking
    - Star rating
    - Photo upload
    - Text review

11. **Favorites**
    - Save favorite therapists
    - Save favorite services
    - Quick access

12. **Notification Center**
    - Booking confirmations
    - Reminders
    - Promotions
    - Support messages

### LOW PRIORITY (Future)

13. **Referral System**
14. **Loyalty Points**
15. **Support Chat**
16. **Payment History**

## 🔗 INTEGRATION CHECKLIST

- [x] Supabase config added
- [x] Database tables created
- [x] RLS policies set
- [x] Custom phone auth implemented
- [x] Sample data imported
- [ ] Home screen showing services from Supabase
- [ ] Booking flow implemented
- [ ] Phone auth connected
- [ ] Booking saved to Supabase
- [x] User profile saved
- [ ] Notification system
- [ ] Push notifications (optional)

## 🎨 UI/UX NOTES

App structure follows the Zena app pattern:
- **Home Tab**: Browse services, quick book
- **Explore Tab**: Browse therapists, special offers
- **Account Tab**: Profile, booking history, settings

Design system already set:
- Primary color: #10B981 (Green)
- Dark text: #111827
- Light BG: #F9FAFB
- Border radius: 12-16px
- Font: System font (iOS/Android default)

## 🧪 TESTING

1. Run emulator: `npm start`
2. Test language selection
3. Test sign up with OTP (Supabase Auth / your configured provider)
4. Verify user saved in AsyncStorage
5. Test Supabase fetch after adding data
6. Test navigation between screens

## 📝 NEXT STEP

After Supabase setup:
1. Build Home screen to fetch & display services
2. Create Service Details screen
3. Wire up booking flow
4. Test end-to-end booking creation

---

Good luck! 🚀 You're building something great!
