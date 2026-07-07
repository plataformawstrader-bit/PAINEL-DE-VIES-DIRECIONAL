-- ============================================================
--  VSSTRAEDER - TABELA DE ATIVOS PERSONALIZADOS POR USUÁRIO
--  Execute este script no SQL Editor do Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_assets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,           -- Ex: PETR4
    pid             TEXT NOT NULL,           -- Pair ID da Investing
    category        TEXT NOT NULL,           -- eua, commodities, brasil, etc.
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para busca rápida por usuário
CREATE INDEX IF NOT EXISTS idx_user_assets_user_id ON public.user_assets(user_id);

-- Comentários para documentação
COMMENT ON TABLE public.user_assets IS 'Ativos personalizados de cada usuário no painel de monitoramento';
COMMENT ON COLUMN public.user_assets.user_id IS 'FK para users.id - dono do ativo';
COMMENT ON COLUMN public.user_assets.name IS 'Sigla/nome do ativo exibido no painel (ex: PETR4)';
COMMENT ON COLUMN public.user_assets.pid IS 'Pair ID da Investing.com para streaming de dados';
COMMENT ON COLUMN public.user_assets.category IS 'Categoria da tabela: eua, curva_eua, commodities, dx, brasil, emergentes, latam, europa, dolar, cryptos';
