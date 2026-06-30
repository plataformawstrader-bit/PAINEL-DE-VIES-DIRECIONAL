# Protótipo de Backend para Autenticação e Controle de Trial

## 1. Estrutura de Banco de Dados (SQL)
```sql
CREATE TABLE users (
    id               SERIAL PRIMARY KEY,
    email            VARCHAR(255) UNIQUE NOT NULL,
    whatsapp         VARCHAR(20)  UNIQUE NOT NULL,
    password_hash    VARCHAR(255) NOT NULL,
    created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    trial_expires_at TIMESTAMP    NOT NULL, -- 7 dias após created_at
    status           VARCHAR(10)  CHECK (status IN ('active','locked')) DEFAULT 'active',
    last_login       TIMESTAMP NULL
);

CREATE TABLE admin_actions (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id),
    action     VARCHAR(20) CHECK (action IN ('block','unblock')),
    admin_id   INTEGER NOT NULL, -- id do admin que executou a ação
    timestamp  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 2. Rotas API (Express.js + Node.js)
```js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const {Pool} = require('pg');
const pool = new Pool({/* conexão ao banco */});
const app = express();
app.use(express.json());

const JWT_SECRET = 'sua_chave_secreta';
const RECOVERY_TTL = 15 * 60; // 15 minutos em segundos

// Middleware admin (exemplo usando JWT com claim isAdmin)
function adminAuth(req, res, next){
  const token = req.headers.authorization?.split(' ')[1];
  if(!token) return res.sendStatus(401);
  try{ const payload = jwt.verify(token, JWT_SECRET); if(!payload.isAdmin) return res.sendStatus(403); req.admin = payload; next(); }
  catch{ res.sendStatus(401); }
}

// Helper para bloquear usuário quando trial expira
async function checkTrial(user){
  const now = new Date();
  if(user.trial_expires_at < now && user.status === 'active'){
    await pool.query('UPDATE users SET status=$1 WHERE id=$2', ['locked', user.id]);
    user.status='locked';
  }
  return user;
}

// 1) Registro
app.post('/register', async (req,res)=>{
  const {email, whatsapp, password} = req.body;
  const hash = await bcrypt.hash(password, 12);
  const createdAt = new Date();
  const trialExpires = new Date(createdAt.getTime()+7*24*60*60*1000);
  try{
    const result = await pool.query(
      `INSERT INTO users (email, whatsapp, password_hash, created_at, trial_expires_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, email, status`,
      [email, whatsapp, hash, createdAt, trialExpires]
    );
    res.status(201).json(result.rows[0]);
  }catch(e){ res.status(400).json({error:e.message}); }
});

// 2) Login
app.post('/login', async (req,res)=>{
  const {login, password} = req.body; // login pode ser email ou whatsapp
  const user = await pool.query(
    `SELECT * FROM users WHERE email=$1 OR whatsapp=$1`, [login]
  ).then(r=>r.rows[0]);
  if(!user) return res.status(401).json({error:'Credenciais inválidas'});
  // Verificar e atualizar trial
  await checkTrial(user);
  if(user.status !== 'active') return res.status(403).json({error:'Conta bloqueada'});
  const match = await bcrypt.compare(password, user.password_hash);
  if(!match) return res.status(401).json({error:'Credenciais inválidas'});
  const token = jwt.sign({sub:user.id, email:user.email}, JWT_SECRET, {expiresIn:'1h'});
  await pool.query('UPDATE users SET last_login=$1 WHERE id=$2', [new Date(), user.id]);
  res.json({token});
});

// 3) Recuperação de senha (e‑mail)
app.post('/reset-password/email', async (req,res)=>{
  const {email} = req.body;
  const user = await pool.query('SELECT id FROM users WHERE email=$1', [email]).then(r=>r.rows[0]);
  if(!user) return res.status(404).json({error:'Usuário não encontrado'});
  const token = jwt.sign({sub:user.id, type:'recovery'}, JWT_SECRET, {expiresIn:RECOVERY_TTL});
  // TODO: enviar e‑mail com o token (ex: nodemailer)
  res.json({msg:'Token enviado por e‑mail'});
});

// 4) Recuperação de senha (WhatsApp)
app.post('/reset-password/whatsapp', async (req,res)=>{
  const {whatsapp} = req.body;
  const user = await pool.query('SELECT id FROM users WHERE whatsapp=$1', [whatsapp]).then(r=>r.rows[0]);
  if(!user) return res.status(404).json({error:'Usuário não encontrado'});
  const token = jwt.sign({sub:user.id, type:'recovery'}, JWT_SECRET, {expiresIn:RECOVERY_TTL});
  // TODO: integrar com API de WhatsApp para envio do token
  res.json({msg:'Token enviado por WhatsApp'});
});

// 5) Bloquear (admin)
app.post('/admin/block/:userId', adminAuth, async (req,res)=>{
  const {userId}=req.params;
  await pool.query('UPDATE users SET status=$1 WHERE id=$2', ['locked', userId]);
  await pool.query('INSERT INTO admin_actions (user_id, action, admin_id) VALUES ($1,$2,$3)', [userId,'block',req.admin.id]);
  res.json({msg:`Usuário ${userId} bloqueado`});
});

// 6) Desbloquear (admin)
app.post('/admin/unblock/:userId', adminAuth, async (req,res)=>{
  const {userId}=req.params;
  await pool.query('UPDATE users SET status=$1 WHERE id=$2', ['active', userId]);
  await pool.query('INSERT INTO admin_actions (user_id, action, admin_id) VALUES ($1,$2,$3)', [userId,'unblock',req.admin.id]);
  res.json({msg:`Usuário ${userId} desbloqueado`});
});

app.listen(3000,()=>console.log('API rodando na porta 3000'));
```

## 3. Como Testar
1. **Instalar dependências**
```
npm i express bcrypt jsonwebtoken pg
```
2. **Criar banco** (PostgreSQL) e executar o script SQL da seção 1.
3. **Rodar** `node index.js` (salve o código acima em `index.js`).
4. Utilizar **Postman** ou **curl** para testar as rotas (`/register`, `/login`, `/reset-password/*`, `/admin/*`).

## 4. Segurança Extra
- **Rate‑limit** nas rotas de login (`express-rate-limit`).
- **HTTPS** obrigatório (por exemplo, usando `helmet` + reverse proxy). 
- **Armazenamento seguro** dos tokens de recuperação (não salvar em texto plano). 
- **Auditoria**: a tabela `admin_actions` guarda quem bloqueou/desbloqueou e quando.

---
**Observação:** Este protótipo serve apenas como ponto de partida. Ajuste a política de TTL, as chaves secretas e as integrações (e‑mail/WhatsApp) conforme a sua infraestrutura.
