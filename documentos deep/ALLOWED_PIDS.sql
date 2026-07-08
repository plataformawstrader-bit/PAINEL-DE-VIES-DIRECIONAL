-- ============================================================
--  WS TRADER - TABELA DE ATIVOS AUTORIZADOS (ALLOWED PIDS)
--  Execute este script no SQL Editor do Supabase para criar
--  e preencher a tabela de PIDs permitidos.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.allowed_pids (
    pid          TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    category     TEXT NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.allowed_pids ENABLE ROW LEVEL SECURITY;

-- Política de leitura pública (opcional, pois backend usa service_role)
CREATE POLICY "Permitir leitura pública de PIDs" 
    ON public.allowed_pids FOR SELECT USING (true);

-- Inserir PIDs padrão e mais importantes
INSERT INTO public.allowed_pids (pid, name, category) VALUES
('8839', 'S&P 500 FUTUROS', 'EUA'),
('8874', 'NASDAQ 100 FUTUROS', 'EUA'),
('8873', 'DOW JONES FUTUROS', 'EUA'),
('44336', 'VIX (VOLATILIDADE)', 'EUA'),
('166', 'S&P 500 SPOT', 'EUA'),
('14978', 'EWZ (ETF BRASIL NY)', 'Brasil/EUA'),
('23705', 'TREASURY EUA 10A', 'Juros EUA'),
('23701', 'TREASURY EUA 2A', 'Juros EUA'),
('23706', 'TREASURY EUA 30A', 'Juros EUA'),
('8849', 'PETRÓLEO WTI', 'Commodities'),
('8833', 'PETRÓLEO BRENT', 'Commodities'),
('8830', 'OURO', 'Commodities'),
('8836', 'PRATA', 'Commodities'),
('8831', 'COBRE HG', 'Commodities'),
('961741', 'MINÉRIO DE FERRO (SGX)', 'Commodities'),
('948434', 'BLOOMBERG COMMODITIES', 'Commodities'),
('8827', 'DXY (ÍNDICE DÓLAR)', 'Câmbio'),
('2103', 'USD/BRL (DÓLAR BR)', 'Brasil'),
('1617', 'EUR/BRL', 'Câmbio'),
('2124', 'EUR/USD', 'Câmbio'),
('3', 'USD/JPY', 'Câmbio'),
('941612', 'MINI IBOVESPA FUTUROS', 'Brasil'),
('1116031', 'CDS 5Y BRASIL', 'Brasil'),
('24029', 'BRL10Y (JUROS DI 10A)', 'Brasil'),
('40823', 'EURO STOXX 600', 'Europa'),
('8826', 'DAX FUTUROS', 'Europa'),
('27', 'FTSE 100', 'Europa'),
('36', 'NIKKEI 225', 'Europa/Ásia'),
('184', 'HANG SENG', 'Europa/Ásia'),
('37583', 'SHANGHAI COMPOSITE', 'Europa/Ásia'),
('17', 'USD/ZAR (RAND SUL-AFRICANO)', 'Emergentes'),
('39', 'USD/MXN (PESO MEXICANO)', 'Emergentes'),
('2108', 'USD/CLP (PESO CHILENO)', 'Emergentes'),
('26478', 'LQD BOND ETF', 'EUA'),
('25756', 'HYG BOND ETF', 'EUA'),
('1057391', 'BITCOIN', 'Criptomoedas'),
('20', 'NASDAQ SPOT', 'EUA'),
('169', 'DOW JONES SPOT', 'EUA'),
('179', 'IBOVESPA SPOT', 'Brasil')
ON CONFLICT (pid) DO UPDATE SET 
    name = EXCLUDED.name, 
    category = EXCLUDED.category;
