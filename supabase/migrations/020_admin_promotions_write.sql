-- Admin web uses anon key and performs CRUD on promotions.
-- Existing schema allowed public SELECT only, which blocks insert/update.
DROP POLICY IF EXISTS promotions_public_read ON public.promotions;
DROP POLICY IF EXISTS "Allow anon all on promotions" ON public.promotions;

CREATE POLICY "Allow anon all on promotions"
ON public.promotions
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

GRANT ALL ON public.promotions TO anon;
GRANT ALL ON public.promotions TO authenticated;
