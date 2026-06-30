const fs = require('fs');
const path = require('path');

let JavaScriptObfuscator;
try {
  JavaScriptObfuscator = require('javascript-obfuscator');
} catch (e) {
  console.error('\x1b[31m[ERRO] javascript-obfuscator não está instalado.\x1b[0m');
  console.log('Por favor, rode: \x1b[36mnpm install\x1b[0m antes de rodar este script.');
  process.exit(1);
}

const sourceDir = path.join(__dirname, 'js_source');
const outputDir = path.join(__dirname, 'js');

// Garante que o diretório de saída existe
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const filesToObfuscate = ['bias.js', 'fxindex.js', 'summary.js', 'tables.js'];
const filesToCopy = ['sockjs.min.js', 'main.min.js'];

console.log('\n==================================================');
console.log('   INICIANDO COMPILAÇÃO & OFUSCAÇÃO DO FRONTEND');
console.log('==================================================\n');

// 1. Ofusca os arquivos customizados
filesToObfuscate.forEach(file => {
  const sourcePath = path.join(sourceDir, file);
  const outputPath = path.join(outputDir, file);

  if (fs.existsSync(sourcePath)) {
    console.log(`🔹 Ofuscando código: \x1b[33m${file}\x1b[0m...`);
    const sourceCode = fs.readFileSync(sourcePath, 'utf8');
    
    try {
      const obfuscationResult = JavaScriptObfuscator.obfuscate(sourceCode, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        numbersToExpressions: true,
        simplify: true,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.75,
        splitStrings: true,
        splitStringsChunkLength: 8,
        unicodeEscapeSequence: false
      });
      
      fs.writeFileSync(outputPath, obfuscationResult.getObfuscatedCode(), 'utf8');
      console.log(`   \x1b[32m✔ Sucesso!\x1b[0m Gravado em: js/${file}`);
    } catch (err) {
      console.error(`   \x1b[31m❌ Falha ao ofuscar ${file}:\x1b[0m`, err);
    }
  } else {
    console.warn(`   \x1b[31m⚠ Aviso:\x1b[0m ${file} não foi encontrado na pasta js_source.`);
  }
});

// 2. Copia as bibliotecas de terceiros (sem ofuscar)
filesToCopy.forEach(file => {
  const sourcePath = path.join(sourceDir, file);
  const outputPath = path.join(outputDir, file);

  if (fs.existsSync(sourcePath)) {
    console.log(`🔹 Copiando biblioteca (sem alterar): \x1b[34m${file}\x1b[0m...`);
    fs.copyFileSync(sourcePath, outputPath);
    console.log(`   \x1b[32m✔ Sucesso!\x1b[0m Copiado para: js/${file}`);
  } else {
    console.warn(`   \x1b[31m⚠ Aviso:\x1b[0m Biblioteca ${file} não encontrada em js_source.`);
  }
});

console.log('\n==================================================');
console.log('   \x1b[32mOFUSCAÇÃO CONCLUÍDA COM SUCESSO!\x1b[0m');
console.log('==================================================\n');
