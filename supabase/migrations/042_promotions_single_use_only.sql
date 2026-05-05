-- Xóa toàn bộ mã hiện có; sau đó mỗi mã chỉ được phép đúng 1 lượt dùng (tạo nhiều mã = nhiều lượt tổng).
DELETE FROM public.promotions;

ALTER TABLE public.promotions ALTER COLUMN max_uses SET DEFAULT 1;

ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_one_use_per_code;
ALTER TABLE public.promotions
  ADD CONSTRAINT promotions_one_use_per_code CHECK (max_uses = 1);
