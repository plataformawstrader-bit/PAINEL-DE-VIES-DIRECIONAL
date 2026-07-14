const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'vsstraeder_secret_key_2026';

// ========== SUPABASE CLIENT ==========
const supabase = createClient(
    process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_KEY || 'placeholder'
);

// ========== PRICE CACHE SYSTEM ==========
const priceCache = {
    // Juros EUA (semente inicial realista para evitar começar zerado)
    '23701': { last: '4,172', pcp: '0,00%', timestamp: Date.now() }, // US2Y
    '23705': { last: '4,556', pcp: '0,00%', timestamp: Date.now() }, // US10Y
    '23706': { last: '5,067', pcp: '0,00%', timestamp: Date.now() }, // US30Y
    // Dólar e Índices globais
    '8827':  { last: '104,50', pcp: '0,00%', timestamp: Date.now() }, // DXY
    '44336': { last: '15,00',  pcp: '0,00%', timestamp: Date.now() }, // VIX
    '8839':  { last: '5.200,00', pcp: '0,00%', timestamp: Date.now() } // S&P 500
};

// ========== CONFIGURAÇÃO DE EMAIL ==========
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ========== MIDDLEWARES DE SEGURANÇA ==========
app.use(helmet({
    contentSecurityPolicy: false // Desativado para permitir carregamento de scripts externos do SockJS/Investing
}));
app.use(cors({
    origin: '*', // Permitir Vercel e origens locais
    credentials: true
}));
app.use(express.json());

// Confiar no proxy da Vercel para pegar o IP real do usuário (evita block global no Rate Limit)
app.set('trust proxy', 1);

// Servir arquivos estáticos (páginas HTML, CSS e JS) da raiz
app.use(express.static(__dirname));

// Rate Limiting para rotas sensíveis
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // Máximo 10 requisições por IP
    message: { error: 'Muitas tentativas feitas a partir deste IP. Tente novamente mais tarde.' }
});

// ========== AUXILIARES DE WHATSAPP (API Evolution) ==========
async function sendWhatsAppMessage(phone, message) {
    if (!process.env.WHATSAPP_API_URL || !process.env.WHATSAPP_API_KEY) {
        console.log(`[WhatsApp Simulado] Para ${phone}: ${message}`);
        return { success: true, status: 'simulated' };
    }

    try {
        let cleanPhone = phone.replace(/\D/g, ''); // Apenas números

        // Garante o prefixo +55 (Brasil) se for número nacional de 10 ou 11 dígitos
        if (cleanPhone.length === 10 || cleanPhone.length === 11) {
            cleanPhone = '55' + cleanPhone;
        }

        const response = await fetch(`${process.env.WHATSAPP_API_URL}/message/sendText/${process.env.WHATSAPP_INSTANCE}`, {
            method: 'POST',
            headers: {
                'apikey': process.env.WHATSAPP_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                number: cleanPhone,
                text: message,
                delay: 1200
            })
        });
        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        console.error('Erro no envio de WhatsApp:', error);
        return { success: false, error: error.message };
    }
}

// ========== FUNÇÕES AUXILIARES DE ASSINATURA ==========
const PLANOS = {
    monthly: { price: 249.00, days: 30, name: 'Mensal' },
    annual: { price: 2490.00, days: 365, name: 'Anual' }
};

function generateAffiliateCode() {
    return 'VS' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Função para verificar status de acesso do usuário
function getUserAccessStatus(user) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Verificação de Bloqueio Administrativo
    if (user.is_blocked || (user.blocked_until && new Date(user.blocked_until) > today)) {
        return {
            allowed: false,
            reason: 'blocked',
            message: 'Esta conta foi suspensa temporariamente pelo administrador.'
        };
    }

    // 2. Verificação de Assinatura Ativa (Paga)
    if (user.subscription_end && new Date(user.subscription_end) >= today) {
        const daysLeft = Math.ceil((new Date(user.subscription_end) - today) / (1000 * 60 * 60 * 24));
        return {
            allowed: true,
            type: 'paid',
            plan: user.subscription_plan,
            daysLeft: daysLeft
        };
    }

    // 3. Verificação de Período de Testes (Trial)
    if (user.trial_end && new Date(user.trial_end) >= today) {
        const daysLeft = Math.ceil((new Date(user.trial_end) - today) / (1000 * 60 * 60 * 24));
        return {
            allowed: true,
            type: 'trial',
            daysLeft: daysLeft
        };
    }

    // 4. Acesso Expirado
    return {
        allowed: false,
        reason: 'expired',
        message: 'Seu período de acesso expirou. Efetue um pagamento para continuar!'
    };
}

// ========== MIDDLEWARES DE AUTENTICAÇÃO ==========
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Token de autenticação não fornecido' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Buscar usuário e conferir sessão ativa no banco (Login Único)
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', decoded.id)
            .single();

        if (error || !user) {
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }

        // Validação de Login Único (Garante que a session_id do token é a mesma ativa no banco)
        if (decoded.sessionId !== user.current_session_id) {
            return res.status(401).json({
                error: 'Simultaneous_login',
                message: 'Esta conta foi conectada em outro navegador/dispositivo.'
            });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Token expirado ou inválido' });
    }
}

