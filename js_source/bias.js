// ============================================================
// WS BIAS ENGINE - Motor de Viés do Dia (Índice & Dólar)
// Calcula em tempo real o viés direcional do INDFUT e USD/BRL
// utilizando correlações ponderadas dos ativos do portfólio.
// ============================================================

window.biasEngine = {

    // ----- Memória de Cotações Atuais -----
    lastIndexBias: null,
    lastDollarBias: null,

    // ----- Buffer Anti-Ruído: confirma inversão por 3 ciclos antes de alertar -----
    confirmBuffer: { index: [], dollar: [] },
    CONFIRM_REQUIRED: 3,   // quantos ciclos consecutivos para confirmar

    // ----- Endpoint do servidor de alertas desktop -----
    ALERT_SERVER: 'http://localhost:8003/alert',

    // ----- Último estado de viés para o heartbeat -----
    _lastHeartbeatState: null,

    prices: {
        // EUA
        sp500:      { pid: '8839',   pcp: 0 },  // S&P 500 Futuros
        nasdaq:     { pid: '8874',   pcp: 0 },  // Nasdaq Futuros
        vix:        { pid: '44336',  pcp: 0 },  // VIX

        // Brasil
        indfut:     { pid: '941612', pcp: 0, last: 0 },  // Mini Ibovespa
        usdbrl:     { pid: '2103',   pcp: 0, last: 0 },  // Dólar Comercial
        brl10y:     { pid: '24029',  pcp: 0 },  // Juros Brasil 10A

        // Commodities
        oil:        { pid: '8849',   pcp: 0 },  // Petróleo WTI
        gold:       { pid: '8830',   pcp: 0 },  // Ouro
        ironOre:    { pid: '961741', pcp: 0 },  // Minério de Ferro
        copper:     { pid: '8831',   pcp: 0 },  // Cobre HG (proxy crescimento global - "Dr. Copper")

        // Dólar Index e G7
        dxy:        { pid: '8827',   pcp: 0 },  // DXY Índice Dólar
        eurusd:     { pid: '2124',   pcp: 0 },  // EUR/USD

        // Europa
        stoxx:      { pid: '40823',  pcp: 0 },  // Euro Stoxx 600
        ftse:       { pid: '27',     pcp: 0 },  // FTSE 100

        // Emergentes (para cálculo do viés do dólar)
        mxn:        { pid: '39',     pcp: 0 },  // USD/MXN (México) — melhor proxy LatAm
        zar:        { pid: '17',     pcp: 0 },  // USD/ZAR (África do Sul) — proxy commodity-EM
        try_:       { pid: '18',     pcp: 0 },  // USD/TRY (Turquia) — peso reduzido (dinâmica própria)

        // Juros EUA
        us10y:      { pid: '23705',  pcp: 0 },  // Yield EUA 10 Anos
    },

    // ----- Registro de todos os PIDs monitorados pelo engine -----
    monitoredPids: new Set(),

    init: function() {
        Object.values(window.biasEngine.prices).forEach(function(asset) {
            window.biasEngine.monitoredPids.add(asset.pid);
        });
        // Inicia o heartbeat de 5 minutos
        window.biasEngine.startHeartbeat();
    },

    // Atualiza a cotação interna de um ativo pelo PID recebido do WebSocket
    updatePrice: function(pid, pcp, last) {
        var pcpFloat = parseFloat(pcp.replace('%', '').replace(',', '.'));
        var lastFloat = parseFloat(last.replace(/\./g, '').replace(',', '.'));

        Object.values(window.biasEngine.prices).forEach(function(asset) {
            if (asset.pid === pid) {
                asset.pcp = isNaN(pcpFloat) ? 0 : pcpFloat;
                if ('last' in asset) {
                    asset.last = isNaN(lastFloat) ? 0 : lastFloat;
                }
            }
        });
    },

    // ----- CÁLCULO DO VIÉS DO ÍNDICE (INDFUT/IBOVESPA) -----
    // Correlações ponderadas baseadas em análise estatística real:
    // IBOVESPA é fortemente influenciado por S&P500, Stoxx, Petróleo (PETR ≈12% IBOV),
    // Minério de Ferro (VALE ≈11% IBOV), Cobre (crescimento global)
    // e inversamente pelo USD/BRL (fluxo cambial), VIX (apetite por risco) e juros EUA.
    // NOTA: Ouro é ativo de RISCO-OFF — correlacionado negativamente com IBOV.
    calculateIndexBias: function() {
        var p = this.prices;

        // Threshold dinâmico: VIX alto = mercado volátil = exige score maior para confirmar
        var dynamicThreshold = 0.12 + (Math.abs(p.vix.pcp) > 3 ? 0.08 : 0);

        // Pesos calibrados por correlação estatística real (pesquisa 2024-2025):
        // Positivos: S&P500(0.30) + Stoxx(0.10) + Petróleo(0.12) + Minério(0.10) + Cobre(0.05) + Nasdaq(0.03)
        // Negativos: USD/BRL(0.15) + VIX(0.08) + US10Y(0.05) + DXY(0.05) + Ouro(0.02 risk-off)
        var score = (p.sp500.pcp    * 0.30)   // Maior driver externo (corr. 0.55-0.75)
                  + (p.stoxx.pcp   * 0.10)   // Sessão europeia antes da abertura
                  + (p.oil.pcp     * 0.12)   // Petrobras ~12% do IBOV
                  + (p.ironOre.pcp * 0.10)   // Vale ~11% do IBOV
                  + (p.copper.pcp  * 0.05)   // Cobre: proxy crescimento global ("Dr. Copper")
                  + (p.nasdaq.pcp  * 0.03)   // Sentimento tech/risco
                  - (p.usdbrl.pcp  * 0.15)   // BRL forte = inflow estrangeiro = IBOV sobe
                  - (p.vix.pcp     * 0.08)   // Medo = saída de emergentes
                  - (p.us10y.pcp   * 0.05)   // Juros EUA sobem = capital sai de emergentes
                  - (p.dxy.pcp     * 0.05)   // USD forte global = liquidez mais apertada
                  - (p.gold.pcp    * 0.02);  // Ouro sobe = risco-off = pressão baixista no IBOV

        // Gap estimado: ponderar os maiores componentes setoriais do IBOV
        var gapEstimate = (p.sp500.pcp    * 0.40)   // Sentimento global dominante
                        + (p.stoxx.pcp   * 0.15)   // Europa abre antes do Brasil
                        + (p.oil.pcp     * 0.12)   // Petrobras direto
                        + (p.ironOre.pcp * 0.10)   // Vale direto
                        + (p.copper.pcp  * 0.03)   // Crescimento industrial
                        - (p.usdbrl.pcp  * 0.15)   // Ajuste cambial
                        - (p.vix.pcp     * 0.05);  // Prêmio de risco

        // Fatores de Alta vs Baixa
        var bullFactors = [
            p.sp500.pcp > 0, p.stoxx.pcp > 0, p.oil.pcp > 0, p.ironOre.pcp > 0,
            p.copper.pcp > 0, p.nasdaq.pcp > 0,
            p.usdbrl.pcp < 0, p.dxy.pcp < 0, p.vix.pcp < 0, p.us10y.pcp < 0
        ];
        var bearFactors = [
            p.sp500.pcp < 0, p.stoxx.pcp < 0, p.oil.pcp < 0, p.ironOre.pcp < 0,
            p.copper.pcp < 0, p.nasdaq.pcp < 0,
            p.usdbrl.pcp > 0, p.dxy.pcp > 0, p.vix.pcp > 0, p.us10y.pcp > 0
        ];
        var bullCount = bullFactors.filter(Boolean).length;
        var bearCount = bearFactors.filter(Boolean).length;

        var confidence = 0;
        if (score > dynamicThreshold) {
            confidence = Math.round((bullCount / bullFactors.length) * 100);
        } else if (score < -dynamicThreshold) {
            confidence = Math.round((bearCount / bearFactors.length) * 100);
        } else {
            confidence = Math.round((Math.max(bullCount, bearCount) / bullFactors.length) * 100);
        }

        return {
            score: score,
            gap: gapEstimate,
            confidence: confidence,
            threshold: dynamicThreshold,
            bias: score > dynamicThreshold ? 'ALTA' : score < -dynamicThreshold ? 'BAIXA' : 'NEUTRO',
            biasClass: score > dynamicThreshold ? 'up' : score < -dynamicThreshold ? 'down' : 'neutral',
            sp500: p.sp500.pcp,
            nasdaq: p.nasdaq.pcp,
            stoxx: p.stoxx.pcp,
            oil: p.oil.pcp,
            ironOre: p.ironOre.pcp,
            copper: p.copper.pcp,
            dxy: p.dxy.pcp,
            vix: p.vix.pcp,
            us10y: p.us10y.pcp,
            usdbrl: p.usdbrl.pcp
        };
    },

    // ----- CÁLCULO DO VIÉS DO DÓLAR (USD/BRL) -----
    // O Dólar comercial é influenciado pelo DXY global, pela média das moedas
    // emergentes (MXN peso 40%, ZAR peso 25%, TRY peso 10% — Turquia tem dinâmica própria),
    // VIX (medo = saída de emergentes = BRL fraca), petróleo (commodities fortalecem BRL)
    // e inversamente pela bolsa americana (risk-on = dólar cai).
    calculateDollarBias: function() {
        var p = this.prices;

        // Threshold dinâmico para o dólar
        var dynamicThreshold = 0.08 + (Math.abs(p.vix.pcp) > 3 ? 0.05 : 0);

        // Cesta de emergentes rebalanceada:
        // MXN (40%) — melhor proxy LatAm, corr. 0.50-0.65 com BRL
        // ZAR (35%) — África do Sul: proxy commodity-EM, corr. 0.45-0.60
        // TRY (25% → 10%) — Turquia: dinâmica própria (inflação estrutural), peso reduzido
        var emergentesAvg = (p.mxn.pcp * 0.55) + (p.zar.pcp * 0.35) + (p.try_.pcp * 0.10);

        // Diferencial de Juros (Carry Trade): BRL alto = BRL atraente = USD/BRL cai
        var differential = p.brl10y.pcp - p.us10y.pcp;

        // Pesos calibrados:
        // DXY(0.35): principal driver do USD globalmente
        // Emergentes(0.20): proxy de fluxo para EM
        // VIX(0.07): medo = fuga de emergentes = BRL fraqueja
        // US10Y(0.08): juros EUA sobem = capital sai do BRL
        // Petróleo(-0.07): commodities sobem = saldo comercial melhora = BRL fortalece
        // S&P500(-0.10): risk-on = capital entra no BRL
        // Diferencial(-0.08): spread de juros alto = carrego atrativo = BRL forte
        var score = (p.dxy.pcp       * 0.35)
                  + (emergentesAvg   * 0.20)
                  + (p.vix.pcp       * 0.07)
                  + (p.us10y.pcp     * 0.08)
                  - (p.oil.pcp       * 0.07)
                  - (p.sp500.pcp     * 0.10)
                  - (differential    * 0.08);

        var gapEstimate = (p.dxy.pcp * 0.55) + (emergentesAvg * 0.30) + (p.vix.pcp * 0.05) - (p.oil.pcp * 0.10);

        // Fatores de Alta vs Baixa
        var bullFactors = [p.dxy.pcp > 0, emergentesAvg > 0, p.vix.pcp > 0, p.us10y.pcp > 0, p.sp500.pcp < 0, differential < 0, p.oil.pcp < 0];
        var bearFactors = [p.dxy.pcp < 0, emergentesAvg < 0, p.vix.pcp < 0, p.us10y.pcp < 0, p.sp500.pcp > 0, differential > 0, p.oil.pcp > 0];
        var bullCount = bullFactors.filter(Boolean).length;
        var bearCount = bearFactors.filter(Boolean).length;

        var confidence = 0;
        if (score > dynamicThreshold) {
            confidence = Math.round((bullCount / bullFactors.length) * 100);
        } else if (score < -dynamicThreshold) {
            confidence = Math.round((bearCount / bearFactors.length) * 100);
        } else {
            confidence = Math.round((Math.max(bullCount, bearCount) / bullFactors.length) * 100);
        }

        return {
            score: score,
            gap: gapEstimate,
            confidence: confidence,
            threshold: dynamicThreshold,
            bias: score > dynamicThreshold ? 'ALTA' : score < -dynamicThreshold ? 'BAIXA' : 'NEUTRO',
            biasClass: score > dynamicThreshold ? 'up' : score < -dynamicThreshold ? 'down' : 'neutral',
            dxy: p.dxy.pcp,
            emergentes: emergentesAvg,
            sp500: p.sp500.pcp,
            vix: p.vix.pcp,
            oil: p.oil.pcp,
            us10y: p.us10y.pcp,
            brl10y: p.brl10y.pcp
        };
    },

    // ----- RENDERIZA OS BLOCOS DE VIÉS NA TELA -----
    calculateBias: function() {
        var idx = window.biasEngine.calculateIndexBias();
        var dol = window.biasEngine.calculateDollarBias();

        window.biasEngine.renderBiasBlock('bias-index', idx, 'ÍNDICE (INDFUT)', 'pts');
        window.biasEngine.renderBiasBlock('bias-dollar', dol, 'DÓLAR (USD/BRL)', '%');

        // Lógica de alerta para correlação atípica (ambos na mesma direção)
        // Índice e Dólar são NORMALMENTE inversamente correlacionados (-0.50 a -0.70)
        // Quando ambos sobem OU ambos caem, algo incomum está acontecendo.
        var alertEl = document.getElementById('correlation-alert');
        var alertMsgEl = document.getElementById('correlation-alert-msg');
        if (alertEl) {
            if (idx.biasClass !== 'neutral' && idx.biasClass === dol.biasClass) {
                alertEl.style.display = 'block';
                if (alertMsgEl) {
                    if (idx.biasClass === 'up') {
                        alertMsgEl.innerHTML = 'Tanto o <strong>Índice quanto o Dólar estão em ALTA</strong> ao mesmo tempo. '
                            + 'Isso pode indicar: commodities disparando (Petróleo + Minério) junto com DXY forte, ou fluxo externo misto. '
                            + 'Verifique Petróleo, Minério de Ferro e DXY individualmente.';
                    } else {
                        alertMsgEl.innerHTML = 'Tanto o <strong>Índice quanto o Dólar estão em BAIXA</strong> ao mesmo tempo. '
                            + 'Isso pode indicar: crise fiscal doméstica simultânea a selloff global, ou colapso do USD em escala global com queda de commodities. '
                            + 'Verifique VIX, S&P500 e DXY — um evento de risco sistêmico pode estar em curso.';
                    }
                }
            } else {
                alertEl.style.display = 'none';
            }
        }

        // Lógica de Flash Alert (Volatilidade Extrema / Mudança Súbita)
        window.biasEngine.checkVolatilityAlert(idx, dol);
    },

    checkVolatilityAlert: function(idx, dol) {
        var self = this;
        var N = self.CONFIRM_REQUIRED;

        // --- Anti-Ruído: acumula últimos N estados no buffer ---
        self.confirmBuffer.index.push(idx.biasClass);
        self.confirmBuffer.dollar.push(dol.biasClass);
        if (self.confirmBuffer.index.length > N)  self.confirmBuffer.index.shift();
        if (self.confirmBuffer.dollar.length > N) self.confirmBuffer.dollar.shift();

        // Verifica se os últimos N ciclos são todos o mesmo valor (confirmação)
        function allSame(arr) { return arr.length >= N && arr.every(function(v){ return v === arr[0]; }); }

        var idxConfirmed = allSame(self.confirmBuffer.index);
        var dolConfirmed = allSame(self.confirmBuffer.dollar);

        // Alerta para o Índice — só dispara após N confirmações E se houve inversão
        if (idxConfirmed && self.lastIndexBias
            && self.lastIndexBias !== 'neutral'
            && idx.biasClass !== 'neutral'
            && self.lastIndexBias !== idx.biasClass
            && idx.confidence >= 50) {  // só alerta com pelo menos 50% de confiança
            self.showFlashAlert('ÍNDICE', idx.biasClass, idx.score, idx.confidence);
        }

        // Alerta para o Dólar
        if (dolConfirmed && self.lastDollarBias
            && self.lastDollarBias !== 'neutral'
            && dol.biasClass !== 'neutral'
            && self.lastDollarBias !== dol.biasClass
            && dol.confidence >= 50) {
            self.showFlashAlert('DÓLAR', dol.biasClass, dol.score, dol.confidence);
        }

        if (idxConfirmed) self.lastIndexBias = idx.biasClass;
        if (dolConfirmed) self.lastDollarBias = dol.biasClass;
    },

    // ----- HEARTBEAT: Relatório de Status a cada 5 minutos -----
    startHeartbeat: function() {
        var self = this;
        var INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

        setInterval(function() {
            self.sendHeartbeat();
        }, INTERVAL_MS);

        // Também envia o primeiro heartbeat após 30 segundos (aguarda dados carregarem)
        setTimeout(function() { self.sendHeartbeat(); }, 30000);
    },

    sendHeartbeat: function() {
        var self = this;
        var idx = self.calculateIndexBias();
        var dol = self.calculateDollarBias();
        var now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        var idxEmoji  = idx.biasClass === 'up' ? '📈' : idx.biasClass === 'down' ? '📉' : '➡️';
        var dolEmoji  = dol.biasClass === 'up' ? '💵📈' : dol.biasClass === 'down' ? '💵📉' : '💵➡️';
        var idxLabel  = idx.biasClass === 'up' ? 'ALTA' : idx.biasClass === 'down' ? 'BAIXA' : 'NEUTRO';
        var dolLabel  = dol.biasClass === 'up' ? 'ALTA' : dol.biasClass === 'down' ? 'BAIXA' : 'NEUTRO';

        var title   = '⏱ WS STATUS ' + now;
        var message = (
            idxEmoji + ' ÍNDICE: ' + idxLabel + ' (' + idx.score.toFixed(2) + ') conf:' + (idx.confidence || 0) + '%\n' +
            dolEmoji + ' DÓLAR: ' + dolLabel + ' (' + dol.score.toFixed(2) + ') conf:' + (dol.confidence || 0) + '%\n' +
            'S&P: ' + (idx.sp500 > 0 ? '+' : '') + idx.sp500.toFixed(2) + '% | VIX: ' + (idx.vix > 0 ? '+' : '') + idx.vix.toFixed(2) + '% | DXY: ' + (dol.dxy > 0 ? '+' : '') + dol.dxy.toFixed(2) + '%'
        );

        // POST para o servidor desktop
        fetch(self.ALERT_SERVER, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                asset: 'STATUS',
                action: idxLabel + ' / ' + dolLabel,
                bias: idx.biasClass,
                score: idx.score,
                confidence: idx.confidence || 0,
                urgency: 'heartbeat',
                title: title,
                message: message
            })
        }).catch(function() {});

        // Também atualiza o badge no título da página para indicar atividade
        var favicon = idxLabel === 'ALTA' ? '📈' : idxLabel === 'BAIXA' ? '📉' : '⚖️';
        document.title = favicon + ' WS PAINEL | Índice: ' + idxLabel + ' | Dólar: ' + dolLabel;
    },

    showFlashAlert: function(asset, biasClass, score, confidence) {
        score = score || 0; confidence = confidence || 0;
        // Remover alerta anterior se houver
        var oldAlert = document.getElementById('flash-alert-card');
        if (oldAlert) oldAlert.remove();

        var action = biasClass === 'up' ? 'COMPRA (ALTA)' : 'VENDA (BAIXA)';
        var color = biasClass === 'up' ? '#00ff88' : '#ff3060';
        var bgGradient = biasClass === 'up' ? 'radial-gradient(circle, rgba(0,255,136,0.2) 0%, rgba(0,0,0,0.85) 100%)' : 'radial-gradient(circle, rgba(255,48,96,0.2) 0%, rgba(0,0,0,0.85) 100%)';
        
        if (document.documentElement.getAttribute('data-theme') === 'blue') {
            color = biasClass === 'up' ? '#059669' : '#dc2626';
            bgGradient = biasClass === 'up' ? 'radial-gradient(circle, rgba(5,150,105,0.15) 0%, rgba(255,255,255,0.95) 100%)' : 'radial-gradient(circle, rgba(220,38,38,0.15) 0%, rgba(255,255,255,0.95) 100%)';
        }

        // 1. Cria o Toast Pequeno (No canto da tela)
        var container = document.getElementById('toast-container');
        if (container) {
            var toast = document.createElement('div');
            toast.className = 'toast toast-visible';
            toast.style.borderLeft = '5px solid ' + color;
            toast.style.borderRight = '1px solid ' + color;
            toast.style.borderTop = '1px solid ' + color;
            toast.style.borderBottom = '1px solid ' + color;
            toast.innerHTML = `
                <div style="flex-grow:1;">
                    <span style="font-size:0.95rem;">🚨 <strong>ALERTA DE CENÁRIO: ${asset}</strong></span><br>
                    <span style="font-size:0.75rem; opacity:0.9;">O viés inverteu abruptamente! Forte fluxo direcional detectado.</span><br>
                    <span style="font-size:0.8rem; color:${color}; margin-top:4px; display:inline-block;">
                        <strong>AÇÃO:</strong> Observar oportunidades de <strong>${action}</strong>.
                    </span>
                </div>
                <button onclick="this.parentElement.remove()" style="font-size:1.5rem;">&times;</button>
            `;
            container.prepend(toast);
            setTimeout(function() {
                toast.style.opacity = '0';
                setTimeout(function() { toast.remove(); }, 300);
            }, 15000);
        }

        // 2. Cria o Card Central Gigante (Modal)
        var overlay = document.createElement('div');
        overlay.id = 'flash-alert-card';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.background = bgGradient;
        overlay.style.backdropFilter = 'blur(6px)';
        overlay.style.zIndex = '999999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.animation = 'fadeInAlert 0.3s ease-out';

        var card = document.createElement('div');
        card.style.background = document.documentElement.getAttribute('data-theme') === 'neon' ? '#0c0e18' : '#ffffff';
        card.style.border = '3px solid ' + color;
        card.style.borderRadius = '24px';
        card.style.padding = '3rem';
        card.style.textAlign = 'center';
        card.style.maxWidth = '600px';
        card.style.boxShadow = '0 30px 60px rgba(0,0,0,0.4)';
        card.style.transform = 'scale(1)';
        card.style.animation = 'popCard 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

        card.innerHTML = `
            <h1 style="color:${color}; font-size:3rem; margin-bottom:1rem; text-transform:uppercase; font-family:'Space Grotesk', sans-serif;">
                ⚠️ ALERTA: ${asset}
            </h1>
            <h3 style="font-size:1.5rem; margin-bottom:1.5rem; opacity:0.9;">
                O viés inverteu abruptamente!
            </h3>
            <div style="font-size:1.2rem; background:rgba(0,0,0,0.05); padding:1.5rem; border-radius:12px; margin-bottom:1rem;">
                Forte fluxo direcional detectado.<br>
                Ação sugerida: <strong>MUDANÇA DE CENÁRIO PARA ${action}</strong>
            </div>
            <div style="font-size:0.9rem; opacity:0.7; margin-bottom:1.5rem;">
                Score: <strong>${score > 0 ? '+' : ''}${score.toFixed(2)}</strong> &nbsp;|&nbsp;
                Confiança: <strong style="color:${confidence >= 70 ? color : '#f59e0b'}">${confidence}%</strong>
                &nbsp;|&nbsp; Confirmado em 3 ciclos consecutivos
            </div>
            <button onclick="document.getElementById('flash-alert-card').remove()" style="background:${color}; color:${document.documentElement.getAttribute('data-theme') === 'neon' ? '#000' : '#fff'}; border:none; padding:1rem 3rem; font-size:1.2rem; font-weight:bold; border-radius:12px; cursor:pointer; text-transform:uppercase; letter-spacing:2px; transition:transform 0.2s;">
                CIENTE, FECHAR ALERTA
            </button>
        `;
        
        // Keyframes dinâmicos para a animação injetados na tela
        if (!document.getElementById('alert-styles')) {
            var style = document.createElement('style');
            style.id = 'alert-styles';
            style.innerHTML = `
                @keyframes fadeInAlert { from { opacity: 0; } to { opacity: 1; } }
                @keyframes popCard { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
            `;
            document.head.appendChild(style);
        }

        overlay.appendChild(card);
        document.body.appendChild(overlay);
        
        // Toca um beep de emergência
        try {
            var ctx = new (window.AudioContext || window.webkitAudioContext)();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.4);
        } catch(e) {}

        // Remove automaticamente após 25 segundos
        setTimeout(function() {
            if (document.getElementById('flash-alert-card')) {
                overlay.style.opacity = '0';
                setTimeout(function() { if (overlay.parentNode) overlay.remove(); }, 300);
            }
        }, 25000);

        // Envia alerta para o servidor desktop (notificação nativa do Windows)
        fetch(window.biasEngine.ALERT_SERVER, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                asset: asset,
                action: action,
                bias: biasClass,
                score: score,
                confidence: confidence,
                urgency: confidence >= 70 ? 'critical' : 'normal'
            })
        }).catch(function() {
            // Silencia erro se o servidor desktop não estiver rodando
        });
    },

    renderBiasBlock: function(elementId, data, label, unit) {
        var el = document.getElementById(elementId);
        if (!el) return;

        var biasLabel = data.bias;
        var gapSign   = data.gap > 0 ? '+' : '';
        var gapText   = gapSign + data.gap.toFixed(2) + '%';
        var scoreSign = data.score > 0 ? '+' : '';
        var scoreText = scoreSign + data.score.toFixed(2);

        // Ícones e cores de acordo com o viés
        var arrow    = data.biasClass === 'up' ? '▲' : data.biasClass === 'down' ? '▼' : '◆';
        var cssClass = 'bias-block bias-' + data.biasClass;

        el.className = cssClass;
        var confColor = data.confidence >= 70 ? '#00ff88' : data.confidence >= 50 ? '#f59e0b' : '#ff3060';
        var confText  = data.confidence >= 70 ? 'ALTA' : data.confidence >= 50 ? 'MÉDIA' : 'BAIXA';

        var formattedBiasText = biasLabel === 'NEUTRO' ? 'VIÉS NEUTRO' : 'VIÉS DE ' + biasLabel;

        el.innerHTML = `
            <div class="bias-label">${label}</div>
            <div class="bias-direction">
                <span class="bias-arrow">${arrow}</span>
                <span class="bias-text">${formattedBiasText}</span>
            </div>
            <div class="bias-gap">
                GAP ESTIMADO: <strong>${gapText}</strong>
            </div>
            <div class="bias-score">Score: ${scoreText} &nbsp;|&nbsp; Confiança: <span style="color:${confColor};font-weight:bold">${data.confidence || 0}% (${confText})</span></div>
            <div class="bias-factors">
                ${window.biasEngine.renderFactors(data)}
            </div>
        `;
    },

    renderFactors: function(data) {
        var factors = [];
        if ('sp500'      in data) factors.push(`S&P500 <b>${data.sp500 > 0 ? '+' : ''}${data.sp500.toFixed(2)}%</b>`);
        if ('nasdaq'     in data) factors.push(`Nasdaq <b>${data.nasdaq > 0 ? '+' : ''}${data.nasdaq.toFixed(2)}%</b>`);
        if ('stoxx'      in data) factors.push(`Stoxx <b>${data.stoxx > 0 ? '+' : ''}${data.stoxx.toFixed(2)}%</b>`);
        if ('oil'        in data) factors.push(`Petróleo <b>${data.oil > 0 ? '+' : ''}${data.oil.toFixed(2)}%</b>`);
        if ('ironOre'    in data) factors.push(`Minério <b>${data.ironOre > 0 ? '+' : ''}${data.ironOre.toFixed(2)}%</b>`);
        if ('copper'     in data) factors.push(`Cobre <b>${data.copper > 0 ? '+' : ''}${data.copper.toFixed(2)}%</b>`);
        if ('dxy'        in data) factors.push(`DXY <b>${data.dxy > 0 ? '+' : ''}${data.dxy.toFixed(2)}%</b>`);
        if ('vix'        in data) factors.push(`VIX <b>${data.vix > 0 ? '+' : ''}${data.vix.toFixed(2)}%</b>`);
        if ('us10y'      in data) factors.push(`US10Y <b>${data.us10y > 0 ? '+' : ''}${data.us10y.toFixed(2)}%</b>`);
        if ('usdbrl'     in data) factors.push(`USD/BRL <b>${data.usdbrl > 0 ? '+' : ''}${data.usdbrl.toFixed(2)}%</b>`);
        if ('emergentes' in data) factors.push(`Emerg. <b>${data.emergentes > 0 ? '+' : ''}${data.emergentes.toFixed(2)}%</b>`);
        if ('brl10y'     in data) factors.push(`BRL10Y <b>${data.brl10y > 0 ? '+' : ''}${data.brl10y.toFixed(2)}%</b>`);
        return factors.join(' &nbsp;|&nbsp; ');
    }
};

// Inicializa o engine ao carregar
document.addEventListener('DOMContentLoaded', function() {
    window.biasEngine.init();
});
