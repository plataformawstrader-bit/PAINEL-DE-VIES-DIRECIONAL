// fxindex.js V2 — Streaming WebSocket + Bias Engine + Formulário corrigido

const TimeZoneID = 12;
const stream = "https://streaming.forexpros.com";
var sock = null;
var activeSubscriptions = new Set();
var connectionAttempts = 0;

function new_conn() {
    connectionAttempts++;
    updateConnectionStatus('connecting');

    try {
        var options = {
            protocols_whitelist: ['websocket', 'xdr-streaming', 'xhr-streaming', 'iframe-eventsource', 'xdr-polling', 'xhr-polling'],
            debug: false,
            jsessionid: false,
            server_heartbeat_interval: 4000,
            heartbeatTimeout: 2000
        };

        sock = new SockJS(stream + '/echo', null, options);
    } catch(e) {
        console.error('Erro ao criar SockJS:', e);
        setTimeout(new_conn, 5000);
        return;
    }

    var heartbeat, death;
    var events = {};

    function on(event, func) { events[event] = func; }

    var setHeartbeat = function() {
        clearTimeout(heartbeat);
        clearTimeout(death);
        heartbeat = setTimeout(function() {
            if (sock && sock.readyState === SockJS.OPEN) {
                sock.send(JSON.stringify({ _event: "heartbeat", data: 'h' }));
            }
        }, 3000);
        death = setTimeout(function() {
            console.warn('Timeout de heartbeat. Reconectando...');
            if (sock) sock.close();
        }, 60000);
    };

    on("heartbeat", function() {
        clearTimeout(death);
        setHeartbeat();
    });

    sock.onopen = function() {
        connectionAttempts = 0;
        updateConnectionStatus('online');
        setHeartbeat();
        activeSubscriptions.clear();
        subscribeAll();
        console.log('✅ Conectado ao streaming da Investing.com — ' + pid_arr.length + ' ativos inscritos.');
    };

    on("tick", function(e) {
        try {
            var content = JSON.parse(e.data);
            var result = content.message.split('::');
            if (result.length < 2) return;

            var pid_obj = JSON.parse(result[1]);
            var pid = pid_obj.pid;

            // Envia o tick para atualizar o cache do servidor (throttled)
            if (typeof window.sendTickToServer === 'function') {
                window.sendTickToServer(pid, pid_obj.last, pid_obj.pcp);
            }

            // 1. Alimenta o Bias Engine
            if (window.biasEngine && window.biasEngine.monitoredPids.has(pid)) {
                window.biasEngine.updatePrice(pid, pid_obj.pcp, pid_obj.last);
                window.biasEngine.calculateBias();
            }

            // 2. Atualiza tabela de exibição
            var table_selector = summary.findTableByPid(pid);
            if (table_selector) {
                summary.updateSummary(table_selector, pid_obj);

                var curr_avg = summary.getCurrentAvgFormatedOf(table_selector);
                var isPositive = summary.getCurrentAvgOf(table_selector) >= 0;

                var tableEl = document.querySelector(table_selector);
                if (tableEl) {
                    var badge = tableEl.closest("table").querySelector(".avg-badge");
                    if (badge) {
                        badge.textContent = curr_avg;
                        badge.className = "avg-badge " + (isPositive ? "avg-up" : "avg-down");
                    }
                }
            }

            // 3. Barra de percentil
            var pct = calculatePercentil(pid_obj);
            var barEl = document.querySelector('.pid-' + pid + '-percentil .percentil-bar-value');
            if (barEl) barEl.style.width = pct + '%';

            // 4. Cores de alta/baixa
            var pcpFloat = parseFloat(pid_obj.pcp.replace('%','').replace(',','.'));
            var isUp   = pcpFloat > 0;
            var isDown = pcpFloat < 0;

            var lastEl = document.querySelector('.pid-' + pid + '-last');
            var pcpEl  = document.querySelector('.pid-' + pid + '-pcp');
            if (lastEl) {
                lastEl.textContent = pid_obj.last;
                lastEl.classList.remove('color-up','color-down','color-neutral');
                lastEl.classList.add(isUp ? 'color-up' : isDown ? 'color-down' : 'color-neutral');
            }
            if (pcpEl) {
                pcpEl.textContent = pid_obj.pcp;
                pcpEl.classList.remove('color-up','color-down','color-neutral');
                pcpEl.classList.add(isUp ? 'color-up' : isDown ? 'color-down' : 'color-neutral');
            }

            // 5. Flash no nome do ativo (micro-animação de vida)
            var nameEl = document.querySelector('.pid-' + pid + '-ativo');
            if (nameEl) {
                nameEl.classList.add('flash-update');
                setTimeout(function() { nameEl.classList.remove('flash-update'); }, 900);
            }

            // 6. Atualiza título da aba com INDFUT
            if (pid === '941612') {
                document.title = 'INDFUT ' + pid_obj.pcp + ' | ' + pid_obj.last;
            }

            // 7. Gráfico dinâmico da Curva de Juros EUA
            if (pid === '23701' || pid === '23705' || pid === '23706') {
                if (window.yieldCurveChart) {
                    // Normaliza valor: remove pontos de milhar, troca vírgula por ponto decimal
                    var rawVal = String(pid_obj.last || '0').trim();
                    var pVal = parseFloat(rawVal.replace(/\./g,'').replace(',','.'));
                    if (!isNaN(pVal) && pVal > 0) {
                        var now = new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
                        var ds = window.yieldCurveChart.data.datasets;
                        var labels = window.yieldCurveChart.data.labels;
                        var CHART_MAX_POINTS = 60;

                        // Mapeia PID para dataset index
                        var dsIdx = pid === '23701' ? 0 : pid === '23705' ? 1 : 2;
                        
                        // Se o dataset já foi pré-populado, substitui o ÚLTIMO ponto em vez de push
                        // para preservar o janelamento de 60 pontos
                        if (ds[dsIdx].data.length >= CHART_MAX_POINTS) {
                            ds[dsIdx].data.shift();
                        }
                        ds[dsIdx].data.push(pVal);

                        // Mantém os labels alinhados: adiciona 1 label por tick do 10Y apenas
                        if (pid === '23705') {
                            labels.push(now);
                            if (labels.length > CHART_MAX_POINTS) labels.shift();
                        }

                        window.yieldCurveChart.update('none');

                        // Atualiza badge de spread (10Y - 2Y)
                        var v2y  = ds[0].data[ds[0].data.length - 1] || 0;
                        var v10y = ds[1].data[ds[1].data.length - 1] || 0;
                        var spread = v10y - v2y;
                        var badge = document.getElementById('yield-spread-badge');
                        if (badge && v2y > 0 && v10y > 0) {
                            var inv = spread < 0;
                            badge.textContent = 'Spread 10Y-2Y: ' + (spread >= 0 ? '+' : '') + spread.toFixed(2) + 'pp';
                            badge.style.background = inv ? 'rgba(239,68,68,0.2)' : 'rgba(0,255,136,0.15)';
                            badge.style.color = inv ? '#ef4444' : '#00ff88';
                        }
                    }
                }
            }

        } catch(err) {
            console.error('Erro ao processar tick:', err);
        }
    });

    sock.onmessage = function(e) {
        try {
            var data = JSON.parse(e.data);
            if (!data._event) data._event = 'tick';
            if (events[data._event]) events[data._event](e, data);
        } catch (err) {
            console.error('Erro de parsing WebSocket:', err);
            if (sock) sock.close();
            clearTimeout(death);
            setTimeout(new_conn, 3000);
        }
    };

    sock.onclose = function() {
        updateConnectionStatus('offline');
        console.log('WebSocket fechado. Reconectando em 3s...');
        clearTimeout(heartbeat);
        clearTimeout(death);
        var delay = Math.min(3000 * connectionAttempts, 30000);
        setTimeout(new_conn, delay);
    };

    sock.onerror = function(e) {
        console.error('Erro no WebSocket:', e);
    };
}