async function requireAdmin(req, res, next) {
    if (!req.user || !req.user.is_admin) {
        return res.status(403).json({ error: 'Acesso negado. Administrador requerido.' });
    }
    next();
}

// ========== ROTAS DE API: AUTENTICAÇÃO & CADASTRO ==========

// Registro de Usuário com Prevenção de Abuso de Trial
app.post('/api/register', authLimiter, async (req, res) => {
    const { name, email, phone, password, referralCode, deviceFingerprint } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Nome, e-mail e senha são campos obrigatórios.' });
    }

    try {
        // 1. Verificar se e-mail ou telefone já existem
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .single();

        if (existingUser) {
            return res.status(400).json({ error: 'Este endereço de e-mail já está cadastrado.' });
        }

        if (phone) {
            const { data: existingPhone } = await supabase
                .from('users')
                .select('id')
                .eq('phone', phone)
                .single();
            if (existingPhone) {
                return res.status(400).json({ error: 'Este número de WhatsApp já está cadastrado.' });
            }
        }

        // 2. Prevenção de Abuso de Trial (Verificar Fingerprint)
        let trialDays = 7;
        let isTrialAbused = false;

        if (deviceFingerprint) {
            const { data: duplicateFingerprint } = await supabase
                .from('users')
                .select('id, trial_end')
                .eq('device_fingerprint', deviceFingerprint)
                .limit(1);

            if (duplicateFingerprint && duplicateFingerprint.length > 0) {
                trialDays = 0; // Cadastro aceito, mas expira no mesmo dia
                isTrialAbused = true;
            }
        }

        // 3. Sistema de Indicação (Afiliados)
        let referredBy = null;
        if (referralCode) {
            const { data: referrer } = await supabase
                .from('users')
                .select('id')
                .eq('affiliate_code', referralCode)
                .single();
            if (referrer) referredBy = referrer.id;
        }

        // Hash da Senha
        const passwordHash = await bcrypt.hash(password, 10);
        const affiliateCode = generateAffiliateCode();
        
        // Datas de Trial
        const trialStart = new Date();
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + trialDays);

        // Salvar usuário
        const { data: newUser, error } = await supabase
            .from('users')
            .insert({
                name,
                email,
                phone: phone || null,
                password_hash: passwordHash,
                affiliate_code: affiliateCode,
                referred_by: referredBy,
                trial_start: trialDays > 0 ? trialStart : null,
                trial_end: trialDays > 0 ? trialEnd : null,
                device_fingerprint: deviceFingerprint || null,
                is_active: trialDays > 0
            })
            .select()
            .single();

        if (error) throw error;

        // Disparar e-mail de boas-vindas
        if (trialDays > 0) {
            transporter.sendMail({
                from: `"WS TRADER" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Bem-vindo ao VSSTRAEDER! 🚀',
                html: `<h1>Olá ${name}!</h1><p>Seu acesso de <strong>7 dias GRATUITOS</strong> foi ativado com sucesso.</p><p>Código de Afiliado: <strong>${affiliateCode}</strong> (Ganhe 20% indicando amigos).</p>`
            }).catch(e => console.error('Nodemailer erro:', e));
        }

        res.json({
            success: true,
            message: isTrialAbused 
                ? 'Conta cadastrada. Como este computador já usou o período grátis, é necessário assinar para liberar.' 
                : 'Conta criada com sucesso! 7 dias grátis ativos.',
            abused: isTrialAbused
        });

    } catch (error) {
        console.error('Erro de Registro:', error);
        res.status(500).json({ error: 'Erro interno ao realizar cadastro.' });
    }
});

// Login de Usuário (Enforçando Login Único / Sessão Única)
app.post('/api/login', authLimiter, async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'E-mail e senha são necessários.' });
    }

    try {
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (!user) return res.status(401).json({ error: 'Credenciais inválidas.' });

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(401).json({ error: 'Credenciais inválidas.' });

        // Gerar nova identificação de sessão única (Garante derrubar login anterior)
        const newSessionId = crypto.randomUUID();

        // Atualizar última sessão e login
        await supabase
            .from('users')
            .update({
                last_login: new Date(),
                current_session_id: newSessionId
            })
            .eq('id', user.id);

        // Verificar status de acesso (Expirado/Bloqueado/Ativo)
        const access = getUserAccessStatus(user);

        // Se estiver bloqueado administrativamente, impede login
        if (!access.allowed && access.reason === 'blocked') {
            return res.status(403).json({ error: access.message, code: 'blocked' });
        }

        // Gerar Token JWT com claim de sessionId
        const token = jwt.sign({
            id: user.id,
            email: user.email,
            name: user.name,
            sessionId: newSessionId
        }, JWT_SECRET, { expiresIn: '15d' });

        res.json({
            success: true,
            token,
            accessType: access.type,
            daysLeft: access.daysLeft || 0,
            allowed: access.allowed,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                isAdmin: user.is_admin,
                affiliateCode: user.affiliate_code
            }
        });

    } catch (error) {
        console.error('Erro de Login:', error);
        res.status(500).json({ error: 'Erro interno ao realizar login.' });
    }
});

// Verificação de Acesso ativa do Painel
app.get('/api/verify-access', authenticateToken, (req, res) => {
    const access = getUserAccessStatus(req.user);
    res.json({
        authenticated: true,
        allowed: access.allowed,
        reason: access.reason || null,
        message: access.message || null,
        daysLeft: access.daysLeft || 0,
        type: access.type || null,
        user: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
            isAdmin: req.user.is_admin,
            affiliateCode: req.user.affiliate_code
        }
    });
});

// Logout
app.post('/api/logout', authenticateToken, async (req, res) => {
    try {
        // Invalida a sessão atual no banco
        await supabase
            .from('users')
            .update({ current_session_id: null })
            .eq('id', req.user.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao deslogar' });
    }
});

// ========== SOLICITAÇÃO DE RECUPERAÇÃO DE SENHA ==========
app.post('/api/recover-password', authLimiter, async (req, res) => {
    const { contact, method } = req.body; // contact = email ou whatsapp, method = 'email' ou 'whatsapp'

    try {
        let query = supabase.from('users').select('id, email, phone, name');
        if (method === 'email') {
            query = query.eq('email', contact);
        } else {
            // Limpa formatação para buscar WhatsApp
            const cleanPhone = contact.replace(/\D/g, '');
            query = query.eq('phone', cleanPhone);
        }

        const { data: user } = await query.single();
        
        // Resposta genérica para evitar enumeração de contas
        if (!user) {
            return res.json({ success: true, message: 'Se o cadastro existir, as instruções foram enviadas!' });
        }

        const recoveryToken = crypto.randomBytes(3).toString('hex').toUpperCase(); // Código de 6 dígitos legível
        const expires = new Date();
        expires.setMinutes(expires.getMinutes() + 15); // Expira em 15 minutos

        await supabase
            .from('users')
            .update({
                recovery_token: recoveryToken,
                recovery_expires: expires
            })
            .eq('id', user.id);

        let whatsappLink = null;
        if (method === 'email') {
            try {
                await transporter.sendMail({
                    from: `"VSSTRAEDER" <${process.env.EMAIL_USER}>`,
                    to: user.email,
                    subject: 'Código de Recuperação de Senha',
                    html: `<h1>Recuperação de Senha</h1><p>Olá ${user.name}, seu código de recuperação é:</p><h2 style="background:#0a0f1a;color:#00ff88;padding:10px;text-align:center;font-size:24px;letter-spacing:4px;">${recoveryToken}</h2><p>Código válido por 15 minutos.</p>`
                });
            } catch (mailErr) {
                console.warn('⚠️ Falha no envio de e-mail (SMTP desconfigurado):', mailErr.message);
            }
        } else if (method === 'whatsapp') {
            const cleanPhone = user.phone || contact.replace(/\D/g, '');
            if (cleanPhone) {
                try {
                    const result = await sendWhatsAppMessage(
                        cleanPhone,
                        `🔐 *RECUPERAÇÃO DE SENHA - VSSTRAEDER*\n\nOlá ${user.name || 'Cliente'},\nSeu código de redefinição de senha é: *${recoveryToken}*\n\nEle expira em 15 minutos. Use-o na tela de redefinição.`
                    );
                    if (!result.success || result.status === 'simulated') {
                        // Se for simulado ou falhar, gera o link direto de fallback para o WhatsApp do suporte
                        const supportNumber = '5575981595225';
                        const text = encodeURIComponent(`Olá, preciso do código de recuperação de senha para a conta ${user.email}. O token gerado no banco foi: ${recoveryToken}`);
                        whatsappLink = `https://wa.me/${supportNumber}?text=${text}`;
                    }
                } catch (wsErr) {
                    console.warn('⚠️ Falha no envio de WhatsApp:', wsErr.message);
                }
            }
        }

        // SEMPRE printa o token no log para permitir resgate manual pelo admin
        console.log(`\n======================================================`);
        console.log(`🔑 CÓDIGO DE RECUPERAÇÃO GERADO COM SUCESSO!`);
        console.log(`👤 Usuário: ${user.name} (${user.email})`);
        console.log(`🎫 Código (Token): ${recoveryToken}`);
        console.log(`⏰ Expira em: ${expires.toLocaleTimeString('pt-BR')}`);
        console.log(`======================================================\n`);

        res.json({ 
            success: true, 
            message: 'Código de recuperação processado com sucesso! Se os canais automáticos estiverem ativos você receberá a mensagem. Caso contrário, fale com o suporte.',
            whatsappLink: whatsappLink
        });

    } catch (error) {
        console.error('Erro de recuperação:', error);
        res.status(500).json({ error: 'Erro ao processar recuperação.' });
    }
});
// Redefinição de Senha
app.post('/api/reset-password', authLimiter, async (req, res) => {
    const { token, newPassword } = req.body;

    try {
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('recovery_token', token)
            .single();

        if (!user) return res.status(400).json({ error: 'Código de recuperação inválido ou inexistente.' });

        const now = new Date();
        if (new Date(user.recovery_expires) < now) {
            return res.status(400).json({ error: 'Código expirado. Solicite um novo código.' });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await supabase
            .from('users')
            .update({
                password_hash: passwordHash,
                recovery_token: null,
                recovery_expires: null,
                current_session_id: null // Desloga todos os logins anteriores por segurança
            })
            .eq('id', user.id);

        res.json({ success: true, message: 'Senha redefinida com sucesso! Faça login novamente.' });

    } catch (error) {
        res.status(500).json({ error: 'Erro ao redefinir senha.' });
    }
});

// ========== WEBHOOK INTEGRADO (KIWIFY / CACTO) ==========
app.post('/api/payment-webhook', async (req, res) => {
    const body = req.body;

    // Log para fins de debug e homologação
    console.log('[Webhook Recebido]:', JSON.stringify(body));

    try {
        // Extrai campos resilientes do payload da Kiwify / Cacto
        const dataPayload = body.data || body;
        
        const orderStatus = dataPayload.order_status || dataPayload.status;
        const buyerEmail = dataPayload.customer?.email || dataPayload.buyer_email || (dataPayload.customer && dataPayload.customer.email);
        const productName = dataPayload.product?.product_name || (dataPayload.product && dataPayload.product.name);
        const amount = parseFloat(dataPayload.amount || dataPayload.price || 0);
        const paymentMethod = dataPayload.payment_method || 'checkout';
        const transactionId = dataPayload.order_id || dataPayload.id || `TX_${Date.now()}`;

        if (!buyerEmail || !orderStatus) {
            return res.status(400).json({ error: 'Payload incompleto para processamento.' });
        }

        // Buscar usuário correspondente
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('email', buyerEmail)
            .single();

        if (!user) {
            console.log(`[Webhook] Comprador ${buyerEmail} não cadastrado no painel. Registrando pagamento flutuante.`);
            return res.status(200).json({ status: 'ignored', reason: 'user_not_found' });
        }

        // 1. Processar STATUS APROVADO (compra_aprovada)
        if (orderStatus === 'paid' || orderStatus === 'approved' || orderStatus === 'approved_subscription') {
            
            // Determinar plano (Mensal ou Anual)
            let planType = 'monthly';
            let days = PLANOS.monthly.days;

            if (productName && productName.toLowerCase().includes('anual')) {
                planType = 'annual';
                days = PLANOS.annual.days;
            }

            // Calcular nova data final acumulada (Garante não apagar dias restantes do cliente)
            let baseDate = new Date();
            if (user.subscription_end && new Date(user.subscription_end) > baseDate) {
                baseDate = new Date(user.subscription_end);
            }
            baseDate.setDate(baseDate.getDate() + days);

            // Atualiza usuário
            await supabase
                .from('users')
                .update({
                    subscription_end: baseDate,
                    is_active: true,
                    subscription_plan: planType,
                    blocked_until: null
                })
                .eq('id', user.id);

            // Grava Auditoria Financeira
            const { data: paymentRecord } = await supabase
                .from('payments')
                .insert({
                    user_id: user.id,
                    transaction_id: transactionId,
                    amount: amount,
                    plan_type: planType,
                    payment_method: paymentMethod,
                    status: 'paid',
                    paid_at: new Date()
                })
                .select()
                .single();

            // 2. Processa comissão de afiliados se houver indicação
            if (user.referred_by && paymentRecord) {
                const commission = amount * 0.20; // 20%
                await supabase
                    .from('affiliate_commissions')
                    .insert({
                        affiliate_id: user.referred_by,
                        referred_user_id: user.id,
                        payment_id: paymentRecord.id,
                        amount: commission,
                        commission_percent: 20,
                        status: 'pending'
                    });
            }

            // Envia WhatsApp de confirmação
            if (user.phone) {
                sendWhatsAppMessage(
                    user.phone,
                    `💚 *PAGAMENTO APROVADO - VSSTRAEDER*\n\nOlá ${user.name},\nSeu acesso foi liberado com sucesso!\n\nPlano: *${PLANOS[planType].name}*\nExpiração: *${baseDate.toLocaleDateString('pt-BR')}*\n\nAproveite os sinais em tempo real!`
                ).catch(e => console.error(e));
            }

            return res.json({ success: true, action: 'activated', user: user.email });
        }

        // 3. Processar STATUS CANCELADO / VENCIDO / REJEITADO
        if (orderStatus === 'canceled' || orderStatus === 'refunded' || orderStatus === 'chargeback' || orderStatus === 'expired') {
            await supabase
                .from('users')
                .update({
                    is_active: false,
                    subscription_end: new Date() // Expira hoje imediatamente
                })
                .eq('id', user.id);

            if (user.phone) {
                sendWhatsAppMessage(
                    user.phone,
                    `⚠️ *CONTA EXPIRADA - VSSTRAEDER*\n\nOlá ${user.name},\nSeu plano mensal/anual foi cancelado ou não foi renovado.\n\nPara restabelecer seu acesso ao painel de viés, efetue a assinatura novamente.`
                ).catch(e => console.error(e));
            }

            return res.json({ success: true, action: 'deactivated', user: user.email });
        }

        res.json({ success: true, action: 'ignored', status: orderStatus });

    } catch (error) {
        console.error('Erro no Webhook de pagamento:', error);
        res.status(500).json({ error: 'Erro ao processar transação no webhook.' });
    }
});

// ========== WEBHOOK ASAAS ==========
app.post('/api/webhook/asaas', async (req, res) => {
    const body = req.body;

    // Log para fins de debug
    console.log('[Webhook Asaas Recebido]:', JSON.stringify(body));

    try {
        const event = body.event;
        const payment = body.payment;

        if (!event || !payment) {
            return res.status(400).json({ error: 'Payload Asaas inválido.' });
        }

        // Tenta achar o email do usuário
        // O Asaas permite passar o email no "externalReference" ou "description"
        let userEmail = payment.externalReference;
        
        // Fallback: se não estiver no externalReference, tentamos buscar de outros lugares onde possa ter sido injetado
        if (!userEmail || !userEmail.includes('@')) {
            // Tenta ver se está na descrição (ex: "Plano Mensal - user@email.com")
            const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
            if (payment.description && emailRegex.test(payment.description)) {
                userEmail = payment.description.match(emailRegex)[0];
            } else {
                console.log(`[Webhook Asaas] Email não encontrado. Pagamento ID: ${payment.id}. Configure o externalReference com o email do cliente no Asaas.`);
                return res.status(200).json({ status: 'ignored', reason: 'missing_email' });
            }
        }

        // Buscar usuário correspondente
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('email', userEmail.trim())
            .single();

        if (!user) {
            console.log(`[Webhook Asaas] Usuário ${userEmail} não cadastrado no painel.`);
            return res.status(200).json({ status: 'ignored', reason: 'user_not_found' });
        }

        // 1. Processar STATUS APROVADO
        if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
            
            // Determinar plano (Mensal ou Anual)
            let planType = 'monthly';
            let days = PLANOS.monthly.days;

            if (payment.description && payment.description.toLowerCase().includes('anual')) {
                planType = 'annual';
                days = PLANOS.annual.days;
            }

            // Calcular nova data final acumulada (Garante não apagar dias restantes do cliente)
            let baseDate = new Date();
            if (user.subscription_end && new Date(user.subscription_end) > baseDate) {
                baseDate = new Date(user.subscription_end);
            }
            baseDate.setDate(baseDate.getDate() + days);

            // Atualiza usuário
            await supabase
                .from('users')
                .update({
                    subscription_end: baseDate,
                    is_active: true,
                    subscription_plan: planType,
                    blocked_until: null
                })
                .eq('id', user.id);

            // Grava Auditoria Financeira
            const { data: paymentRecord } = await supabase
                .from('payments')
                .insert({
                    user_id: user.id,
                    transaction_id: payment.id,
                    amount: parseFloat(payment.value || payment.netValue || 0),
                    plan_type: planType,
                    payment_method: payment.billingType || 'ASAAS',
                    status: 'paid',
                    paid_at: new Date()
                })
                .select()
                .single();

            // Processa comissão de afiliados se houver indicação
            if (user.referred_by && paymentRecord) {
                const commission = parseFloat(payment.value || 0) * 0.20; // 20%
                await supabase
                    .from('affiliate_commissions')
                    .insert({
                        affiliate_id: user.referred_by,
                        referred_user_id: user.id,
                        payment_id: paymentRecord.id,
                        amount: commission,
                        commission_percent: 20,
                        status: 'pending'
                    });
            }

            // Envia WhatsApp de confirmação
            if (user.phone) {
                sendWhatsAppMessage(
                    user.phone,
                    `💚 *PAGAMENTO APROVADO - VSSTRAEDER*\n\nOlá ${user.name},\nSeu acesso via Asaas foi liberado com sucesso!\n\nPlano: *${PLANOS[planType].name}*\nExpiração: *${baseDate.toLocaleDateString('pt-BR')}*\n\nAproveite os sinais em tempo real!`
                ).catch(e => console.error(e));
            }

            return res.json({ success: true, action: 'activated', user: user.email });
        }

        // 2. Processar Cancelamentos / Vencimentos
        if (event === 'PAYMENT_REFUNDED' || event === 'PAYMENT_CHARGEBACK_REQUESTED' || event === 'PAYMENT_DELETED') {
            await supabase
                .from('users')
                .update({
                    is_active: false,
                    subscription_end: new Date() // Expira hoje imediatamente
                })
                .eq('id', user.id);

            if (user.phone) {
                sendWhatsAppMessage(
                    user.phone,
                    `⚠️ *CONTA EXPIRADA - VSSTRAEDER*\n\nOlá ${user.name},\nSeu pagamento no Asaas foi cancelado ou estornado.\n\nPara restabelecer seu acesso ao painel de viés, efetue a assinatura novamente.`
                ).catch(e => console.error(e));
            }

            return res.json({ success: true, action: 'deactivated', user: user.email });
        }

        res.json({ success: true, action: 'ignored', status: event });

    } catch (error) {
        console.error('Erro no Webhook do Asaas:', error);
        res.status(500).json({ error: 'Erro ao processar transação do Asaas.' });
    }
});

