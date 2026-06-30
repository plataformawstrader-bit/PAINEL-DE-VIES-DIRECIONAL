-- ========== TABELA DE USUÁRIOS (ATUALIZADA) ==========
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password_hash TEXT NOT NULL,
    affiliate_code VARCHAR(20) UNIQUE,  -- Código do afiliado
    referred_by UUID REFERENCES users(id), -- Quem indicou
    trial_start DATE DEFAULT CURRENT_DATE,
    trial_end DATE DEFAULT (CURRENT_DATE + INTERVAL '7 days'),
    subscription_end DATE,
    subscription_plan VARCHAR(20), -- 'monthly' ou 'annual'
    is_active BOOLEAN DEFAULT FALSE,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    blocked_until DATE,
    recovery_token TEXT,
    recovery_expires TIMESTAMP
);

-- ========== TABELA DE PAGAMENTOS ==========
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    transaction_id VARCHAR(100) UNIQUE,
    amount DECIMAL(10,2),
    plan_type VARCHAR(20), -- 'monthly' ou 'annual'
    payment_method VARCHAR(20), -- 'pix' ou 'qrcode'
    pix_qrcode TEXT, -- QR Code em base64
    pix_code TEXT, -- Código copia e cola
    status VARCHAR(20) DEFAULT 'pending', -- pending, paid, expired, cancelled
    expires_at TIMESTAMP,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========== TABELA DE COMISSÕES DE AFILIADOS ==========
CREATE TABLE affiliate_commissions (
    id SERIAL PRIMARY KEY,
    affiliate_id UUID REFERENCES users(id),
    referred_user_id UUID REFERENCES users(id),
    payment_id INTEGER REFERENCES payments(id),
    amount DECIMAL(10,2),
    commission_percent DECIMAL(5,2) DEFAULT 20.00,
    status VARCHAR(20) DEFAULT 'pending', -- pending, paid
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========== TABELA DE SOLICITAÇÕES DE SAQUE ==========
CREATE TABLE withdrawal_requests (
    id SERIAL PRIMARY KEY,
    affiliate_id UUID REFERENCES users(id),
    amount DECIMAL(10,2),
    pix_key VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========== TABELA DE LOGS WHATSAPP ==========
CREATE TABLE whatsapp_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    phone VARCHAR(20),
    message_type VARCHAR(50), -- recovery, payment_reminder, welcome
    status VARCHAR(20), -- sent, failed
    sent_at TIMESTAMP DEFAULT NOW()
);

-- ========== TABELA DE SESSÕES ==========
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    token TEXT,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========== ÍNDICES PARA PERFORMANCE ==========
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_affiliate ON users(affiliate_code);
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_commissions_affiliate ON affiliate_commissions(affiliate_id);