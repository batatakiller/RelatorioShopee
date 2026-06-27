-- Create shopee_ads_billing table for ad transaction history (recharges + deductions)
CREATE TABLE IF NOT EXISTS public.shopee_ads_billing (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sequence_number INTEGER NOT NULL,
    transaction_date DATE NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    observation TEXT NOT NULL DEFAULT '-',
    credit_paid DECIMAL(10, 2) DEFAULT NULL,
    credit_free DECIMAL(10, 2) DEFAULT NULL,
    import_file TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT shopee_ads_billing_unique_transaction UNIQUE(transaction_date, description, amount, observation)
);

ALTER TABLE public.shopee_ads_billing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for anon" ON public.shopee_ads_billing FOR ALL USING (true) WITH CHECK (true);