// ========== ROTAS DO PAINEL ADMINISTRATIVO (SECRETO & SEGURO) ==========

// Listar Usuários
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, users });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao obter lista de usuários' });
    }
});

// Bloquear Usuário Manualmente
app.post('/api/admin/block-user', authenticateToken, requireAdmin, async (req, res) => {
    const { userId } = req.body;

    try {
        const farFuture = new Date('9999-12-31');
        
        const { error } = await supabase
            .from('users')
            .update({
                blocked_until: farFuture,
                is_blocked: true,
                is_active: false,
                current_session_id: null // Derruba a sessão atual ativa dele
            })
            .eq('id', userId);

        if (error) throw error;

        res.json({ success: true, message: 'Usuário bloqueado permanentemente!' });
    } catch (e) {
        console.error('Erro ao bloquear usuário:', e);
        res.status(500).json({ error: 'Erro ao bloquear usuário.' });
    }
});

// Desbloquear Usuário Manualmente
app.post('/api/admin/unblock-user', authenticateToken, requireAdmin, async (req, res) => {
    const { userId } = req.body;

    try {
        const { error } = await supabase
            .from('users')
            .update({
                blocked_until: null,
                is_blocked: false,
                is_active: true
            })
            .eq('id', userId);

        if (error) throw error;

        res.json({ success: true, message: 'Usuário desbloqueado!' });
    } catch (e) {
        console.error('Erro ao desbloquear usuário:', e);
        res.status(500).json({ error: 'Erro ao desbloquear usuário.' });
    }
});

