const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fiewhkxayneocehldfcp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZXdoa3hheW5lb2NlaGxkZmNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTczMjI0MiwiZXhwIjoyMDk3MzA4MjQyfQ.ozLnTLhjcQkcq8GMyPlWNebET5lRWoUmY_rL-1ASsiM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const initialPrices = [
    // EUA
    { pid: '8839', last: '5.200,00', pcp: '-0,02%' }, // S&P 500 FUT (ES)
    { pid: '8874', last: '18.636,00', pcp: '+0,32%' }, // NASDAQ 100 FUT (NQ)
    { pid: '8873', last: '39.066,00', pcp: '-0,15%' }, // DOW JONES FUT (YM)
    { pid: '44336', last: '12,50', pcp: '0,00%' },   // VIX
    { pid: '166', last: '5.137,08', pcp: '-0,11%' },  // S&P 500 (à vista)
    { pid: '20', last: '16.117,20', pcp: '+0,22%' },   // NASDAQ (à vista)
    { pid: '169', last: '38.892,10', pcp: '-0,13%' },  // DOW JONES (à vista)
    { pid: '26478', last: '107,22', pcp: '+0,15%' },  // LQD (IG Bond ETF)
    { pid: '25756', last: '76,45', pcp: '-0,08%' },   // HYG (High Yield ETF)
    { pid: '14978', last: '31,25', pcp: '+0,45%' },   // EWZ (ETF Brasil NY)

    // Curva EUA
    { pid: '23701', last: '4,172', pcp: '0,00%' },    // US2Y
    { pid: '23705', last: '4,556', pcp: '0,00%' },    // US10Y
    { pid: '23706', last: '5,067', pcp: '0,00%' },    // US30Y

    // Commodities
    { pid: '8849', last: '78,45', pcp: '-0,22%' },    // WTI OIL
    { pid: '8833', last: '82,62', pcp: '-0,18%' },    // BRENT OIL
    { pid: '8830', last: '2.345,10', pcp: '+0,15%' }, // XAU/USD (OURO)
    { pid: '8836', last: '27,35', pcp: '+0,25%' },    // PRATA
    { pid: '8831', last: '4,55', pcp: '+0,12%' },     // COBRE FUTURO
    { pid: '961741', last: '116,40', pcp: '-0,50%' }, // MINÉRIO DE FERRO
    { pid: '948434', last: '102,15', pcp: '-0,08%' }, // BCOM

    // DX
    { pid: '8827', last: '104,50', pcp: '0,00%' },    // DXY (ÍNDICE DÓLAR)
    { pid: '2124', last: '1,0782', pcp: '+0,05%' },   // EUR/USD (EURO)
    { pid: '3', last: '155,75', pcp: '+0,12%' },      // USD/JPY
    { pid: '2126', last: '1,2540', pcp: '-0,08%' },   // GBP/USD
    { pid: '7', last: '1,3685', pcp: '+0,10%' },      // USD/CAD
    { pid: '41', last: '10,75', pcp: '+0,15%' },      // USD/SEK
    { pid: '4', last: '0,9065', pcp: '-0,05%' },      // USD/CHF

    // Brasil
    { pid: '2103', last: '5,1850', pcp: '-0,13%' },   // USD/BRL
    { pid: '941612', last: '182.163', pcp: '+2,91%' }, // MINI IBOVESPA
    { pid: '179', last: '121.571', pcp: '+0,35%' },   // IBOVESPA (à vista)
    { pid: '24029', last: '6,15', pcp: '0,00%' },     // BRL10Y
    { pid: '1116031', last: '152,40', pcp: '+0,10%' }, // CDS 5Y

    // Cryptos
    { pid: '1057391', last: '64.133,2', pcp: '+0,62%' }, // BTC
    { pid: '1061443', last: '1.793,71', pcp: '+1,64%' }  // ETH
];

async function seed() {
    console.log('🌱 Iniciando semeio de preços estáveis de fechamento no Supabase...');
    
    for (const item of initialPrices) {
        const { error } = await supabase
            .from('asset_prices')
            .upsert({
                pid: item.pid,
                last: item.last,
                pcp: item.pcp,
                updated_at: new Date().toISOString()
            });

        if (error) {
            console.error(`❌ Erro ao inserir PID ${item.pid}:`, error.message);
        } else {
            console.log(`✅ Preço semeado para PID ${item.pid} (${item.last} | ${item.pcp})`);
        }
    }

    console.log('🎉 Semeio de preços concluído!');
}

seed();