function subscribeAll() {
    if (!sock || sock.readyState !== SockJS.OPEN) return;
    if (typeof pid_arr === 'undefined' || pid_arr.length === 0) return;

    // Usa bulk-subscribe (formato oficial da Investing.com) para todos os PIDs de uma vez
    sock.send(JSON.stringify({
        _event: "bulk-subscribe",
        tzID: TimeZoneID,
        message: pid_arr.join("%%")
    }));
    pid_arr.forEach(function(val) { activeSubscriptions.add(val); });
    console.log('📡 Bulk-subscribe enviado para ' + pid_arr.length + ' ativos.');
}

// Inscreve um único PID novo sem reiniciar conexão
function subscribeOne(pid) {
    var msg = 'pid-' + pid + ':';
    if (!sock || sock.readyState !== SockJS.OPEN) return;
    if (activeSubscriptions.has(msg)) return;
    sock.send(JSON.stringify({ _event: "bulk-subscribe", tzID: TimeZoneID, message: msg }));
    activeSubscriptions.add(msg);
}

function calculatePercentil(pid_obj) {
    var last = parseFloat((pid_obj.last || '0').replace(/\./g,'').replace(',','.'));
    var min  = parseFloat((pid_obj.low  || '0').replace(/\./g,'').replace(',','.'));
    var max  = parseFloat((pid_obj.high || '0').replace(/\./g,'').replace(',','.'));
    if (max === min) return 0;
    var p = ((last - min) / (max - min)) * 100;
    return isNaN(p) ? 0 : Math.max(0, Math.min(100, p));
}