// Estender Acesso do Cliente
app.post('/api/admin/extend-access', authenticateToken, requireAdmin, async (req, res) => {
    const { userId, days } = req.body;

    try {
        const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        let baseDate = new Date();
        if (user.subscription_end && new Date(user.subscription_end) > baseDate) {
            baseDate = new Date(user.subscription_end);
        }
        baseDate.setDate(baseDate.getDate() + parseInt(days));

        const { error } = await supabase
            .from('users')
            .update({
                subscription_end: baseDate,
                is_active: true,
                is_blocked: false,
                blocked_until: null
            })
            .eq('id', userId);

        if (error) throw error;

        res.json({ success: true, message: `Acesso estendido até ${baseDate.toLocaleDateString('pt-BR')}` });
    } catch (e) {
        console.error('Erro ao estender acesso:', e);
        res.status(500).json({ error: 'Erro ao estender acesso.' });
    }
});
// Reativar/Desbloquear Acesso do Cliente Manualmente
app.post('/api/admin/reactivate-user', authenticateToken, requireAdmin, async (req, res) => {
    const { userId } = req.body;

    try {
        const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        // Identifica plano atual (mensal ou anual)
        const plan = user.subscription_plan || 'monthly';
        const days = plan === 'annual' || plan === 'yearly' ? 365 : 30;

        let baseDate = new Date();
        // Se a assinatura ainda está ativa e no futuro, adiciona a partir de lá. Se não, a partir de hoje.
        if (user.subscription_end && new Date(user.subscription_end) > baseDate) {
            baseDate = new Date(user.subscription_end);
        }
        baseDate.setDate(baseDate.getDate() + days);

        const { error } = await supabase
            .from('users')
            .update({
                subscription_end: baseDate,
                is_active: true,
                is_blocked: false,
                blocked_until: null
            })
            .eq('id', userId);

        if (error) throw error;

        res.json({ success: true, message: `Acesso reativado no plano ${plan === 'annual' || plan === 'yearly' ? 'Anual' : 'Mensal'} até ${baseDate.toLocaleDateString('pt-BR')}` });
    } catch (e) {
        console.error('Erro ao reativar usuário:', e);
        res.status(500).json({ error: 'Erro ao reativar usuário.' });
    }
});

