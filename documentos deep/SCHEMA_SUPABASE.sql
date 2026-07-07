-- ============================================================
--  VSSTRAEDER - SCHEMA COMPLETO DO BANCO DE DADOS
--  Compatível com o backend index.js v2.0
--  Execute este script no SQL Editor do Supabase
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- EXTENSÕES NECESSÁRIAS
-- ══════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ══════════════════════════════════════════════════════════════
-- TABELA PRINCIPAL: USUÁRIOS
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Dados pessoais
    name                VARCHAR(100)    NOT NULL,
    email               VARCHAR(255)    UNIQUE NOT NULL,
    phone               VARCHAR(30),
    password_hash       TEXT            NOT NULL,

    -- Sistema de Afiliados
    affiliate_code      VARCHAR(20)     UNIQUE,
    referred_by         UUID            REFERENCES users(id) ON DELETE SET NULL,

    -- Trial e Assinatura
    trial_start         TIMESTAMPTZ,
    trial_end           TIMESTAMPTZ,
    subscription_end    TIMESTAMPTZ,
    subscription_plan   VARCHAR(20),                     -- 'monthly' | 'annual'

    -- Status da conta
    is_active           BOOLEAN         NOT NULL DEFAULT FALSE,
    is_admin            BOOLEAN         NOT NULL DEFAULT FALSE,
    is_blocked          BOOLEAN         NOT NULL DEFAULT FALSE,
    is_trial            BOOLEAN         GENERATED ALWAYS AS (
                            trial_end IS NOT NULL AND
                            subscription_end IS NULL
                        ) STORED,

    -- Bloqueio Administrativo Temporário
    blocked_until       TIMESTAMPTZ,

    -- Segurança: Anti-Abuso de Trial
    device_fingerprint  TEXT,

    -- Segurança: Sessão Única (Anti-Login Simultâneo)
    current_session_id  TEXT,

    -- Recuperação de senha
    recovery_token      TEXT,
    recovery_expires    TIMESTAMPTZ,

    -- Timestamps
    last_login          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Comentários para documentação
COMMENT ON TABLE  users                       IS 'Usuários do painel VSSTRAEDER';
COMMENT ON COLUMN users.affiliate_code        IS 'Código único de afiliado para indicações';
COMMENT ON COLUMN users.device_fingerprint    IS 'Fingerprint do dispositivo no cadastro (previne abuso de trial)';
COMMENT ON COLUMN users.current_session_id    IS 'UUID da sessão ativa atual (garante login único)';
COMMENT ON COLUMN users.is_blocked            IS 'Bloqueio definitivo por admin';
COMMENT ON COLUMN users.blocked_until         IS 'Bloqueio temporário até data definida pelo admin';


