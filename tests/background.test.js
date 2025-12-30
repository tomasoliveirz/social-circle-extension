const fs = require('fs');
const path = require('path');
const { dom } = require('./mock_dom');

// Load background.js content
const bgPath = path.join(__dirname, '../src/background.js');
const bgCode = fs.readFileSync(bgPath, 'utf8');

// Mock Chrome API specifically for background.js
// We need to capture listeners to trigger them manually
const listeners = {
    onMessage: [],
    onClicked: [],
    onUpdated: []
};

global.chrome = {
    runtime: {
        onMessage: {
            addListener: (fn) => listeners.onMessage.push(fn)
        },
        getURL: (path) => `chrome-extension://mock/${path}`
    },
    action: {
        onClicked: {
            addListener: (fn) => listeners.onClicked.push(fn)
        }
    },
    tabs: {
        create: (props, cb) => cb && cb({ id: 999 }),
        onUpdated: {
            addListener: (fn) => listeners.onUpdated.push(fn),
            removeListener: () => { }
        }
    },
    scripting: {
        insertCSS: () => { },
        executeScript: () => { }
    },
    storage: {
        local: {
            set: (data) => {
                global.mockStorage = { ...global.mockStorage, ...data };
                return Promise.resolve();
            },
            get: (keys) => Promise.resolve(global.mockStorage || {})
        }
    }
};

// Reset storage before run
global.mockStorage = {};

// Execute background.js to register listeners
eval(bgCode);

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

    console.log('Testing background.js (License Validation)...');

    if (listeners.onMessage.length === 0) {
        console.error("  ❌ No onMessage listener registered");
        return { total: 1, passed: 0, failed: 1 };
    }

    const messageHandler = listeners.onMessage[0];

    // Helper to wrap message handler in Promise
    const sendMessage = (msg) => {
        return new Promise((resolve) => {
            messageHandler(msg, {}, (response) => {
                resolve(response);
            });
        });
    };

    // Test 1: Valid Key
    console.log('  [Valid Key]');
    const validRes = await sendMessage({ action: 'VALIDATE_LICENSE', key: 'TEST-KEY-123' });
    assert('Returns success: true for valid key', validRes && validRes.success === true);
    assert('Sets storage to premium_active', global.mockStorage.orbit_status === 'premium_active');

    // Test 2: Invalid Key
    console.log('  [Invalid Key]');
    global.mockStorage = {}; // Reset
    const invalidRes = await sendMessage({ action: 'VALIDATE_LICENSE', key: 'WRONG-KEY' });
    assert('Returns success: false for invalid key', invalidRes && invalidRes.success === false);
    assert('Does NOT set storage', !global.mockStorage.orbit_status);

    // Test 3: Empty Key
    console.log('  [Empty Key]');
    const emptyRes = await sendMessage({ action: 'VALIDATE_LICENSE', key: '' });
    assert('Returns success: false for empty key', emptyRes && emptyRes.success === false);

    // Test 4: Null Key
    const nullRes = await sendMessage({ action: 'VALIDATE_LICENSE', key: null });
    assert('Returns success: false for null key', nullRes && nullRes.success === false);

    // Test 5: Whitespace Key
    const spaceRes = await sendMessage({ action: 'VALIDATE_LICENSE', key: '   ' });
    assert('Returns success: false for whitespace key', spaceRes && spaceRes.success === false);

    return { total: passed + failed, passed, failed };
};
