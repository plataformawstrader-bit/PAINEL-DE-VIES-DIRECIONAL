const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// ========== CONFIGURAÇÕES ==========
const PLANOS = {
    monthly: { price: 49.90, days: 30, name: 'Mensal' },
    annual: { price: 29.90, days: 365, name: 'Anual (12x R$29,90)' }
};

// Chave PIX (sua conta Mercado Pago)
const PIX_KEY = process.env.PIX_KEY || 'sua-chave-pix-aqui@email.com'; // Sua chave PIX

// ========== MIDDLEWARES ==========
app.use(helmet());
app.use(cors({ origin: ['http://localhost:8000', 'https://vsstraeder.netlify.app'], credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
app.use('/api/login', limiter);
app.use('/api/register', limiter);

// ========== SUPABASE ==========
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ========== EMAIL ==========
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// ========== WHATSAPP (simulado com API Evolution) ==========
async function sendWhatsApp(phone, message) {
    try {
        const response = await fetch(`${process.env.WHATSAPP_API_URL}/message/sendText/${process.env.WHATSAPP_INSTANCE}`, {
            method: 'POST',
            headers: { 'apikey': process.env.WHATSAPP_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: phone, text: message })
        });
        return await response.json();
    } catch (error) {
        console.error('WhatsApp error:', error);
        return { success: false };
    }
}

// ========== FUNÇÕES AUXILIARES ==========
function generateAffiliateCode() {
    return 'VS' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function checkAccess(user) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (user.blocked_until && new Date(user.blocked_until) > today) {
        return { allowed: false, reason: 'blocked', message: 'Conta bloqueada.' };
    }
    
    if (user.subscription_end && new Date(user.subscription_end) >= today && user.is_active) {
        const daysLeft = Math.ceil((new Date(user.subscription_end) - today) / (1000 * 60 * 60 * 24));
        return { allowed: true, type: 'paid', daysLeft };
    }
    
    if (user.trial_end && new Date(user.trial_end) >= today) {
        const daysLeft = Math.ceil((new Date(user.trial_end) - today) / (1000 * 60 * 60 * 24));
        return { allowed: true, type: 'trial', daysLeft };
    }
    
    return { allowed: false, reason: 'expired', message: 'Acesso expirado. Renove agora!' };
}

// ========== 1. REGISTRO COM AFILIADO ==========
app.post('/api/register', async (req, res) => {
    const { name, email, phone, password, referralCode } = req.body;
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }
    
    try {
        const { data: existingUser } = await supabase.from('users').select('email').eq('email', email).single();
        if (existingUser) return res.status(400).json({ error: 'Email já cadastrado' });
        
        let referredBy = null;
        if (referralCode) {
            const { data: referrer } = await supabase.from('users').select('id').eq('affiliate_code', referralCode).single();
            if (referrer) referredBy = referrer.id;
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const affiliateCode = generateAffiliateCode();
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 7);
        
        const { data: user, error } = await supabase.from('users').insert({
            name, email, phone: phone || null, password_hash: hashedPassword,
            affiliate_code: affiliateCode, referred_by: referredBy,
            trial_start: new Date(), trial_end: trialEnd, is_active: true
        }).select().single();
        
        if (error) throw error;
        
        const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
        
        // Email de boas-vindas
        await transporter.sendMail({
            from: `"VSSTRAEDER" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Bem-vindo ao VSSTRAEDER! 🚀',
            html: `<h1>Bem-vindo, ${name}!</h1><p>Seu acesso de <strong>7 dias GRATUITOS</strong> está ativo!</p><p>Use o código <strong>${affiliateCode}</strong> para convidar amigos e ganhar comissões.</p><p>Após o trial, use o link: <a href="https://vsstraeder.netlify.app/payment.html">Renovar Acesso</a></p>`
        });
        
        // WhatsApp de boas-vindas
        if (phone) {
            await sendWhatsApp(phone, `🎉 *Bem-vindo ao VSSTRAEDER!* 🎉\n\nOlá ${name}, seu acesso de 7 dias GRÁTIS já está ativo!\n\nUse seu código de afiliado: *${affiliateCode}*\nConvide amigos e ganhe 20% de comissão!\n\nQualquer dúvida: (11) 99999-9999`);
        }
        
        res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, affiliateCode, trialEnd } });
        
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Erro ao criar conta' });
    }
});

// ========== 2. LOGIN ==========
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const ip = req.ip;
    
    try {
        const { data: user } = await supabase.from('users').select('*').eq('email', email).single();
        if (!user) return res.status(401).json({ error: 'Email ou senha incorretos' });
        
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(401).json({ error: 'Email ou senha incorretos' });
        
        const access = checkAccess(user);
        if (!access.allowed) {
            return res.status(403).json({ error: access.message, code: access.reason });
        }
        
        await supabase.from('users').update({ last_login: new Date() }).eq('id', user.id);
        await supabase.from('access_logs').insert({ user_id: user.id, ip_address: ip, user_agent: req.headers['user-agent'] });
        
        const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: access.type === 'trial' ? '7d' : '30d' });
        
        res.json({ success: true, token, accessType: access.type, daysLeft: access.daysLeft, user: { id: user.id, name: user.name, email: user.email, affiliateCode: user.affiliate_code } });
        
    } catch (error) {
        res.status(500).json({ error: 'Erro ao fazer login' });
    }
});

// ========== 3. GERAR QR CODE PIX PARA PAGAMENTO ==========
app.post('/api/generate-pix', async (req, res) => {
    const { userId, planType } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Não autorizado' });
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const plan = PLANOS[planType];
        if (!plan) return res.status(400).json({ error: 'Plano inválido' });
        
        // Criar transação única
        const transactionId = `PIX_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 30); // QR Code expira em 30 min
        
        // Dados do PIX
        const pixData = {
            transactionId,
            amount: plan.price,
            description: `VSSTRAEDER - Plano ${plan.name}`,
            pixKey: PIX_KEY,
            expiresAt: expiresAt.toISOString()
        };
        
        // Gerar string PIX copia e cola (formato BR Code)
        const pixString = `00020126360014BR.GOV.BCB.PIX0114${PIX_KEY}5204000053039865404${plan.price.toFixed(2)}5802BR5913VSSTRAEDER6008BRASIL62070503***6304`;
        
        // Gerar QR Code base64
        const qrcode = await QRCode.toDataURL(pixString);
        
        // Salvar no banco
        await supabase.from('payments').insert({
            user_id: userId || decoded.id,
            transaction_id: transactionId,
            amount: plan.price,
            plan_type: planType,
            payment_method: 'pix',
            pix_qrcode: qrcode,
            pix_code: pixString,
            status: 'pending',
            expires_at: expiresAt
        });
        
        res.json({ success: true, qrcode, pixCode: pixString, transactionId, expiresAt, amount: plan.price });
        
    } catch (error) {
        console.error('PIX error:', error);
        res.status(500).json({ error: 'Erro ao gerar PIX' });
    }
});

// ========== 4. VERIFICAR PAGAMENTO (Admin confirma manualmente) ==========
app.post('/api/admin/confirm-payment', async (req, res) => {
    const { transactionId, userId } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { data: admin } = await supabase.from('users').select('is_admin').eq('id', decoded.id).single();
        if (!admin?.is_admin) return res.status(403).json({ error: 'Acesso negado' });
        
        const { data: payment } = await supabase.from('payments').select('*').eq('transaction_id', transactionId).single();
        if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' });
        
        const newEndDate = new Date();
        newEndDate.setDate(newEndDate.getDate() + PLANOS[payment.plan_type].days);
        
        await supabase.from('users').update({
            subscription_end: newEndDate,
            is_active: true,
            subscription_plan: payment.plan_type,
            blocked_until: null
        }).eq('id', userId || payment.user_id);
        
        await supabase.from('payments').update({ status: 'paid', paid_at: new Date() }).eq('transaction_id', transactionId);
        
        // Calcular comissão para afiliado
        const { data: user } = await supabase.from('users').select('referred_by').eq('id', userId || payment.user_id).single();
        if (user?.referred_by) {
            const commissionAmount = payment.amount * 0.20;
            await supabase.from('affiliate_commissions').insert({
                affiliate_id: user.referred_by,
                referred_user_id: userId || payment.user_id,
                payment_id: payment.id,
                amount: commissionAmount,
                commission_percent: 20
            });
        }
        
        res.json({ success: true, message: 'Pagamento confirmado!' });
        
    } catch (error) {
        res.status(500).json({ error: 'Erro ao confirmar pagamento' });
    }
});

// ========== 5. DASHBOARD ADMIN - USUÁRIOS ==========
app.get('/api/admin/users', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Não autorizado' });
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { data: admin } = await supabase.from('users').select('is_admin').eq('id', decoded.id).single();
        if (!admin?.is_admin) return res.status(403).json({ error: 'Acesso negado' });
        
        const { data: users } = await supabase.from('users').select('*').order('created_at', { ascending: false });
        res.json({ users });
        
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar usuários' });
    }
});