function updateConnectionStatus(state) {
    var dot  = document.getElementById('conn-dot');
    var text = document.getElementById('conn-text');
    if (!dot || !text) return;
    dot.className = 'conn-dot';
    if (state === 'online') {
        dot.classList.add('dot-online');
        text.textContent = 'Conectado ao Streaming';
    } else if (state === 'connecting') {
        dot.classList.add('dot-connecting');
        text.textContent = 'Conectando...';
    } else {
        dot.classList.add('dot-offline');
        text.textContent = 'Reconectando...';
    }
}

// ─── Adicionar / Remover ativos ────────────────────────────────

window.addNewAsset = async function(sigla, pid, categoria) {
    sigla = sigla.trim().toUpperCase();
    pid   = pid.trim().replace(/\D/g,'');

    if (!sigla || !pid || !categoria) {
        showToast('⚠️ Preencha os três campos antes de inserir!', 'error');
        return false;
    }

    // Verifica duplicidade no painel atual
    var isDuplicate = (typeof all_data !== 'undefined') && all_data.some(function(a) { return a.pid === pid; });
    if (isDuplicate) {
        showToast('⚠️ PID ' + pid + ' já está monitorado no painel!', 'error');
        return false;
    }

    const token = localStorage.getItem('vsstraeder_token');
    if (!token) {
        showToast('❌ Sessão expirada. Faça login novamente.', 'error');
        return false;
    }

    try {
        const resp = await fetch('/api/assets', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: sigla, pid: pid, category: categoria })
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) {
            showToast('❌ Erro ao salvar: ' + (data.error || 'tente novamente'), 'error');
            return false;
        }

        // Atualiza o cache local
        if (_cachedCustomAssets === null) _cachedCustomAssets = [];
        _cachedCustomAssets.push({ sigla: sigla, pid: pid, categoria: categoria, id: data.asset.id });

        // Recarrega tabelas
        loadAllTables();
        subscribeOne(pid);

        showToast('✅ ' + sigla + ' (PID: ' + pid + ') inserido com sucesso na categoria ' + categoria + '!', 'success');
        return true;
    } catch (e) {
        showToast('❌ Falha de conexão ao salvar ativo.', 'error');
        return false;
    }
};

window.removeAsset = async function(pid, assetId) {
    const token = localStorage.getItem('vsstraeder_token');
    if (!token) return;

    // Se não tiver o id diretamente, busca do cache
    let id = assetId;
    if (!id && _cachedCustomAssets) {
        const found = _cachedCustomAssets.find(a => a.pid === pid);
        if (found) id = found.id;
    }

    if (!id) {
        showToast('❌ Não foi possível identificar o ativo para exclusão.', 'error');
        return;
    }

    try {
        const resp = await fetch('/api/assets/' + id, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) {
            showToast('❌ Erro ao remover ativo.', 'error');
            return;
        }
        // Remove do cache local
        if (_cachedCustomAssets) {
            _cachedCustomAssets = _cachedCustomAssets.filter(a => a.pid !== pid);
        }
        activeSubscriptions.delete('pid-' + pid + ':');
        loadAllTables();
        showToast('Ativo removido do painel.', 'success');
    } catch (e) {
        showToast('❌ Falha de conexão ao remover ativo.', 'error');
    }
};

// ─── Toast ─────────────────────────────────────────────────────

window.showToast = function(message, type) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'success');
    toast.innerHTML = '<span>' + message + '</span><button onclick="this.parentElement.remove()">&times;</button>';
    container.appendChild(toast);
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            toast.classList.add('toast-visible');
        });
    });
    setTimeout(function() {
        toast.classList.remove('toast-visible');
        setTimeout(function() { if (toast.parentElement) toast.remove(); }, 300);
    }, 5000);
};

