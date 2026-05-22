-- Gamification & Delivery Verification Migration

-- 1. Add donation_count to profiles
ALTER TABLE public.profiles 
ADD COLUMN donation_count INTEGER DEFAULT 0 NOT NULL;

-- 2. Update donations table
ALTER TABLE public.donations
DROP CONSTRAINT IF EXISTS donations_status_check;

ALTER TABLE public.donations
ADD CONSTRAINT donations_status_check CHECK (status IN ('available', 'claimed', 'delivered'));

ALTER TABLE public.donations
ADD COLUMN delivery_photo_url TEXT;

ALTER TABLE public.donations
ADD COLUMN delivery_coords JSONB;

ALTER TABLE public.donations
ADD COLUMN delivered_at TIMESTAMP WITH TIME ZONE;

-- 3. Create Trigger to Atomically Increment donation_count on Delivery
CREATE OR REPLACE FUNCTION public.increment_donation_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if status changed to 'delivered' from something else
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
    UPDATE public.profiles
    SET donation_count = donation_count + 1
    WHERE id = NEW.recipient_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_donation_delivered ON public.donations;

CREATE TRIGGER on_donation_delivered
  AFTER UPDATE ON public.donations
  FOR EACH ROW EXECUTE FUNCTION public.increment_donation_count();

-- 4. Storage Bucket for Delivery Proofs
INSERT INTO storage.buckets (id, name, public) 
VALUES ('delivery-proofs', 'delivery-proofs', true) 
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow public read access to delivery proofs" ON storage.objects
  FOR SELECT USING (bucket_id = 'delivery-proofs');

CREATE POLICY "Allow public upload access to delivery proofs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'delivery-proofs');
