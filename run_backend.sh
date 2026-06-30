#!/bin/bash
# Script para iniciar o backend do painel de vies direcional

# Diretório do projeto
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR" || exit 1

# Verifica se o Node.js está instalado
if ! command -v node &> /dev/null; then
  echo "Node.js não encontrado. Por favor instale o Node.js."
  exit 1
fi

# Instala dependências (executa npm install se node_modules não existir)
if [ ! -d "node_modules" ]; then
  echo "Instalando dependências..."
  npm install
fi

# Exibe variáveis de ambiente necessárias
echo "Configurações necessárias:"
echo "- JWT_SECRET: sua chave JWT (defina no .env ou exporte antes de iniciar)"
echo "- DATABASE_URL: string de conexão ao PostgreSQL (ex.: postgres://user:pass@localhost:5432/dbname)"
echo "========================"

# Inicia o servidor
echo "Iniciando o servidor..."
node index.js