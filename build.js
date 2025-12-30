// build.js
const fs = require('fs');
const path = require('path');
// const JavaScriptObfuscator = require('javascript-obfuscator');
// const config = require('./obfuscator.config.js');

// Pastas
const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');

// Função para garantir que a pasta dist existe
if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR);
}

// Lista de ficheiros JS para ofuscar
const jsFiles = ['background.js', 'contentScript.js', 'i18n.js'];

console.log('🚀 A iniciar Build de Segurança...');

// 1. Copiar ficheiros estáticos (manifest, css, imagens)
// Updated to include all icon sizes present in the project
const staticFiles = ['manifest.json', 'contentScript.css', 'icon16.png', 'icon32.png', 'icon48.png', 'icon128.png'];
staticFiles.forEach(file => {
    if (fs.existsSync(path.join(SRC_DIR, file))) {
        fs.copyFileSync(path.join(SRC_DIR, file), path.join(DIST_DIR, file));
        console.log(`✅ Copiado: ${file}`);
    }
});

// 2. Copiar JavaScript (Sem ofuscação)
jsFiles.forEach(file => {
    const filePath = path.join(SRC_DIR, file);
    if (fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, path.join(DIST_DIR, file));
        console.log(`✅ Copiado (Sem Ofuscação): ${file}`);
    }
});

console.log('🏁 Build concluída! Carrega a pasta "dist" no Chrome.');
