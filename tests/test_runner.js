// Simple Test Runner
const fs = require('fs');
const path = require('path');

const testDir = __dirname;
const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js'));

console.log(`Found ${files.length} test files.`);

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function runTests() {
    for (const file of files) {
        console.log(`\nRunning ${file}...`);
        try {
            const testModule = require(path.join(testDir, file));
            if (testModule.run) {
                const results = await testModule.run();
                totalTests += results.total;
                passedTests += results.passed;
                failedTests += results.failed;
            }
        } catch (e) {
            console.error(`Error running ${file}:`, e);
            failedTests++;
        }
    }

    console.log(`\n--- Summary ---`);
    console.log(`Total: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);

    if (failedTests > 0) process.exit(1);
}

runTests();