-- ══════════════════════════════════════════════════════════════
-- TABELA: PAGAMENTOS / TRANSAÇÕES
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS payments (
    id              BIGSERIAL       PRIMARY KEY,
    user_id         UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    transaction_id  VARCHAR(200)    UNIQUE,
    amount          NUMERIC(10,2)   NOT NULL DEFAULT 0,
    plan_type       VARCHAR(20),                -- 'monthly' | 'annual'
    payment_method  VARCHAR(50),               -- 'pix' | 'boleto' | 'credit_card' | 'checkout'
    source          VARCHAR(50)     DEFAULT 'webhook',  -- 'webhook' | 'manual'

    status          VARCHAR(30)     NOT NULL DEFAULT 'pending',
    -- pending | paid | refunded | chargeback | expired | canceled

    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE payments IS 'Histórico completo de transações financeiras';


-- ══════════════════════════════════════════════════════════════
-- TABELA: COMISSÕES DE AFILIADOS
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS affiliate_commissions (
    id                  BIGSERIAL   PRIMARY KEY,
    affiliate_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payment_id          BIGINT      REFERENCES payments(id) ON DELETE SET NULL,

    amount              NUMERIC(10,2)   NOT NULL,
    commission_percent  NUMERIC(5,2)    NOT NULL DEFAULT 20.00,
    status              VARCHAR(20)     NOT NULL DEFAULT 'pending',
    -- pending | paid | cancelled

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE affiliate_commissions IS 'Comissões de 20% geradas por indicações de afiliados';


-- ══════════════════════════════════════════════════════════════
-- TABELA: SOLICITAÇÕES DE SAQUE (Afiliados)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id              BIGSERIAL   PRIMARY KEY,
    affiliate_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    amount          NUMERIC(10,2)   NOT NULL,
    pix_key         VARCHAR(200),
    status          VARCHAR(20)     NOT NULL DEFAULT 'pending',
    -- pending | approved | rejected

    processed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ══════════════════════════════════════════════════════════════
-- TABELA: LOGS DE WHATSAPP
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS whatsapp_logs (
    id              BIGSERIAL   PRIMARY KEY,
    user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,

    phone           VARCHAR(30),
    message_type    VARCHAR(80),   -- 'welcome' | 'recovery' | 'payment_confirmed' | 'payment_reminder'
    status          VARCHAR(20),   -- 'sent' | 'failed' | 'simulated'
    error_message   TEXT,

    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ══════════════════════════════════════════════════════════════
-- ÍNDICES DE PERFORMANCE
-- ══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_users_email              ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_affiliate_code     ON users(affiliate_code);
CREATE INDEX IF NOT EXISTS idx_users_fingerprint        ON users(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_users_subscription_end   ON users(subscription_end);
CREATE INDEX IF NOT EXISTS idx_users_is_active          ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_referred_by        ON users(referred_by);

CREATE INDEX IF NOT EXISTS idx_payments_user_id         ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status          ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at         ON payments(paid_at);
CREATE INDEX IF NOT EXISTS idx_payments_transaction     ON payments(transaction_id);

CREATE INDEX IF NOT EXISTS idx_commissions_affiliate    ON affiliate_commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status       ON affiliate_commissions(status);


-- ══════════════════════════════════════════════════════════════
-- TRIGGER: Atualiza updated_at automaticamente na tabela users
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS) - Segurança das Tabelas
-- Apenas o service_key do backend pode fazer leituras/escritas
-- ══════════════════════════════════════════════════════════════
ALTER TABLE users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_commissions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_logs           ENABLE ROW LEVEL SECURITY;

-- Política: Apenas o serviço (service_role) tem acesso completo
-- O frontend público NÃO pode acessar o banco diretamente
CREATE POLICY "service_only_users"    ON users                  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_only_payments" ON payments               FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_only_commissions" ON affiliate_commissions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_only_withdrawals" ON withdrawal_requests   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_only_whatsapp" ON whatsapp_logs           FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════
-- USUÁRIO ADMINISTRADOR INICIAL
-- ATENÇÃO: Altere o email, nome e senha antes de executar!
-- A senha abaixo é: Admin@2026 (hash bcrypt com salt 10)
-- Gere um novo hash em: https://bcrypt-generator.com/
-- ══════════════════════════════════════════════════════════════
INSERT INTO users (
    name,
    email,
    phone,
    password_hash,
    affiliate_code,
    is_active,
    is_admin,
    trial_start,
    trial_end
) VALUES (
    'Administrador',
    'admin@vsstraeder.com',       -- ← ALTERE para seu email
    NULL,
    '$2b$10$rQJ4C5kP1mLzV8XZN1a.NOhQJtGjHOuUVJxLB3Y5sK9aPdE6e7kZu', -- Admin@2026
    'VSADMIN',
    TRUE,
    TRUE,
    NOW(),
    NOW() + INTERVAL '9999 days'
)
ON CONFLICT (email) DO NOTHING;


-- ══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO FINAL
-- Execute para confirmar que tudo foi criado corretamente
-- ══════════════════════════════════════════════════════════════
SELECT
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS total_colunas
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
