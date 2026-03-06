-- Create suppliers table
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    contact_number TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add RLS policies for suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.suppliers
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users" ON public.suppliers
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON public.suppliers
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Update stock_batches table
ALTER TABLE public.stock_batches
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id),
ADD COLUMN IF NOT EXISTS supplier_contact TEXT,
ADD COLUMN IF NOT EXISTS supplier_address TEXT;

-- Note: 'supplier' column already exists and will be used as supplier_name

-- Extend products table: packaging configuration
-- packaging_type:
--   'box_only'   -> can sell only as box
--   'strip_only' -> can sell only as strip
--   'box_strip'  -> can sell either box or strip
-- strips_per_box: required (>0) when packaging_type involves boxes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'packaging_type'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN packaging_type TEXT DEFAULT 'strip_only';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'strips_per_box'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN strips_per_box INTEGER;
  END IF;
END $$;

-- Add conditional check constraint to enforce valid strips_per_box when boxes are involved
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_packaging_strips_check'
  ) THEN
    ALTER TABLE public.products
    ADD CONSTRAINT products_packaging_strips_check
    CHECK (
      (packaging_type IN ('box_only', 'box_strip') AND strips_per_box IS NOT NULL AND strips_per_box > 0)
      OR (packaging_type = 'strip_only')
    );
  END IF;
END $$;
