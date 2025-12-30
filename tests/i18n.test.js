const fs = require('fs');
const path = require('path');
const { dom } = require('./mock_dom');

// Load i18n.js
const i18nPath = path.join(__dirname, '../src/i18n.js');
const i18nCode = fs.readFileSync(i18nPath, 'utf8');

// Execute in mock window context
eval(i18nCode);

const OrbitI18n = global.window.OrbitI18n;

exports.run = async () => {
    let passed = 0;
    let failed = 0;
    const tests = [];

    const assert = (desc, condition) => {
        if (condition) {
            console.log(`  ✅ ${desc}`);
            passed++;
        } else {
            console.error(`  ❌ ${desc}`);
            failed++;
        }
    };

    console.log('Testing OrbitI18n...');

    const i18n = new OrbitI18n();

    // Test 1: Default Language
    assert('Default language is English', i18n.currentLang === 'en');

    // Test 2: Translation Retrieval (English)
    assert('Retrieves English translation', i18n.t('start') === 'Scan Non-Followers');

    // Test 3: Language Switching
    i18n.setLanguage('pt');
    assert('Switches language to PT', i18n.currentLang === 'pt');
    assert('Retrieves PT translation', i18n.t('start') === 'Buscar Não Seguidores');

    // Test 4: statusReady Fix Verification
    const languages = ['en', 'pt', 'de', 'fr', 'es', 'it'];
    languages.forEach(lang => {
        i18n.setLanguage(lang);
        const val = i18n.t('statusReady');
        assert(`statusReady exists for ${lang} (${val})`, val && val !== 'statusReady');
    });

    // Test 5: Fallback
    i18n.setLanguage('pt');
    assert('Fallback to key if missing', i18n.t('nonExistentKey') === 'nonExistentKey');

    // Test 6: Completeness Check (ALL Keys)
    console.log('  [Completeness Check]');
    const enKeys = Object.keys(i18n.translations['en']);
    const langs = ['pt', 'de', 'fr', 'es', 'it'];

    let missingCount = 0;
    langs.forEach(lang => {
        const langKeys = Object.keys(i18n.translations[lang]);
        const missing = enKeys.filter(k => !langKeys.includes(k));

        if (missing.length > 0) {
            console.error(`  ❌ ${lang} is missing keys: ${missing.join(', ')}`);
            missingCount += missing.length;
        } else {
            console.log(`  ✅ ${lang} has all ${enKeys.length} keys`);
            passed++;
        }
    });

    if (missingCount > 0) failed++;

    return { total: passed + failed, passed, failed };
};
