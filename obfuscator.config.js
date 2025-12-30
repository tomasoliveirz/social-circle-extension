// obfuscator.config.js
module.exports = {
    // 1. Compressão e Limpeza
    compact: true,
    simplify: true,

    // 2. Proteção de Strings (Esconde URLs e Textos)
    stringArray: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayThreshold: 0.75, // 75% das strings serão encriptadas

    // 3. Lógica "Esparguete" (Torna o fluxo de leitura impossível)
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 1, // Aplica a tudo

    // 4. Injeção de Código Morto (Confunde quem lê)
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,

    // 5. Defesa Contra DevTools
    debugProtection: false, // CAUSA ERRO NO SERVICE WORKER (window not defined)
    debugProtectionInterval: 0,
    disableConsoleOutput: true, // Remove todos os teus console.log

    // 6. Defesa contra Formatação (Torna difícil usar "Prettier" no código hackeado)
    selfDefending: true,

    // Evita partir código que usa 'this' ou nomes de variáveis globais
    renameGlobals: false,
};
