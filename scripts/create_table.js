// Script que cria a tabela allowed_pids via REST API do Supabase (sem precisar do painel)
const https = require('https');

const SUPABASE_URL = 'fiewhkxayneocehldfcp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZXdoa3hheW5lb2NlaGxkZmNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTczMjI0MiwiZXhwIjoyMDk3MzA4MjQyfQ.ozLnTLhjcQkcq8GMyPlWNebET5lRWoUmY_rL-1ASsiM';

// SQL para criar a tabela
const sql = `
CREATE TABLE IF NOT EXISTS allowed_pids (
  id bigserial PRIMARY KEY,
  pid text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'outros',
  created_at timestamptz DEFAULT now()
);
INSERT INTO allowed_pids (pid, name, category) VALUES
  ('8839','S&P 500 FUTUROS','eua'),('8874','NASDAQ 100 FUTUROS','eua'),('8873','DOW JONES FUTUROS','eua'),
  ('44336','VIX (VOLATILIDADE)','eua'),('166','S&P 500 SPOT','eua'),('20','NASDAQ SPOT','eua'),
  ('169','DOW JONES SPOT','eua'),('14978','EWZ ETF BRASIL','eua'),('26478','LQD BOND ETF','eua'),
  ('25756','HYG BOND ETF','eua'),('23705','TREASURY EUA 10A','curva_eua'),
  ('23701','TREASURY EUA 2A','curva_eua'),('23706','TREASURY EUA 30A','curva_eua'),
  ('8849','PETRÓLEO WTI','commodities'),('8833','PETRÓLEO BRENT','commodities'),
  ('8830','OURO XAU','commodities'),('8836','PRATA XAG','commodities'),
  ('8831','COBRE HG','commodities'),('961741','MINÉRIO DE FERRO','commodities'),
  ('948434','BLOOMBERG COMMODITIES','commodities'),('8827','DXY ÍNDICE DÓLAR','dx'),
  ('2124','EUR/USD','dx'),('3','USD/JPY','dx'),('2126','GBP/USD','dx'),
  ('7','USD/CAD','dx'),('4','USD/CHF','dx'),('2103','USD/BRL','brasil'),
  ('941612','MINI IBOVESPA FUT','brasil'),('179','IBOVESPA SPOT','brasil'),
  ('1116031','CDS 5Y BRASIL','brasil'),('24029','BRL10Y DI 10A','brasil'),
  ('17','USD/ZAR RAND','emergentes'),('39','USD/MXN PESO MEX','emergentes'),
  ('2108','USD/CLP PESO CHILE','emergentes'),('18','USD/TRY LIRA','emergentes'),
  ('40823','EURO STOXX 600','europa'),('8826','DAX FUTUROS','europa'),
  ('27','FTSE 100','europa'),('36','NIKKEI 225','latam'),
  ('184','HANG SENG','latam'),('37583','SHANGHAI COMPOSITE','latam'),
  ('1057391','BITCOIN','cryptos')
ON CONFLICT (pid) DO NOTHING;
`;

function runSQL(query) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ query });
        const options = {
            hostname: SUPABASE_URL,
            port: 443,
            path: '/rest/v1/rpc/exec_sql',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + SUPABASE_KEY,
                'apikey': SUPABASE_KEY,
                'Content-Length': Buffer.byteLength(body)
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// Tenta via Management API (precisa de access token do Supabase dashboard)
// Alternativa: usa a pg REST API diretamente
async function runViaDirectSQL() {
    const body = JSON.stringify({ query: sql });

    return new Promise((resolve, reject) => {
        const options = {
            hostname: SUPABASE_URL,
            port: 443,
            path: '/pg/query',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + SUPABASE_KEY,
                'apikey': SUPABASE_KEY,
                'Content-Length': Buffer.byteLength(body)
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function main() {
    console.log("Tentando criar tabela via Supabase API...");
    try {
        const result = await runViaDirectSQL();
        console.log("Status:", result.status);
        console.log("Response:", result.body.slice(0, 500));
    } catch (e) {
        console.error("Erro de rede:", e.message);
    }
}

main();
