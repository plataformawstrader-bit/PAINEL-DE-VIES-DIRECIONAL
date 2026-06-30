#!/bin/bash
# Script para iniciar backend + frontend (arquivos estáticos) do Painel de Viés Direcional

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "=== Painel de Viés Direcional - Inicialização completa ==="

# -------------------------------------------------
# 1. Verifica Node.js
# -------------------------------------------------
if ! command -v node &> /dev/null; then
  echo "Node.js não encontrado. Instale o Node.js primeiro."
  exit 1
fi

# -------------------------------------------------
# 2. Instala dependências do backend se necessário
# -------------------------------------------------
if [ ! -d "node_modules" ]; then
  echo "Instalando dependências do backend..."
  npm install
fi

# -------------------------------------------------
# 3. Variáveis de ambiente (exige configuração)
# -------------------------------------------------
if [ -z "$JWT_SECRET" ] || [ -z "$DATABASE_URL" ]; then
  echo "AVISO: Defina as variáveis de ambiente:"
  echo "  export JWT_SECRET=\"sua_chave_secreta\""
  echo "  export DATABASE_URL=\"postgres://user:pass@localhost:5432/dbname\""
  echo "Continuando mesmo assim..."
fi

# -------------------------------------------------
# 4. Inicia backend em background
# -------------------------------------------------
echo "Iniciando backend (porta 3000)..."
node index.js &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# -------------------------------------------------
# 5. Serve frontend (arquivos estáticos) na porta 8080
# -------------------------------------------------
echo "Iniciando servidor estático do frontend (porta 8080)..."
# Usa Python 3 http.server (sem dependências extras)
python3 -m http.server 8080 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

# -------------------------------------------------
# 6. Aguarda CTRL+C e mata processos filhos
# -------------------------------------------------
cleanup() {
  echo -e "\nParando serviços..."
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo "=== Tudo rodando ==="
echo "Backend  -> http://localhost:3000"
echo "Frontend -> http://localhost:8080"
echo "Pressione CTRL+C para encerrar."

wait