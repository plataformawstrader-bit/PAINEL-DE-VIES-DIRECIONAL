# Instruções de Execução do Painel de Viés Direcional

Este documento contém todas as instruções necessárias para rodar o backend e front‑end do **Painel de Viés Direcional** no seu Windows.

## 1. Pré‑requisitos

1. **Node.js** (versão 12 ou superior) – [download](https://nodejs.org/)
2. **Python 3** (para `python -m http.server`, usado apenas em scripts antigos – não mais necessário)
3. **PostgreSQL** (ou outro banco compatível com o schema fornecido)

> Se preferir, crie um arquivo `.env` com as credenciais:
> ```text
> JWT_SECRET=sua_chave_secreta
> DATABASE_URL=postgres://usuario:senha@localhost:5432/seubanco
> ```

## 2. Estrutura dos Arquivos

```
PAINEL DE VIES DIRECIONAL/
 ├─ alert_server.py
 ├─ ABRIR_PAINEL_V2.bat
 ├─ index.js
 ├─ index.html
 ├─ css/
 ├─ js/
 ├─ start_server.bat          <- script antigo
 ├─ run_all.bat               <- script recomendado
 └─ instrucoes.md
```

- **`index.js`**: Backend (Node + Express). Também serve os arquivos estáticos (html, css, js).
- **`run_all.bat`**: Script que instala dependências, define variáveis e inicia o servidor.
- **`start_server.bat`**: Script antigo (use **run_all.bat**).

## 3. Passos para Rodar

1. **Abra o Prompt de Comando** (cmd) ou PowerShell.
2. Navegue até a pasta do projeto:

   ```bat
   cd "C:\Users\ACER\Nova pasta\Desktop\PAINEL DE VIES DIRECIONAL"
   ```

3. Execute o script:

   ```bat
   run_all.bat
   ```

O script fará:
- Verificar a instalação do Node.
- Instalar as dependências (`npm install`).
- Definir (`JWT_SECRET` e `DATABASE_URL`).
- Iniciar o servidor Node na porta 3000.
- Abrir o navegador na página de login/cadastro (`index.html`).

4. Para **parar** o servidor, feche a janela **WS Painel** que apareceu ou volte ao Prompt e pressione qualquer tecla.

## 4. Rotas da API (expressas em `index.js`)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /register | Cria novo usuário com trial de 7 dias |
| POST | /login | Autentica usuário (verifica trial e status) |
| POST | /reset-password/email | Gera token de recuperação via e‑mail |
| POST | /reset-password/whatsapp | Gera token de recuperação via WhatsApp |
| POST | /admin/block/:userId | Bloqueia usuário (admin obrigatório) |
| POST | /admin/unblock/:userId | Desbloqueia usuário (admin obrigatório) |

Ver detalhes no arquivo `index.js`.

## 5. Observações Finais

- O **backend** e o **front‑end** são servidos pelo mesmo processo Node; não há mais servidor Python.
- Se precisar de **HTTPS** em desenvolvimento, remova o `app.use(express.static(...))` e crie um certificado SSL, depois use `https.createServer`.
- Mensagens de erro detalhadas são retornadas em JSON.
- O front‑end está em português (adaptado para o painel).

## 6. Troubleshooting

- **`npm install` falha**: verifique se o `package.json` está na raiz. Se não existir, crie um com as dependências: `express bcrypt jsonwebtoken pg`.
- **`JWT_SECRET` ou `DATABASE_URL` não definidos**: crie um arquivo `.env` ou defina as variáveis antes de executar o script.
- **Porta 3000 já em uso**: altere a constante `PORT` em `index.js` ou use uma outra porta e ajuste o script bat.

> **Boa codificação!**
