-- Criar tabela de leads (compradores que resgataram a licença)
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    product_name TEXT,
    license_key TEXT,
    status TEXT DEFAULT 'pending', -- 'sent', 'pending_verification', 'pending_key', 'recebido'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar tabela de estoque de chaves de licença
CREATE TABLE IF NOT EXISTS public.license_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_name TEXT NOT NULL, -- ex: 'Windows 11', 'Office 2021', etc.
    key_code TEXT NOT NULL UNIQUE,
    is_used BOOLEAN DEFAULT FALSE,
    order_id TEXT,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ativar RLS (Row Level Security)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_keys ENABLE ROW LEVEL SECURITY;

-- Criar políticas de acesso livre para a chave anon (padrão do projeto)
CREATE POLICY "Enable all for anon" ON public.leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON public.license_keys FOR ALL USING (true) WITH CHECK (true);
