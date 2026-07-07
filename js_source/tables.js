// 10 Categorias Oficiais do Edgar Completas (Sem Misturas)

const eua = [
    { sigla: 'S&P 500 FUT (ES)', pid: '8839' },
    { sigla: 'NASDAQ 100 FUT (NQ)', pid: '8874' },
    { sigla: 'DOW JONES FUT (YM)', pid: '8873' },
    { sigla: 'VIX VOLATILIDADE', pid: '44336' },
    { sigla: 'S&P 500 (à vista)', pid: '166' },
    { sigla: 'NASDAQ (à vista)', pid: '20' },
    { sigla: 'DOW JONES (à vista)', pid: '169' },
    { sigla: 'LQD (IG Bond ETF)', pid: '26478' },
    { sigla: 'HYG (High Yield ETF)', pid: '25756' },
    { sigla: 'EWZ (ETF Brasil NY)', pid: '14978' }
];

const curva_eua = [
    { sigla: 'US2Y (JUROS 2A)', pid: '23701' },
    { sigla: 'US10Y (JUROS 10A)', pid: '23705' },
    { sigla: 'US30Y (JUROS 30A)', pid: '23706' }
];

const commodities = [
    { sigla: 'WTI OIL (PETRÓLEO)', pid: '8849' },
    { sigla: 'BRENT OIL (LCO)', pid: '8833' },
    { sigla: 'XAU/USD (OURO)', pid: '8830' },
    { sigla: 'PRATA (XAG/USD)', pid: '8836' },
    { sigla: 'COBRE FUTURO', pid: '8831' },
    { sigla: 'MINÉRIO DE FERRO (SGX)', pid: '961741' },
    { sigla: 'BCOM (BLOOMBERG)', pid: '948434' }
];

const dx = [
    { sigla: 'DXY (ÍNDICE DÓLAR)', pid: '8827' },
    { sigla: 'EUR/USD (EURO)', pid: '2124' },
    { sigla: 'USD/JPY (IENE)', pid: '3' },
    { sigla: 'GBP/USD (LIBRA)', pid: '2126' },
    { sigla: 'USD/CAD (CANADÁ)', pid: '7' },
    { sigla: 'USD/SEK (SUÉCIA)', pid: '41' },
    { sigla: 'USD/CHF (SUÍÇA)', pid: '4' }
];

const brasil = [
    { sigla: 'USD/BRL (DÓLAR)', pid: '2103' },
    { sigla: 'MINI IBOVESPA', pid: '941612' },
    { sigla: 'IBOVESPA (à vista)', pid: '179' },
    { sigla: 'BRL10Y (JUROS 10A)', pid: '24029' },
    { sigla: 'CDS 5Y (RISCO BR)', pid: '1116031' }
];

const emergentes = [
    { sigla: 'USD/BRL (BRASIL)', pid: '2103' },
    { sigla: 'USD/MXN (MÉXICO)', pid: '39' },
    { sigla: 'USD/ZAR (ÁFRICA S.)', pid: '17' },
    { sigla: 'USD/CNY (CHINA)', pid: '2111' },
    { sigla: 'USD/TRY (TURQUIA)', pid: '18' },
    { sigla: 'USD/INR (ÍNDIA)', pid: '160' },
    { sigla: 'USD/RUB (RÚSSIA)', pid: '2186' },
    { sigla: 'USD/HUF (HUNGRIA)', pid: '91' },
    { sigla: 'USD/PLN (POLÔNIA)', pid: '40' },
    { sigla: 'USD/CZK (REP. CHECA)', pid: '103' },
    { sigla: 'USD/IDR (INDONÉSIA)', pid: '2138' }
];

const latam = [
    { sigla: 'USD/BRL (BRASIL)', pid: '2103' },
    { sigla: 'USD/ARS (ARGENTINA)', pid: '2090' },
    { sigla: 'USD/CLP (CHILE)', pid: '2110' },
    { sigla: 'USD/COP (COLÔMBIA)', pid: '2112' },
    { sigla: 'USD/PEN (PERU)', pid: '2177' },
    { sigla: 'USD/PYG (PARAGUAI)', pid: '2181' },
    { sigla: 'USD/UYU (URUGUAI)', pid: '2210' },
    { sigla: 'USD/BOB (BOLÍVIA)', pid: '2102' }
];

