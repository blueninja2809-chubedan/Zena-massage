# PROMPT CHO V0.DEV - BUILD WEB ZENA

Copy toàn bộ nội dung bên dưới và paste vào v0.dev:

---

Build me a complete **Next.js 14 (App Router)** web application for **"Zena"** - a massage & spa booking platform in Vietnam. The web app connects to an **existing Supabase backend** (shared with mobile app and admin panel).

## TECH STACK
- Next.js 14, App Router, TypeScript
- Tailwind CSS + shadcn/ui components
- Supabase JS client (`@supabase/supabase-js`)
- Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Bilingual: Vietnamese (default) + English

## COLOR SCHEME & BRANDING
- Primary: #2196F3 (blue)
- Background: #F5F9FF (light blue tint)
- Accent Green: #2D8653
- Gold/VIP: #F5A623
- App name: "Zena"
- Tagline: "Massage & Spa tại nhà"
- Modern, clean, mobile-first responsive design

## EXISTING DATABASE SCHEMA (DO NOT CREATE NEW TABLES)

### profiles table
- id (UUID PK), phone_number (unique), display_name, gender, nationality, avatar_uri
- role (customer|therapist), working_city, service_images[], services[]
- is_vip_member, vip_plan_id, vip_expires_at
- partner_application_id, partner_application_status (none|pending|approved|rejected)
- selected_city, push_token, created_at, updated_at

### services table
- id (UUID), name, name_en, description, description_en
- category (massage|spa|yoga|haircare|skincare), icon, base_price, duration
- image, rating, review_count, is_active, created_at

### therapists table
- id (UUID), name, phone_number, email, gender, avatar, photos[]
- bio, bio_en, specialties[], experience, rating, review_count, hourly_rate
- working_city, is_available, availability (jsonb), languages[], certifications[]

### bookings table (uses jsonb payload)
- id (UUID), user_id (text), therapist_id (text), status (pending|confirmed|in-progress|completed|cancelled)
- payload (jsonb): { clientName, clientPhone, address, bookingDate, bookingTime, duration, totalPrice, notes, specialRequests[], cancellationReason, coordinates }
- created_at, updated_at

### reviews table (uses jsonb payload)
- id (UUID), user_id, therapist_id, service_id
- payload (jsonb): { rating, comment, bookingId, customerName, customerPhone, therapistName, service, createdAt }

### wallets table
- id (UUID), user_id (unique), balance (BIGINT in VND), updated_at

### wallet_transactions table
- id, wallet_id, user_id, type (topup|payment|earning|fee|refund|withdrawal)
- amount (BIGINT), balance_after, description, reference_id, status, created_at

### promotions table
- id, code (unique), description, discount_percent, max_discount_amount
- min_order_amount, expiry_date, max_uses, current_uses, conditions[], is_active

### notifications table (uses jsonb payload)
- id, user_id, is_read (boolean)
- payload (jsonb): { type, title, titleEn, message, messageEn, relatedId }

### chat_rooms & chat_messages tables
- chat_rooms: id, booking_id, customer_id, therapist_id, customer_name, therapist_name, is_active
- chat_messages: id, room_id, sender_id, sender_role, content, message_type, is_read

### therapist_shifts table
- id, user_id, display_name, shift_date, slots[], updated_at

### withdrawal_requests table
- id, user_id, amount, bank_name, account_number, account_holder, status (pending|completed|rejected), admin_note

## AUTHENTICATION (CUSTOM - NOT Supabase Auth)
- Phone number + password (bcrypt hashed in `profiles.password` column)
- Sign up: Insert into profiles with bcrypt password
- Sign in: Query profiles by phone_number, compare bcrypt hash
- Session stored in localStorage/cookies
- NO Supabase Auth (auth.users) - fully custom

## PAGES TO BUILD

### 1. Landing Page `/`
- Hero section with search bar (search services/therapists)
- Service categories grid (massage, spa, yoga, haircare, skincare)
- Featured therapists carousel
- Active promotions banner
- "Tải app" (Download app) CTA

### 2. Auth Pages `/login`, `/register`
- Phone + password login
- Registration with: phone, password, displayName, gender
- Role selection (customer/therapist)

### 3. Services Page `/services`
- Filter by category (massage|spa|yoga|haircare|skincare)
- Service cards with: name, price, duration, rating, image
- Search functionality

### 4. Therapist Listing `/therapists`
- Grid of available therapists
- Filter by: city, specialty, rating, gender
- Card shows: avatar, name, rating, experience, specialties, hourly_rate
- Only show therapists with minimum wallet balance 500,000 VND (use RPC `get_available_therapists_with_min_balance`)

### 5. Therapist Detail `/therapists/[id]`
- Full profile: photos gallery, bio, specialties, certifications
- Reviews section with ratings
- Available schedule (from therapist_shifts)
- "Đặt lịch" (Book Now) button

### 6. Booking Flow `/book`
- Step 1: Select service
- Step 2: Select date & time (from therapist shifts)
- Step 3: Enter address (or select saved address)
- Step 4: Apply promo code (optional)
- Step 5: Confirm & pay
- Creates booking in `bookings` table with jsonb payload

### 7. My Bookings `/bookings`
- List all bookings (pending, confirmed, in-progress, completed, cancelled)
- Filter by status
- Cancel booking option
- Leave review for completed bookings

### 8. Wallet `/wallet`
- Show balance (VND format with ₫ symbol)
- Transaction history
- Top-up form

### 9. Profile `/profile`
- View/edit: displayName, gender, nationality, avatarUri
- Saved addresses management
- VIP membership status
- Language toggle (VI/EN)

### 10. Promotions `/promotions`
- Active promotions with: code, description, discount %, expiry
- Copy promo code functionality

### 11. Chat `/chat`
- Chat rooms list
- Real-time messaging (Supabase realtime subscriptions)
- Message types: text

### 12. Notifications `/notifications`
- List all notifications
- Mark as read
- Unread count badge in navbar

### 13. Therapist Dashboard `/therapist` (for therapist role)
- My shifts/schedule management
- Incoming job requests
- Earnings overview (70% commission)
- Withdrawal request form

## IMPORTANT NOTES
- Currency is VND (Vietnamese Dong) - format: 150.000₫
- All amounts in database are BIGINT (no decimals)
- Bookings use jsonb `payload` column for flexible data
- Reviews use jsonb `payload` column
- Notifications use jsonb `payload` column
- Must query Supabase directly (no separate API server)
- Responsive design: works on mobile browsers too
- Vietnamese as default language, English toggle option

## LAYOUT
- Sticky top navbar with: Logo, Search, Services, Therapists, My Bookings, Wallet, Profile, Notifications bell
- Footer with: About, Contact, Terms, Privacy
- Mobile: Bottom tab bar (Home, Services, Bookings, Profile)
