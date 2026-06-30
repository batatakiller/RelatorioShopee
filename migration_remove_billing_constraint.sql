-- Drop the unique constraint to allow duplicate commission rows on the same day
ALTER TABLE public.shopee_ads_billing DROP CONSTRAINT IF EXISTS shopee_ads_billing_unique_transaction;
