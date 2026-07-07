const bcrypt = require('bcrypt');
const crypto = require('crypto');

async function run() {
    const hash = await bcrypt.hash('Admin@2026', 10);
    console.log("NOVO HASH: " + hash);
}

run();
