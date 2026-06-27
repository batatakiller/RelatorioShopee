-- 1. Identify and drop the old UNIQUE constraint containing 'sequence_number' dynamically
DO $$
DECLARE
    constraint_name_var text;
BEGIN
    SELECT tc.constraint_name 
    INTO constraint_name_var
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'UNIQUE' 
      AND tc.table_name = 'shopee_ads_billing'
      AND kcu.column_name = 'sequence_number';

    IF constraint_name_var IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.shopee_ads_billing DROP CONSTRAINT ' || quote_ident(constraint_name_var);
        RAISE NOTICE 'Dropped old constraint: %', constraint_name_var;
    ELSE
        RAISE NOTICE 'Old constraint containing sequence_number not found.';
    END IF;
END $$;

-- 2. Ensure observation column is NOT NULL
UPDATE public.shopee_ads_billing SET observation = '-' WHERE observation IS NULL;
ALTER TABLE public.shopee_ads_billing ALTER COLUMN observation SET NOT NULL;

-- 3. Add the new UNIQUE constraint based on transaction_date, description, amount, observation
ALTER TABLE public.shopee_ads_billing 
ADD CONSTRAINT shopee_ads_billing_unique_transaction 
UNIQUE (transaction_date, description, amount, observation);