// Confirmar Pagamento Manualmente (Simulador & Resgate)
app.post('/api/admin/confirm-payment', authenticateToken, requireAdmin, async (req, res) => {
    const { userId, planType, amount } = req.body;
    const days = PLANOS[planType]?.days || 30;

    try {
        const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        let baseDate = new Date();
        if (user.subscription_end && new Date(user.subscription_end) > baseDate) {
            baseDate = new Date(user.subscription_end);
        }
        baseDate.setDate(baseDate.getDate() + days);

        const { error: updateError } = await supabase
            .from('users')
            .update({
                subscription_end: baseDate,
                is_active: true,
                subscription_plan: planType,
                is_blocked: false,
                blocked_until: null
            })
            .eq('id', userId);

        if (updateError) throw updateError;

        // Grava histórico
        const { error: insertError } = await supabase
            .from('payments')
            .insert({
                user_id: userId,
                transaction_id: `MANUAL_${Date.now()}`,
                amount: parseFloat(amount || PLANOS[planType].price),
                plan_type: planType,
                payment_method: 'admin_manual',
                status: 'paid',
                paid_at: new Date()
            });

        if (insertError) throw insertError;

        res.json({ success: true, message: 'Pagamento confirmado manualmente!' });
    } catch (e) {
        console.error('Erro ao confirmar pagamento manualmente:', e);
        res.status(500).json({ error: 'Erro ao confirmar pagamento manualmente.' });
    }
});

