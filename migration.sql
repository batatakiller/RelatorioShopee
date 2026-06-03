-- Run this if you already created the tables before
ALTER TABLE public.shopee_orders 
ADD COLUMN IF NOT EXISTS status TEXT,
ADD COLUMN IF NOT EXISTS original_price DECIMAL(10, 2) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS seller_discount DECIMAL(10, 2) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS seller_coupon DECIMAL(10, 2) DEFAULT 0.0;
