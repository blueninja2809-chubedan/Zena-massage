-- Xóa mã demo cũ (không còn seed mã trong app — chỉ tạo trong admin).
DELETE FROM public.promotions WHERE upper(trim(code)) IN ('WELCOME50', 'SUMMER30', 'WELCOME20');