// Gerenciamento de PIDs autorizados pelo Admin
app.get('/api/admin/allowed-pids', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('allowed_pids')
            .select('*')
            .order('name', { ascending: true });
        if (error) throw error;
        res.json({ success: true, allowedPids: data || [] });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao listar PIDs autorizados.' });
    }
});

app.post('/api/admin/allowed-pids', authenticateToken, requireAdmin, async (req, res) => {
    const { pid, name, category } = req.body;
    if (!pid || !name || !category) {
        return res.status(400).json({ error: 'PID, nome e categoria são necessários.' });
    }
    try {
        const { data, error } = await supabase
            .from('allowed_pids')
            .upsert({
                pid: pid.trim(),
                name: name.toUpperCase().trim(),
                category: category.trim()
            })
            .select()
            .single();
        if (error) throw error;
        res.json({ success: true, allowedPid: data });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao cadastrar PID autorizado.' });
    }
});

app.delete('/api/admin/allowed-pids/:pid', authenticateToken, requireAdmin, async (req, res) => {
    const { pid } = req.params;
    try {
        const { error } = await supabase
            .from('allowed_pids')
            .delete()
            .eq('pid', pid);
        if (error) throw error;
        res.json({ success: true, message: 'PID removido com sucesso!' });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao remover PID autorizado.' });
    }
});

