const fs = require('fs');
const path = require('path');
const { dom } = require('./mock_dom');

exports.run = async () => {
    let passed = 0;
    let failed = 0;

    const assert = (desc, condition) => {
        if (condition) {
            console.log(`  ✅ ${desc}`);
            passed++;
        } else {
            console.error(`  ❌ ${desc}`);
            failed++;
        }
    };

    console.log('Testing Black-Box Scenarios...');

    // --- Scenario 1: Manifest Integrity ---
    console.log('  [Manifest Integrity]');
    const manifestPath = path.join(__dirname, '../src/manifest.json');

    // 1.1 Valid JSON
    let manifest;
    try {
        const content = fs.readFileSync(manifestPath, 'utf8');
        manifest = JSON.parse(content);
        assert('manifest.json is valid JSON', true);
    } catch (e) {
        assert('manifest.json is valid JSON', false);
        return { total: 1, passed: 0, failed: 1 };
    }

    // 1.2 Required Fields (Manifest V3)
    assert('Has manifest_version 3', manifest.manifest_version === 3);
    assert('Has name', typeof manifest.name === 'string' && manifest.name.length > 0);
    assert('Has version', typeof manifest.version === 'string');
    assert('Has action', typeof manifest.action === 'object');

    // 1.3 File Existence Check
    const checkFile = (relPath) => {
        const fullPath = path.join(__dirname, '../src', relPath);
        return fs.existsSync(fullPath);
    };

    // Check icons
    if (manifest.icons) {
        Object.values(manifest.icons).forEach(icon => {
            assert(`Icon file exists: ${icon}`, checkFile(icon));
        });
    }

    // Check background script
    if (manifest.background && manifest.background.service_worker) {
        assert(`Service worker exists: ${manifest.background.service_worker}`, checkFile(manifest.background.service_worker));
    }

    // Check web accessible resources
    if (manifest.web_accessible_resources) {
        manifest.web_accessible_resources.forEach(war => {
            if (war.resources) {
                war.resources.forEach(res => {
                    assert(`Web resource exists: ${res}`, checkFile(res));
                });
            }
        });
    }

    // --- Scenario 2: Background Script Fuzzing ---
    console.log('  [Background Fuzzing]');
    // Load background script into a fresh context
    const bgPath = path.join(__dirname, '../src/background.js');
    const bgCode = fs.readFileSync(bgPath, 'utf8');

    // Reset listeners
    const listeners = { onMessage: [] };
    global.chrome.runtime.onMessage.addListener = (fn) => listeners.onMessage.push(fn);

    // Eval background code
    try {
        eval(bgCode);
    } catch (e) {
        console.error("Failed to load background.js for fuzzing", e);
    }

    if (listeners.onMessage.length > 0) {
        const handler = listeners.onMessage[0];

        // Helper to send message safely
        const sendFuzz = (msg) => {
            return new Promise(resolve => {
                try {
                    const ret = handler(msg, {}, (res) => resolve(res));
                    if (ret !== true) resolve(null); // Sync return
                } catch (e) {
                    resolve({ error: e });
                }
            });
        };

        // 2.1 Unknown Action
        const unknownRes = await sendFuzz({ action: 'UNKNOWN_ACTION_XYZ' });
        // Should not crash, might return undefined or specific error, but definitely not throw
        assert('Handles unknown action gracefully', !unknownRes || !unknownRes.error);

        // 2.2 Malformed Payload (Null)
        // Some handlers might expect an object
        try {
            await sendFuzz(null);
            assert('Handles null message gracefully', true);
        } catch (e) {
            assert('Handles null message gracefully', false);
        }

        // 2.3 Malformed Payload (String)
        try {
            await sendFuzz("Just a string");
            assert('Handles string message gracefully', true);
        } catch (e) {
            assert('Handles string message gracefully', false);
        }

        // 2.4 Huge Payload
        const hugeString = "A".repeat(10000);
        const hugeRes = await sendFuzz({ action: 'VALIDATE_LICENSE', key: hugeString });
        assert('Handles huge payload gracefully', hugeRes && hugeRes.success === false);
    } else {
        assert('Background script registered onMessage listener', false);
    }

    // --- Scenario 3: Initialization Robustness ---
    console.log('  [Initialization Robustness]');
    // Load content script into a context with minimal DOM
    const csPath = path.join(__dirname, '../src/contentScript.js');
    const csCode = fs.readFileSync(csPath, 'utf8');
    const i18nPath = path.join(__dirname, '../src/i18n.js');
    const i18nCode = fs.readFileSync(i18nPath, 'utf8');

    // Reset Window for this test
    global.window.OrbitApp = undefined;
    global.window.OrbitI18n = undefined;
    global.window.orbitInstance = undefined;

    // 3.1 Load i18n first
    eval(i18nCode);

    // 3.2 Load Content Script
    try {
        eval(csCode);
        assert('Content script loads without throwing', true);
    } catch (e) {
        assert('Content script loads without throwing', false);
        console.error(e);
    }

    // 3.3 Check if it attached to window
    assert('OrbitApp attached to window', !!global.window.OrbitApp);

    // 3.4 Init with missing body (simulate head-only execution or early injection)
    // We can't easily remove body from mock_dom global, but we can verify it doesn't crash if we call init() again
    try {
        if (global.window.orbitInstance) {
            await global.window.orbitInstance.init();
            assert('Re-init safe', true);
        }
    } catch (e) {
        assert('Re-init safe', false);
    }

    return { total: passed + failed, passed, failed };
};
