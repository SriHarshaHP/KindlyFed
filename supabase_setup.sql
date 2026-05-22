-- 1. Create Enums and Types
CREATE TYPE user_role AS ENUM ('Restaurant', 'Grocery Shop', 'Social Worker', 'Orphanage', 'Admin');

-- 2. Create Profiles Table (Linked to Auth.Users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  org_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  user_type user_role NOT NULL,
  aadhaar_url TEXT,
  location_coords JSONB NOT NULL, -- Format: {"lat": 12.34, "lng": 56.78}
  is_approved BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create Donations Table
CREATE TABLE public.donations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  donor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  items TEXT NOT NULL,
  quantity TEXT NOT NULL,
  description TEXT,
  photo_url TEXT,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'claimed')) NOT NULL,
  recipient_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Enable Row Level Security (RLS) on tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

-- 5. Profiles RLS Policies
-- Allow anyone to read profiles (needed for showing names of donors/recipients)
CREATE POLICY "Allow public read access to profiles" ON public.profiles
  FOR SELECT USING (true);

-- Allow inserting profile on registration
CREATE POLICY "Allow registration inserts" ON public.profiles
  FOR INSERT WITH CHECK (true);

-- Allow users to update their own profile details
CREATE POLICY "Allow users to update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Allow admin total access (using secure JWT email check to prevent RLS recursion)
CREATE POLICY "Allow admin full access on profiles" ON public.profiles
  FOR ALL USING (
    (auth.jwt() ->> 'email') = 'admin@gmail.com'
  );

-- 6. Donations RLS Policies
-- Allow all approved users to see active donations
CREATE POLICY "Allow approved profiles to view donations" ON public.donations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_approved = true
    ) OR EXISTS (
      -- Admin can see all donations
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND user_type = 'Admin'::user_role
    )
  );

-- Allow approved donors to insert donations
CREATE POLICY "Allow approved donors to insert donations" ON public.donations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_approved = true AND (user_type = 'Restaurant'::user_role OR user_type = 'Grocery Shop'::user_role)
    )
  );

-- Allow donors to update their own donations (e.g. edit description) OR recipients to update status (claim)
CREATE POLICY "Allow donors or recipients to update donations" ON public.donations
  FOR UPDATE USING (
    (donor_id = auth.uid()) OR 
    (
      EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_approved = true AND (user_type = 'Social Worker'::user_role OR user_type = 'Orphanage'::user_role)
      )
    )
  );

-- 7. Database Trigger for Auto-Approving & Elevating admin@gmail.com
CREATE OR REPLACE FUNCTION public.handle_profile_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email = 'admin@gmail.com' THEN
    NEW.user_type := 'Admin'::user_role;
    NEW.is_approved := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_insert();

-- 8. Storage Configuration (Supabase buckets)
-- Run these inserts if you want to create buckets automatically in sql editor
INSERT INTO storage.buckets (id, name, public) 
VALUES ('aadhaar-photos', 'aadhaar-photos', true) 
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('donation-photos', 'donation-photos', true) 
ON CONFLICT (id) DO NOTHING;

-- Storage policies to allow upload and read
CREATE POLICY "Allow public read access to aadhaar photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'aadhaar-photos');

CREATE POLICY "Allow public upload access to aadhaar photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'aadhaar-photos');

CREATE POLICY "Allow public read access to donation photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'donation-photos');

CREATE POLICY "Allow public upload access to donation photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'donation-photos');