// Histórico de Transações / Pagamentos
app.get('/api/admin/transactions', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { data: transactions, error } = await supabase
            .from('payments')
            .select('*, users(name, email)')
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) throw error;
        res.json({ success: true, transactions: transactions || [] });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao obter transações.' });
    }
});

// Dashboard Financeiro do Administrador (MRR, ARR e Projeções)
app.get('/api/admin/financial-stats', authenticateToken, requireAdmin, async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        // 1. Obter todos os usuários com assinaturas válidas
        const { data: users } = await supabase
            .from('users')
            .select('subscription_plan, subscription_end')
            .gte('subscription_end', today.toISOString());

        let activeMonthlyCount = 0;
        let activeAnnualCount = 0;

        users.forEach(u => {
            if (u.subscription_plan === 'annual') activeAnnualCount++;
            else activeMonthlyCount++;
        });

        // MRR = Assinaturas Mensais * R$ 49,90 + (Assinaturas Anuais * (R$ 299,00 / 12))
        const monthlyPrice = PLANOS.monthly.price;
        const annualMonthlyShare = PLANOS.annual.price / 12; // R$ 24,91 por mês
        
        const mrr = (activeMonthlyCount * monthlyPrice) + (activeAnnualCount * annualMonthlyShare);
        const arr = mrr * 12;

        // 2. Histórico total acumulado arrecadado no banco
        const { data: payments } = await supabase
            .from('payments')
            .select('amount')
            .eq('status', 'paid');
        
        const totalRevenue = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

        // 3. Faturamento do mês corrente
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const { data: monthPayments } = await supabase
            .from('payments')
            .select('amount')
            .eq('status', 'paid')
            .gte('paid_at', firstDayOfMonth.toISOString());
        
        const currentMonthRevenue = monthPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

        // 4. Projeções de arrecadação futura nos próximos 30 dias (renovações pendentes)
        const next30Days = new Date();
        next30Days.setDate(next30Days.getDate() + 30);
        
        const { data: expiringUsers } = await supabase
            .from('users')
            .select('name, email, subscription_plan, subscription_end')
            .gte('subscription_end', today.toISOString())
            .lte('subscription_end', next30Days.toISOString());

        let projectedRevenueNext30Days = 0;
        expiringUsers.forEach(u => {
            const nextPrice = PLANOS[u.subscription_plan]?.price || 49.90;
            projectedRevenueNext30Days += nextPrice;
        });

        res.json({
            success: true,
            stats: {
                activeMonthly: activeMonthlyCount,
                activeAnnual: activeAnnualCount,
                mrr: parseFloat(mrr.toFixed(2)),
                arr: parseFloat(arr.toFixed(2)),
                totalRevenue: parseFloat(totalRevenue.toFixed(2)),
                currentMonthRevenue: parseFloat(currentMonthRevenue.toFixed(2)),
                projectedNext30Days: parseFloat(projectedRevenueNext30Days.toFixed(2)),
                expiringSoonList: expiringUsers
            }
        });
    } catch (e) {
        console.error('Erro nos relatórios financeiros:', e);
        res.status(500).json({ error: 'Erro ao gerar dados financeiros.' });
    }
});