// ========== 6. ADMIN - ATIVAR/EXTENDER ACESSO ==========
app.post('/api/admin/extend-access', async (req, res) => {
    const { userId, days } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { data: admin } = await supabase.from('users').select('is_admin').eq('id', decoded.id).single();
        if (!admin?.is_admin) return res.status(403).json({ error: 'Acesso negado' });
        
        const { data: user } = await supabase.from('users').select('subscription_end').eq('id', userId).single();
        const newEndDate = user.subscription_end ? new Date(user.subscription_end) : new Date();
        newEndDate.setDate(newEndDate.getDate() + days);
        
        await supabase.from('users').update({ subscription_end: newEndDate, is_active: true }).eq('id', userId);
        
        res.json({ success: true, message: `Acesso estendido por ${days} dias` });
        
    } catch (error) {
        res.status(500).json({ error: 'Erro ao estender acesso' });
    }
});

// ========== 7. AFILIADOS - ESTATÍSTICAS ==========
app.get('/api/affiliate/stats', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Não autorizado' });
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Total de indicações
        const { data: referrals, count: totalReferrals } = await supabase
            .from('users')
            .select('id', { count: 'exact' })
            .eq('referred_by', decoded.id);
        
        // Total de comissões
        const { data: commissions } = await supabase
            .from('affiliate_commissions')
            .select('amount, status')
            .eq('affiliate_id', decoded.id);
        
        const totalEarned = commissions?.reduce((sum, c) => sum + (c.status === 'paid' ? c.amount : 0), 0) || 0;
        const pendingEarned = commissions?.reduce((sum, c) => sum + (c.status === 'pending' ? c.amount : 0), 0) || 0;
        
        res.json({
            success: true,
            affiliateCode: decoded.affiliateCode,
            totalReferrals: totalReferrals || 0,
            totalEarned,
            pendingEarned,
            commissions: commissions || []
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});

// ========== 8. RECUPERAÇÃO DE SENHA ==========
app.post('/api/recover-password', async (req, res) => {
    const { email } = req.body;
    
    try {
        const { data: user } = await supabase.from('users').select('id, email, name').eq('email', email).single();
        if (!user) return res.json({ success: true, message: 'Se o email existir, você receberá as instruções.' });
        
        const recoveryToken = require('crypto').randomBytes(32).toString('hex');
        const recoveryExpires = new Date();
        recoveryExpires.setHours(recoveryExpires.getHours() + 1);
        
        await supabase.from('users').update({ recovery_token: recoveryToken, recovery_expires: recoveryExpires }).eq('id', user.id);
        
        const resetLink = `https://vsstraeder.netlify.app/reset-password.html?token=${recoveryToken}`;
        
        await transporter.sendMail({
            from: `"VSSTRAEDER" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Recuperação de Senha',
            html: `<h1>Recuperação de Senha</h1><p>Olá ${user.name}, clique no link abaixo para redefinir sua senha:</p><a href="${resetLink}" style="background:#00ff88;padding:12px 24px;color:#000;text-decoration:none;border-radius:8px;">REDEFINIR SENHA</a><p>Link válido por 1 hora.</p>`
        });
        
        res.json({ success: true, message: 'Email de recuperação enviado!' });
        
    } catch (error) {
        res.status(500).json({ error: 'Erro ao processar solicitação' });
    }
});

// ========== 9. VERIFICAR ACESSO ==========
app.get('/api/verify-access', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.json({ authenticated: false });
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { data: user } = await supabase.from('users').select('*').eq('id', decoded.id).single();
        if (!user) return res.json({ authenticated: false });
        
        const access = checkAccess(user);
        res.json({ authenticated: access.allowed, accessType: access.type, daysLeft: access.daysLeft, user });
        
    } catch (error) {
        res.json({ authenticated: false });
    }
});

// ========== 10. SAIR ==========
app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`✅ VSSTRAEDER Backend rodando na porta ${PORT}`));