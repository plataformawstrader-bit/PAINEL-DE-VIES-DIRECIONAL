const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fiewhkxayneocehldfcp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZXdoa3hheW5lb2NlaGxkZmNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTczMjI0MiwiZXhwIjoyMDk3MzA4MjQyfQ.ozLnTLhjcQkcq8GMyPlWNebET5lRWoUmY_rL-1ASsiM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    const { data: users, error } = await supabase
        .from('users')
        .select('*');
    
    if (error) {
        console.error("Erro ao listar usuários:", error.message);
        return;
    }
    
    console.log("Usuários no Supabase:");
    users.forEach(u => {
        console.log(`ID: ${u.id} | Nome: ${u.name} | E-mail: ${u.email} | Admin: ${u.is_admin} | Trial End: ${u.trial_end}`);
    });
}

main();
