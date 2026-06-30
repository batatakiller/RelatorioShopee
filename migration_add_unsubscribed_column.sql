-- Add unsubscribed column to public.leads table
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS unsubscribed BOOLEAN DEFAULT FALSE;
