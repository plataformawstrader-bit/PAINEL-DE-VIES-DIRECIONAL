const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fiewhkxayneocehldfcp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZXdoa3hheW5lb2NlaGxkZmNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTczMjI0MiwiZXhwIjoyMDk3MzA4MjQyfQ.ozLnTLhjcQkcq8GMyPlWNebET5lRWoUmY_rL-1ASsiM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const defaultPids = [
    { pid: '8839', name: 'S&P 500 FUTUROS', category: 'EUA' },
    { pid: '8874', name: 'NASDAQ 100 FUTUROS', category: 'EUA' },
    { pid: '8873', name: 'DOW JONES FUTUROS', category: 'EUA' },
    { pid: '44336', name: 'VIX (VOLATILIDADE)', category: 'EUA' },
    { pid: '166', name: 'S&P 500 SPOT', category: 'EUA' },
    { pid: '20', name: 'NASDAQ SPOT', category: 'EUA' },
    { pid: '169', name: 'DOW JONES SPOT', category: 'EUA' },
    { pid: '14978', name: 'EWZ (ETF BRASIL NY)', category: 'EUA' },
    { pid: '26478', name: 'LQD BOND ETF', category: 'EUA' },
    { pid: '25756', name: 'HYG BOND ETF', category: 'EUA' },
    { pid: '23705', name: 'TREASURY EUA 10A', category: 'curva_eua' },
    { pid: '23701', name: 'TREASURY EUA 2A', category: 'curva_eua' },
    { pid: '23706', name: 'TREASURY EUA 30A', category: 'curva_eua' },
    { pid: '8849', name: 'PETRÓLEO WTI', category: 'commodities' },
    { pid: '8833', name: 'PETRÓLEO BRENT', category: 'commodities' },
    { pid: '8830', name: 'OURO XAU', category: 'commodities' },
    { pid: '8836', name: 'PRATA XAG', category: 'commodities' },
    { pid: '8831', name: 'COBRE HG', category: 'commodities' },
    { pid: '961741', name: 'MINÉRIO DE FERRO (SGX)', category: 'commodities' },
    { pid: '948434', name: 'BLOOMBERG COMMODITIES', category: 'commodities' },
    { pid: '8827', name: 'DXY (ÍNDICE DÓLAR)', category: 'dx' },
    { pid: '2124', name: 'EUR/USD', category: 'dx' },
    { pid: '3', name: 'USD/JPY', category: 'dx' },
    { pid: '2126', name: 'GBP/USD', category: 'dx' },
    { pid: '7', name: 'USD/CAD', category: 'dx' },
    { pid: '4', name: 'USD/CHF', category: 'dx' },
    { pid: '2103', name: 'USD/BRL (DÓLAR)', category: 'brasil' },
    { pid: '941612', name: 'MINI IBOVESPA FUTUROS', category: 'brasil' },
    { pid: '179', name: 'IBOVESPA SPOT', category: 'brasil' },
    { pid: '1116031', name: 'CDS 5Y BRASIL', category: 'brasil' },
    { pid: '24029', name: 'BRL10Y (JUROS DI 10A)', category: 'brasil' },
    { pid: '17', name: 'USD/ZAR (RAND)', category: 'emergentes' },
    { pid: '39', name: 'USD/MXN (PESO MEX)', category: 'emergentes' },
    { pid: '2108', name: 'USD/CLP (PESO CHILE)', category: 'emergentes' },
    { pid: '18', name: 'USD/TRY (LIRA)', category: 'emergentes' },
    { pid: '40823', name: 'EURO STOXX 600', category: 'europa' },
    { pid: '8826', name: 'DAX FUTUROS', category: 'europa' },
    { pid: '27', name: 'FTSE 100', category: 'europa' },
    { pid: '36', name: 'NIKKEI 225', category: 'latam' },
    { pid: '184', name: 'HANG SENG', category: 'latam' },
    { pid: '37583', name: 'SHANGHAI COMPOSITE', category: 'latam' },
    { pid: '1057391', name: 'BITCOIN', category: 'cryptos' }
];

async function run() {
    try {
        console.log("Verificando tabela allowed_pids no Supabase...");
        const { error: checkError } = await supabase
            .from('allowed_pids')
            .select('pid', { count: 'exact', head: true });
        
        if (checkError) {
            console.error("ERRO: Tabela allowed_pids não existe ou não acessível:", checkError.message);
            console.log("\n=> Crie a tabela primeiro com o SQL:\n");
            console.log(`CREATE TABLE allowed_pids (
  id bigserial PRIMARY KEY,
  pid text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'outros',
  created_at timestamptz DEFAULT now()
);`);
            return;
        }
        
        console.log("Tabela encontrada! Inserindo PIDs padrão (upsert)...");
        
        const { error: upsertError } = await supabase
            .from('allowed_pids')
            .upsert(defaultPids, { onConflict: 'pid' });
            
        if (upsertError) {
            console.error("Erro ao inserir PIDs:", upsertError.message);
        } else {
            console.log(`✅ ${defaultPids.length} PIDs inseridos/atualizados com sucesso no Supabase!`);
        }
    } catch (e) {
        console.error("Erro inesperado:", e.message);
    }
}

run();
