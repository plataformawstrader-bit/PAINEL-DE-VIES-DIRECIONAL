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

window.addNewAsset = function(sigla, pid, categoria) {
    sigla = sigla.trim().toUpperCase();
    pid   = pid.trim().replace(/\D/g,''); // Remove qualquer não-dígito

    if (!sigla || !pid || !categoria) {
        showToast('⚠️ Preencha os três campos antes de inserir!', 'error');
        return false;
    }

    // Verifica duplicidade
    var isDuplicate = (typeof all_data !== 'undefined') && all_data.some(function(a) { return a.pid === pid; });
    if (isDuplicate) {
        showToast('⚠️ PID ' + pid + ' já está monitorado no painel!', 'error');
        return false;
    }

    // Salva no localStorage
    var stored = [];
    try { stored = JSON.parse(localStorage.getItem('ws_custom_assets_v2') || '[]'); } catch(e) {}
    var alreadyStored = stored.some(function(a) { return a.pid === pid; });
    if (alreadyStored) {
        showToast('⚠️ Este ativo já está salvo!', 'error');
        return false;
    }

    stored.push({ sigla: sigla, pid: pid, categoria: categoria });
    localStorage.setItem('ws_custom_assets_v2', JSON.stringify(stored));

    // Recarrega tabelas SEM flash de tela (sem recarregar página)
    loadAllTables();

    // Inscreve imediatamente no WebSocket aberto
    subscribeOne(pid);

    showToast('✅ ' + sigla + ' (PID: ' + pid + ') inserido com sucesso na categoria ' + categoria + '!', 'success');
    return true;
};

window.removeAsset = function(pid) {
    var stored = [];
    try { stored = JSON.parse(localStorage.getItem('ws_custom_assets_v2') || '[]'); } catch(e) {}
    stored = stored.filter(function(a) { return a.pid !== pid; });
    localStorage.setItem('ws_custom_assets_v2', JSON.stringify(stored));
    activeSubscriptions.delete('pid-' + pid + ':');
    loadAllTables();
    showToast('Ativo removido do painel.', 'success');
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

// ─── Inicia a conexão ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    new_conn();
});