// ========== ROTAS DE ATIVOS PERSONALIZADOS (USER ASSETS) ==========

// 1. Obter todos os ativos do usuário logado
app.get('/api/assets', authenticateToken, async (req, res) => {
    try {
        const { data: assets, error } = await supabase
            .from('user_assets')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: true });

        if (error) throw error;
        res.json({ success: true, assets });
    } catch (e) {
        console.error('Erro ao buscar ativos:', e);
        res.status(500).json({ error: 'Erro ao buscar ativos do banco de dados.' });
    }
});

// 2. Adicionar um novo ativo ao portfólio
app.post('/api/assets', authenticateToken, async (req, res) => {
    const { name, pid, category } = req.body;

    if (!name || !pid || !category) {
        return res.status(400).json({ error: 'Nome, PID e Categoria são necessários.' });
    }

    try {
        // Verificar se o PID está na tabela allowed_pids
        const { data: allowed, error: allowedError } = await supabase
            .from('allowed_pids')
            .select('*')
            .eq('pid', pid.trim())
            .maybeSingle();

        if (allowedError) {
            console.error('Erro ao verificar allowed_pids (talvez a tabela não exista ainda):', allowedError);
        } else if (!allowed) {
            return res.status(400).json({ 
                success: false, 
                error: 'Ativo indisponível. Entre em contato com o administrador para obter ajuda.' 
            });
        }

        const { data: newAsset, error } = await supabase
            .from('user_assets')
            .insert({
                user_id: req.user.id,
                name: name.toUpperCase().trim(),
                pid: pid.trim(),
                category: category.trim()
            })
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, asset: newAsset });
    } catch (e) {
        console.error('Erro ao salvar ativo:', e);
        res.status(500).json({ error: 'Erro ao salvar ativo no banco de dados.' });
    }
});

// 3. Remover um ativo
app.delete('/api/assets/:id', authenticateToken, async (req, res) => {
    const assetId = req.params.id;

    try {
        const { error } = await supabase
            .from('user_assets')
            .delete()
            .eq('id', assetId)
            .eq('user_id', req.user.id);

        if (error) throw error;
        res.json({ success: true, message: 'Ativo deletado com sucesso.' });
    } catch (e) {
        console.error('Erro ao deletar ativo:', e);
        res.status(500).json({ error: 'Erro ao deletar ativo do banco de dados.' });
    }
});

// ========== ROTAS DE CACHE DE PREÇOS (INSTANT-LOAD SYSTEM) ==========
app.get('/api/prices', async (req, res) => {
    res.json({ success: true, prices: priceCache });
});

app.post('/api/prices/tick', express.json(), async (req, res) => {
    const { pid, last, pcp } = req.body;
    if (!pid || last === undefined || pcp === undefined) {
        return res.status(400).json({ error: 'PID, last e pcp são obrigatórios.' });
    }
    
    // 1. Atualiza cache em memória
    priceCache[pid] = {
        last: last,
        pcp: pcp,
        timestamp: Date.now()
    };
    
    // 2. Persiste no banco Supabase em segundo plano
    supabase
        .from('asset_prices')
        .upsert({ pid: pid, last: last, pcp: pcp, updated_at: new Date().toISOString() })
        .then(({ error }) => {
            if (error) console.error('Erro ao persistir preço no Supabase:', error.message);
        });

    res.json({ success: true });
});

// ========== INICIAR SERVIDOR ==========
async function startServer() {
    try {
        console.log('🔄 Carregando histórico de preços do Supabase...');
        const { data, error } = await supabase.from('asset_prices').select('*');
        if (error) {
            console.warn('⚠️ Tabela asset_prices não encontrada ou ilegível (Crie no SQL Editor):', error.message);
        } else if (data) {
            data.forEach(p => {
                priceCache[p.pid] = {
                    last: p.last,
                    pcp: p.pcp,
                    timestamp: new Date(p.updated_at).getTime()
                };
            });
            console.log(`✅ ${data.length} preços carregados do banco de dados com sucesso!`);
        }
    } catch (e) {
        console.error('Erro na carga inicial do banco:', e.message);
    }

    app.listen(PORT, () => {
        console.log(`✅ Servidor profissional VSSTRAEDER rodando na porta ${PORT}`);
    });
}

startServer();
