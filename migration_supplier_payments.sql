-- Criar tabela de pagamentos ao fornecedor
CREATE TABLE IF NOT EXISTS public.supplier_payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ativar RLS (Row Level Security)
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

-- Permitir acesso livre para o anon key (padrão do projeto)
CREATE POLICY "Enable all for anon" ON public.supplier_payments FOR ALL USING (true) WITH CHECK (true);
