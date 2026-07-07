// Script de inicialização do banco - criar tabela user_assets
// Executar UMA VEZ: node "documentos deep/create_user_assets_table.js"

require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function createTable() {
    console.log('Conectando ao Supabase...');
    console.log('URL:', process.env.SUPABASE_URL);

    // Supabase JS não permite DDL diretamente - usando rpc com raw SQL
    const { data, error } = await supabase.rpc('exec_sql', {
        sql: `
            CREATE TABLE IF NOT EXISTS public.user_assets (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                name        TEXT NOT NULL,
                pid         TEXT NOT NULL,
                category    TEXT NOT NULL,
                created_at  TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_user_assets_user_id ON public.user_assets(user_id);
        `
    });

    if (error) {
        console.error('Erro (pode ser normal se a função exec_sql não existir):', error.message);
        console.log('\n=== ALTERNATIVA: EXECUTE ESTE SQL MANUALMENTE NO SUPABASE ===');
        console.log(`
Acesse: https://supabase.com/dashboard/project/fiewhkxayneocehldfcp/sql

Cole e execute o SQL abaixo:

CREATE TABLE IF NOT EXISTS public.user_assets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    pid         TEXT NOT NULL,
    category    TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_assets_user_id ON public.user_assets(user_id);
        `);
    } else {
        console.log('✅ Tabela user_assets criada com sucesso!', data);
    }
}

createTable();
