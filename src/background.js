chrome.action.onClicked.addListener(async (tab) => {
    const instagramUrl = 'https://www.instagram.com';

    // Check if current tab is Instagram
    if (tab.url && tab.url.startsWith(instagramUrl)) {
        injectScript(tab.id);
    } else {
        // Open Instagram in a new tab
        chrome.tabs.create({ url: instagramUrl }, (newTab) => {
            // Wait for it to load
            chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
                if (tabId === newTab.id && changeInfo.status === 'complete') {
                    injectScript(tabId);
                    chrome.tabs.onUpdated.removeListener(listener);
                }
            });
        });
    }
});

function injectScript(tabId) {
    chrome.scripting.insertCSS({
        files: ['contentScript.css'],
        target: { tabId: tabId }
    });

    // Inject i18n first, then the main script
    chrome.scripting.executeScript({
        files: ['i18n.js', 'contentScript.js'],
        target: { tabId: tabId }
    });
}

// License Validation Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'VALIDATE_LICENSE') {
        verifyGumroadLicense(request.key).then(isValid => {
            if (isValid) {
                // Store premium status
                chrome.storage.local.set({ 'orbit_status': 'premium_active' });
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false });
            }
        });
        return true; // Keep channel open for async
    }
});

async function verifyGumroadLicense(key) {
    try {
        // Gumroad API Verification
        // Docs: https://app.gumroad.com/api#licenses-verify
        const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                'product_id': 'NWdSvlcS7qfSoruOcHecFw==', // Product ID required by Gumroad
                'license_key': key
            })
        });

        const data = await response.json();

        // Check if success AND not refunded/chargebacked
        if (data.success && !data.purchase.refunded && !data.purchase.chargebacked) {
            console.log("Orbit: License verified!", data.purchase);
            return true;
        }

        console.warn("Orbit: License invalid or refunded", data);
        return false;
    } catch (error) {
        console.error('Orbit: License verification error:', error);
        return false;
    }
}