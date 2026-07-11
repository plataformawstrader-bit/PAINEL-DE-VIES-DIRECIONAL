const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fiewhkxayneocehldfcp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZXdoa3hheW5lb2NlaGxkZmNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTczMjI0MiwiZXhwIjoyMDk3MzA4MjQyfQ.ozLnTLhjcQkcq8GMyPlWNebET5lRWoUmY_rL-1ASsiM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    // Busca todas as tabelas públicas do banco de dados via RPC ou consultando o schema
    const { data: tables, error } = await supabase
        .from('pg_tables')
        .select('tablename')
        .eq('schemaname', 'public');
    
    if (error) {
        // Fallback: Tentamos listar as tabelas conhecidas ou fazer uma query direta
        console.log("Erro ao listar tabelas via pg_tables:", error.message);
        
        // Vamos tentar rodar uma query na tabela de configurações se ela existir, ou verificar tabelas conhecidas
        const knownTables = ['users', 'user_assets', 'allowed_pids', 'transactions', 'settings', 'config', 'prices'];
        for (const table of knownTables) {
            const { data, error: tableError } = await supabase.from(table).select('*').limit(1);
            if (!tableError) {
                console.log(`Tabela encontrada: ${table}`);
                if (table === 'settings' || table === 'config') {
                    console.log(`Dados de ${table}:`, data);
                }
            } else {
                console.log(`Tabela ${table} não encontrada ou erro:`, tableError.message);
            }
        }
        return;
    }
    
    console.log("Tabelas no Supabase:", tables);
}

main();
