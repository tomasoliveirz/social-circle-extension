const fs = require('fs');
const path = require('path');
const { dom } = require('./mock_dom');

// Load Dependencies
const i18nPath = path.join(__dirname, '../src/i18n.js');
const csPath = path.join(__dirname, '../src/contentScript.js');

const i18nCode = fs.readFileSync(i18nPath, 'utf8');
const csCode = fs.readFileSync(csPath, 'utf8');

// Execute in mock window context
// 1. Load I18n
eval(i18nCode);

// 2. Load Content Script
// Note: This will instantiate OrbitApp and try to run init()
// We expect init() to fail or do nothing harmlessly in mock DOM
try {
    eval(csCode);
} catch (e) {
    console.warn("Warning during contentScript eval:", e);
}

const app = global.window.orbitInstance;

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

    console.log('Testing Core Logic...');

    if (!app) {
        console.error("  ❌ Failed to load OrbitApp instance");
        return { total: 1, passed: 0, failed: 1 };
    }

    // --- Rate Limiter Tests ---
    console.log('  [RateLimiter]');
    const limiter = app.limiter;

    // Test 1: Default State
    assert('Default concurrency is 3 (Fast)', limiter.concurrency === 3);

    // Test 2: Speed Setting
    limiter.setSpeed('SAFE');
    assert('Sets SAFE speed (concurrency 1)', limiter.concurrency === 1);
    assert('Sets SAFE delay (2000)', limiter.delay === 2000);

    limiter.setSpeed('TURBO');
    assert('Sets TURBO speed (concurrency 5)', limiter.concurrency === 5);

    // Test 3: Scheduling
    let taskRun = false;
    await limiter.schedule(async () => { taskRun = true; });
    assert('Executes scheduled task', taskRun === true);

    // --- Parsing Tests ---
    console.log('  [Parsing]');

    // Test 4: Scrape Meta Description
    const metaHtml = `
        <html>
            <head>
                <meta property="og:description" content="1,234 Followers, 500 Following, 100 Posts - See Instagram photos and videos from User (@user)">
            </head>
            <body></body>
        </html>
    `;
    const count1 = app.scrapeStatsFromPage(metaHtml);
    assert('Scrapes 1,234 followers from meta', count1 === 1234);

    // Test 5: Scrape K/M Suffixes
    const metaHtmlK = `<meta property="og:description" content="10.5k Followers, 500 Following">`;
    const count2 = app.scrapeStatsFromPage(metaHtmlK);
    assert('Scrapes 10.5k followers as 10500', count2 === 10500);

    const metaHtmlM = `<meta property="og:description" content="1.2m Followers, 500 Following">`;
    const count3 = app.scrapeStatsFromPage(metaHtmlM);
    assert('Scrapes 1.2m followers as 1200000', count3 === 1200000);

    // Test 6: Scrape JSON Blob
    const jsonHtml = `
        <script type="text/javascript">
            window._sharedData = {"entry_data":{"ProfilePage":[{"graphql":{"user":{"edge_followed_by":{"count":5678}}}}]}};
        </script>
    `;
    const count4 = app.scrapeStatsFromPage(jsonHtml);
    assert('Scrapes 5678 followers from JSON blob', count4 === 5678);

    // Test 7: Invalid Data
    const invalidHtml = `<html><body>No data here</body></html>`;
    const count5 = app.scrapeStatsFromPage(invalidHtml);
    assert('Returns null for invalid data', count5 === null);

    return { total: passed + failed, passed, failed };
};