const europa = [
    { sigla: 'STOXX 600 (EUROPA)', pid: '40823' },
    { sigla: 'FTSE 100 (REINO U.)', pid: '27' },
    { sigla: 'DAX 30 (ALEMANHA)', pid: '8826' },
    { sigla: 'FTSE MIB (MILÃO)', pid: '177' },
    { sigla: 'IBEX 35 (MADRI)', pid: '24228' },
    { sigla: 'CAC 40 (FRANÇA)', pid: '167' },
    { sigla: 'NIKKEI 225 (JAPÃO)', pid: '36' },
    { sigla: 'HANG SENG FUT (HK)', pid: '184' },
    { sigla: 'SHANGHAI (CHINA)', pid: '37583' }
];

const dolar_mundo = [
    { sigla: 'USD/CRC (C. RICA)', pid: '2113' },
    { sigla: 'USD/DOP (R. DOM.)', pid: '2118' },
    { sigla: 'USD/HNL (HONDURAS)', pid: '2135' },
    { sigla: 'USD/HTG (HAITI)', pid: '2137' },
    { sigla: 'USD/JMD (JAMAICA)', pid: '2142' },
    { sigla: 'USD/NIO (NICARÁGUA)', pid: '2172' },
    { sigla: 'USD/SVC (EL SALV.)', pid: '2199' },
    { sigla: 'USD/DKK (DINAMARCA)', pid: '43' },
    { sigla: 'USD/NOK (NORUEGA)', pid: '59' },
    { sigla: 'USD/EGP (EGITO)', pid: '2122' },
    { sigla: 'USD/NGN (NIGÉRIA)', pid: '2171' },
    { sigla: 'USD/HKD (HONG KONG)', pid: '155' },
    { sigla: 'USD/ILS (ISRAEL)', pid: '63' },
    { sigla: 'USD/KRW (COREIA S.)', pid: '650' },
    { sigla: 'USD/PHP (FILIPINAS)', pid: '2179' },
    { sigla: 'USD/SGD (CINGAPURA)', pid: '42' },
    { sigla: 'USD/THB (TAILÂNDIA)', pid: '147' },
    { sigla: 'USD/TWD (TAIWAN)', pid: '2206' },
    { sigla: 'USD/AUD (AUSTRÁLIA)', pid: '2091' },
    { sigla: 'USD/NZD (N. ZELÂNDIA)', pid: '2174' },
    { sigla: 'USD/CUP (CUBA)', pid: '2114' },
    { sigla: 'USD/PAB (PANAMÁ)', pid: '2176' },
    { sigla: 'USD/MYR (MALÁSIA)', pid: '2168' }
];

const cryptos = [
    { sigla: 'BITCOIN (BTC/USD)', pid: '1057391' },
    { sigla: 'ETHEREUM (ETH/USD)', pid: '1061443' }
];

// Cache local dos ativos da nuvem (evita chamadas repetidas)
let _cachedCustomAssets = null;

// Recupera ativos customizados do servidor (API)
async function fetchCustomAssetsFromAPI() {
    const token = localStorage.getItem('vsstraeder_token');
    if (!token) return [];
    try {
        const resp = await fetch('/api/assets', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!resp.ok) return [];
        const data = await resp.json();
        _cachedCustomAssets = (data.assets || []).map(a => ({
            sigla: a.name,
            pid:   a.pid,
            categoria: a.category,
            id: a.id
        }));
        return _cachedCustomAssets;
    } catch (e) {
        console.error('Erro ao buscar ativos da API:', e);
        return [];
    }
}

// Retorna o cache ou [] enquanto carrega
function getCustomAssets() {
    return _cachedCustomAssets || [];
}

