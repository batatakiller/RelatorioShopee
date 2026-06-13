-- Create shopee_orders table
CREATE TABLE IF NOT EXISTS public.shopee_orders (
    order_id TEXT PRIMARY KEY,
    order_date TIMESTAMP WITH TIME ZONE NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    total_revenue DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    commission_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    service_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    status TEXT,
    original_price DECIMAL(10, 2) DEFAULT 0.0,
    seller_discount DECIMAL(10, 2) DEFAULT 0.0,
    seller_coupon DECIMAL(10, 2) DEFAULT 0.0,
    payout_amount DECIMAL(10, 2) DEFAULT NULL,
    payout_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    payout_unmatched BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create shopee_ads table
CREATE TABLE IF NOT EXISTS public.shopee_ads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    report_period TEXT NOT NULL,
    product_id TEXT NOT NULL,
    ad_name TEXT NOT NULL,
    cost DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    cost_per_conversion DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(report_period, product_id)
);

-- Create product_costs table
CREATE TABLE IF NOT EXISTS public.product_costs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    search_term TEXT NOT NULL UNIQUE,
    cost DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default product costs as requested
INSERT INTO public.product_costs (search_term, cost) VALUES
    ('Windows 11', 7.00),
    ('Office 2024', 7.00)
ON CONFLICT (search_term) DO NOTHING;

-- Set up Row Level Security (RLS) policies allowing full access for the Anon key
-- (Since we only have the anon key for this app and it's a private admin dashboard)
ALTER TABLE public.shopee_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for anon" ON public.shopee_orders FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.shopee_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for anon" ON public.shopee_ads FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for anon" ON public.product_costs FOR ALL USING (true) WITH CHECK (true);
