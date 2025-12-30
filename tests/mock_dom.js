// Mock DOM and Browser Globals (Lightweight, no jsdom)

class MockElement {
    constructor(tagName) {
        this.tagName = tagName;
        this.children = [];
        this.innerHTML = "";
        this.textContent = "";
        this.style = {};
        this.dataset = {};
        this.classList = {
            add: () => { },
            remove: () => { }
        };
    }

    appendChild(child) { this.children.push(child); }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    addEventListener() { }
    insertAdjacentHTML() { }
    remove() { }
}

const mockWindow = {
    OrbitI18n: null,
    OrbitApp: null,
    orbitInstance: null,
    location: { reload: () => { } },
    open: () => { },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    console: console,
    alert: () => { } // Mock alert to prevent crashes
};

const mockDocument = {
    body: new MockElement('BODY'),
    head: new MockElement('HEAD'),
    createElement: (tag) => new MockElement(tag.toUpperCase()),
    querySelector: () => null,
    querySelectorAll: () => [],
    cookie: "",
    title: "Instagram",
    addEventListener: () => { }
};

global.window = mockWindow;
global.document = mockDocument;
global.navigator = { userAgent: 'node.js' };
global.alert = mockWindow.alert;

// Mock Chrome API
global.chrome = {
    runtime: {
        getURL: (path) => `chrome-extension://mock/${path}`,
        sendMessage: (msg, cb) => cb && cb({ success: true })
    },
    storage: {
        local: {
            get: (keys) => Promise.resolve({})
        }
    }
};

// Mock fetch
global.fetch = async (url) => ({
    ok: true,
    json: async () => ({}),
    text: async () => ""
});

module.exports = { dom: { window: mockWindow } };
