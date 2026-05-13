-- Dọn sạch các đơn hàng bị kẹt ở trạng thái confirmed/in-progress từ quá trình test.
-- Đẩy updated_at về 3 ngày trước để nằm ngoài cửa sổ 48h của check_therapist_has_active_booking.

UPDATE public.bookings
SET    status     = 'completed',
       updated_at = now() - interval '3 days'
WHERE  status IN ('confirmed', 'in-progress');