// Combina os ativos padrão com os customizados divididos nas 10 categorias oficiais
function getCombinedAssets() {
    const custom = getCustomAssets();
    return {
        eua: [...eua, ...custom.filter(a => a.categoria === 'eua')],
        curva_eua: [...curva_eua, ...custom.filter(a => a.categoria === 'curva_eua')],
        commodities: [...commodities, ...custom.filter(a => a.categoria === 'commodities')],
        dx: [...dx, ...custom.filter(a => a.categoria === 'dx')],
        brasil: [...brasil, ...custom.filter(a => a.categoria === 'brasil')],
        emergentes: [...emergentes, ...custom.filter(a => a.categoria === 'emergentes')],
        latam: [...latam, ...custom.filter(a => a.categoria === 'latam')],
        europa: [...europa, ...custom.filter(a => a.categoria === 'europa')],
        dolar: [...dolar_mundo, ...custom.filter(a => a.categoria === 'dolar')],
        cryptos: [...cryptos, ...custom.filter(a => a.categoria === 'cryptos')]
    };
}

const row = (obj, isCustom = false) => {
    const deleteBtn = isCustom ? 
        `<button class="delete-asset-btn text-rose-500 hover:text-rose-400 ml-2 focus:outline-none transition-colors duration-200" onclick="removeAsset('${obj.pid}')" title="Excluir Ativo">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
         </button>` : '';

    return `
        <tr class="pid-${obj.pid}-line transition-all duration-300">
            <td class="pid-${obj.pid}-ativo text-left font-bold py-1 px-2 text-xs rounded-l-lg flex items-center justify-between">
                <span>${obj.sigla}</span>
                ${deleteBtn}
            </td>
            <td class="pid-${obj.pid}-percentil py-1 px-2">
                <div class="percentil-bar-container bg-slate-700/30 rounded-full h-1.5 w-full overflow-hidden relative">
                    <div class="percentil-bar-value bg-gradient-to-r from-blue-500 to-emerald-400 h-full w-0 transition-all duration-500 rounded-full"></div>
                </div>
            </td>
            <td class="pid-${obj.pid}-pcp text-center font-extrabold py-1 px-2 text-xs">0.00%</td>
            <td class="pid-${obj.pid}-last text-right font-extrabold py-1 px-2 rounded-r-lg text-xs">0.00</td>
        </tr>`;
};

const createTable = (table_selector, data, areCustomMap) => {
    const tbody = document.querySelector(table_selector);
    if (tbody) {
        tbody.innerHTML = data.map(obj => row(obj, areCustomMap[obj.pid])).join('');
        summary.initSummary(table_selector, data);
    }
};

// Variáveis Globais de Processamento
let all_data = [];
let pid_arr = [];

async function loadAllTables() {
    // Busca ativos da nuvem (API) se ainda não carregou
    if (_cachedCustomAssets === null) {
        await fetchCustomAssetsFromAPI();
    }

    const assets = getCombinedAssets();
    
    const custom = getCustomAssets();
    const areCustomMap = {};
    custom.forEach(a => {
        areCustomMap[a.pid] = true;
    });

    // Amalgama tudo de forma única para inscrição única
    const allRaw = [
        ...assets.eua, ...assets.curva_eua, ...assets.commodities, 
        ...assets.dx, ...assets.brasil, ...assets.emergentes, 
        ...assets.latam, ...assets.europa, ...assets.dolar, ...assets.cryptos
    ];
    
    // Filtra duplicidades para a lista de inscrição dos WebSockets do SockJS
    const uniqueMap = new Map();
    allRaw.forEach(item => {
        uniqueMap.set(item.pid, item);
    });
    
    all_data = Array.from(uniqueMap.values());
    pid_arr = all_data.map(obj => `pid-${obj.pid}:`);

    // Alimenta as 10 tabelas específicas
    createTable('#eua-table', assets.eua, areCustomMap);
    createTable('#curva-table', assets.curva_eua, areCustomMap);
    createTable('#commodities-table', assets.commodities, areCustomMap);
    createTable('#dx-table', assets.dx, areCustomMap);
    createTable('#brasil-table', assets.brasil, areCustomMap);
    createTable('#emergentes-table', assets.emergentes, areCustomMap);
    createTable('#latam-table', assets.latam, areCustomMap);
    createTable('#europa-table', assets.europa, areCustomMap);
    createTable('#dolar-table', assets.dolar, areCustomMap);
    createTable('#cryptos-table', assets.cryptos, areCustomMap);
}

// Inicialização — busca ativos da nuvem antes de renderizar
document.addEventListener('DOMContentLoaded', () => {
    loadAllTables();
});