// ─── Cache de Preços do Servidor ───────────────────────────────
var lastSentTimes = {};

window.sendTickToServer = function(pid, last, pcp) {
    var now = Date.now();
    if (lastSentTimes[pid] && (now - lastSentTimes[pid] < 15000)) {
        return; // throttle 15 segundos
    }
    lastSentTimes[pid] = now;

    fetch('/api/prices/tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid: pid, last: last, pcp: pcp })
    }).catch(function() {
        // ignora erros silenciosamente
    });
};

window.loadInitialPrices = async function() {
    try {
        const resp = await fetch('/api/prices');
        const data = await resp.json();
        if (data.success && data.prices) {
            const prices = data.prices;
            Object.keys(prices).forEach(pid => {
                const priceInfo = prices[pid];
                
                // 1. Atualiza o DOM (tabela)
                const lastEl = document.querySelector('.pid-' + pid + '-last');
                const pcpEl  = document.querySelector('.pid-' + pid + '-pcp');
                if (lastEl) lastEl.textContent = priceInfo.last;
                if (pcpEl) {
                    pcpEl.textContent = priceInfo.pcp;
                    var pcpFloat = parseFloat(priceInfo.pcp.replace('%','').replace(',','.'));
                    pcpEl.classList.remove('color-up','color-down','color-neutral');
                    pcpEl.classList.add(pcpFloat > 0 ? 'color-up' : pcpFloat < 0 ? 'color-down' : 'color-neutral');
                }
                
                // 2. Alimenta o Bias Engine
                if (window.biasEngine && window.biasEngine.monitoredPids.has(pid)) {
                    window.biasEngine.updatePrice(pid, priceInfo.pcp, priceInfo.last);
                }
            });
            
            // Recalcula o viés inicial com os preços do cache
            if (window.biasEngine) {
                window.biasEngine.calculateBias();
            }
            
            // 3. Preenche o gráfico da curva de juros com os valores do cache
            // Pré-popula 60 pontos idênticos para que a linha reta apareça instantaneamente
            if (window.yieldCurveChart) {
                const CHART_MAX_POINTS = 60;
                const ds = window.yieldCurveChart.data.datasets;
                const labels = window.yieldCurveChart.data.labels;
                const now = new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
                
                // US 2Y (23701), US 10Y (23705), US 30Y (23706)
                let anyLoaded = false;
                ['23701', '23705', '23706'].forEach((yieldPid, dsIdx) => {
                    if (prices[yieldPid] && prices[yieldPid].last) {
                        // Normaliza: remove pontos de milhar, troca vírgula por ponto
                        const rawLast = String(prices[yieldPid].last).trim();
                        const val = parseFloat(rawLast.replace(/\./g,'').replace(',','.'));
                        if (!isNaN(val) && val > 0) {
                            // Preenche TODOS os 60 slots com o mesmo valor para renderizar a linha
                            ds[dsIdx].data = Array(CHART_MAX_POINTS).fill(val);
                            anyLoaded = true;
                        }
                    }
                });
                
                if (anyLoaded) {
                    // Cria labels fake (60 ticks) para alinhar com os pontos
                    for (let i = 0; i < CHART_MAX_POINTS; i++) labels.push(i === CHART_MAX_POINTS - 1 ? now : '');
                    window.yieldCurveChart.update('none');
                    
                    // Atualiza badge de spread (10Y - 2Y) usando o último ponto de cada dataset
                    const v2y  = ds[0].data[ds[0].data.length - 1] || 0;
                    const v10y = ds[1].data[ds[1].data.length - 1] || 0;
                    const spread = v10y - v2y;
                    const badge = document.getElementById('yield-spread-badge');
                    if (badge && v2y > 0 && v10y > 0) {
                        const inv = spread < 0;
                        badge.textContent = 'Spread 10Y-2Y: ' + (spread >= 0 ? '+' : '') + spread.toFixed(2) + 'pp';
                        badge.style.background = inv ? 'rgba(239,68,68,0.2)' : 'rgba(0,255,136,0.15)';
                        badge.style.color = inv ? '#ef4444' : '#00ff88';
                    }
                }
            }
        }
    } catch (e) {
        console.error('Erro ao carregar preços iniciais do cache:', e);
    }
};

// ─── Inicia a conexão ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    if (typeof window.loadInitialPrices === 'function') {
        window.loadInitialPrices().then(function() {
            new_conn();
        });
    } else {
        new_conn();
    }
});
