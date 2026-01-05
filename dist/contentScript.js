/**
 * Orbit - Social Circle Visualizer
 * contentScript.js
 */

(function () {
    if (!window.OrbitApp) {
        // --- Constants & Config ---
        const CONFIG = {
            SPEEDS: {
                SAFE: { delay: 2000, batchSize: 1, concurrency: 1, label: 'speedSafe' },
                FAST: { delay: 800, batchSize: 1, concurrency: 3, label: 'speedFast' },
                // Turbo is now mapped to Fast for safety, but keeping key for compatibility if needed
                TURBO: { delay: 300, batchSize: 1, concurrency: 5, label: 'speedTurbo' }
            },
            MAX_SESSION_USERS: 2000, // Pause after this many users to avoid hard limits
            FREEMIUM_LIMIT: 10, // Max visible users for free plan
            API_BASE: 'https://www.instagram.com',
            GRAPHQL_HASH: '3dec7e2c57367ef3da3d987d89f9dbc8' // Follows hash
        };

        // --- Rate Limiter ---
        class RateLimiter {
            constructor() {
                this.queue = [];
                this.activeRequests = 0;
                // Default to FAST speed since selector is removed
                this.concurrency = 3;
                this.delay = 800;
                this.paused = false;
            }

            setSpeed(speedKey) {
                const settings = CONFIG.SPEEDS[speedKey] || CONFIG.SPEEDS.FAST;
                this.concurrency = settings.concurrency;
                this.delay = settings.delay;
            }

            async schedule(fn) {
                return new Promise((resolve, reject) => {
                    this.queue.push({ fn, resolve, reject });
                    this.process();
                });
            }

            async process() {
                if (this.paused || this.activeRequests >= this.concurrency || this.queue.length === 0) return;

                this.activeRequests++;
                const { fn, resolve, reject } = this.queue.shift();

                try {
                    const result = await fn();
                    resolve(result);
                } catch (err) {
                    reject(err);
                } finally {
                    this.activeRequests--;
                    // Random jitter to delay
                    const jitter = Math.random() * 500;
                    setTimeout(() => this.process(), this.delay + jitter);
                }
            }

            pause() { this.paused = true; }
            resume() { this.paused = false; this.process(); }
            clear() { this.queue = []; }
        }

        // --- Instagram API ---
        class InstagramAPI {
            constructor() {
                this.userId = null;
                this.csrfToken = null;
                this.headers = {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "X-Requested-With": "XMLHttpRequest",
                    "X-Asbd-Id": "129477"
                };
            }

            init() {
                // Extract tokens from DOM
                try {
                    const html = document.body.innerHTML;
                    const scripts = document.querySelectorAll('script');
                    let scriptContent = "";

                    // 1. Try finding config in scripts
                    for (let s of scripts) {
                        if (s.textContent.includes('csrf_token') || s.textContent.includes('viewerId')) {
                            scriptContent += s.textContent;
                        }
                    }

                    // Viewer ID Strategies
                    // Prioritize cookie as it's the most reliable for the logged-in user
                    const viewerIdMatches = [
                        document.cookie.match(/ds_user_id=(\d+)/),
                        html.match(/"viewerId":"(\d+)"/),
                        html.match(/"id":"(\d+)","username"/),
                        html.match(/"actorID":"(\d+)"/),
                        scriptContent.match(/"viewerId":"(\d+)"/)
                    ];

                    for (let m of viewerIdMatches) {
                        if (m && m[1]) {
                            this.userId = m[1];
                            break;
                        }
                    }

                    // Username Strategies
                    const usernameMatches = [
                        // Try finding username in specific script tags first (most reliable)
                        scriptContent.match(/"username":"([a-zA-Z0-9._]+)"/),
                        // Look for the specific config object pattern
                        html.match(/"username":"([a-zA-Z0-9._]+)"/),
                        // Fallback to title tag which usually contains "Name (@username)"
                        document.title.match(/\(@([a-zA-Z0-9._]+)\)/),
                        // Cookie fallback
                        document.cookie.match(/ds_user=([a-zA-Z0-9._]+)/)
                    ];

                    for (let m of usernameMatches) {
                        if (m && m[1] && m[1] !== "instagram" && !m[1].includes("viewport")) {
                            this.username = m[1];
                            break;
                        }
                    }

                    // CSRF Token Strategies
                    const csrfMatches = [
                        document.cookie.match(/csrftoken=([\w-]+)/),
                        html.match(/"csrf_token":"([\w-]+)"/),
                        scriptContent.match(/"csrf_token":"([\w-]+)"/)
                    ];

                    for (let m of csrfMatches) {
                        if (m && m[1]) {
                            this.csrfToken = m[1];
                            break;
                        }
                    }

                    // App ID Strategies
                    const appIdMatches = [
                        html.match(/"X-IG-App-ID":"(\d+)"/),
                        html.match(/"appId":"(\d+)"/),
                        scriptContent.match(/"appId":"(\d+)"/)
                    ];

                    let appId = "936619743392459"; // Default fallback
                    for (let m of appIdMatches) {
                        if (m && m[1]) {
                            appId = m[1];
                            break;
                        }
                    }

                    if (this.csrfToken) this.headers["X-Csrftoken"] = this.csrfToken;
                    if (appId) this.headers["X-Ig-App-Id"] = appId;

                    console.log("Orbit: Identity extracted", {
                        userId: this.userId,
                        username: this.username,
                        hasCsrf: !!this.csrfToken,
                        appId: appId,
                        source: "cookie-priority"
                    });
                    return !!this.userId;
                } catch (e) {
                    console.error("Orbit: Failed to extract identity", e);
                    return false;
                }
            }

            async fetchFollows(cursor = "") {
                const variables = JSON.stringify({
                    id: this.userId,
                    include_reel: false,
                    fetch_mutual: false,
                    first: 50,
                    after: cursor
                });

                const url = `${CONFIG.API_BASE}/graphql/query/?query_hash=${CONFIG.GRAPHQL_HASH}&variables=${encodeURIComponent(variables)}`;
                const res = await fetch(url, { headers: this.headers });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.json();
            }

            async fetchUserProfile(username) {
                const url = `${CONFIG.API_BASE}/api/v1/users/web_profile_info/?username=${username}`;
                const res = await fetch(url, { headers: this.headers });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.json();
            }

            async fetchProfileHtml(username) {
                const url = `${CONFIG.API_BASE}/${username}/`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.text();
            }

            async unfollow(userId) {
                const url = `${CONFIG.API_BASE}/api/v1/friendships/destroy/${userId}/`;
                const res = await fetch(url, {
                    method: "POST",
                    headers: this.headers,
                    mode: "cors"
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.json();
            }
        }

        // --- UI Manager ---
        class UIManager {
            constructor(i18n) {
                this.i18n = i18n;
                this.elements = {};
                this.events = {};
                this.icons = {
                    search: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
                    globe: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
                    trash: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
                    close: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
                };
            }

            inject() {
                if (document.querySelector('.orbit-overlay')) return;

                const html = `
                    <div class="orbit-overlay">
                        <div class="orbit-container">
                            <div class="orbit-header">
                                <div class="orbit-brand">
                                    <img src="${chrome.runtime.getURL('icon48.png')}" class="orbit-logo-img">
                                    <div class="orbit-title">${this.i18n.t('title')}</div>
                                </div>
                                <div class="orbit-header-actions">
                                    <div class="orbit-lang-wrapper" style="position: relative;">
                                        <button class="orbit-lang-select" id="orbit-lang-btn" title="Language">
                                            ${this.icons.globe}
                                        </button>
                                        <!-- Hidden native select for functionality, styled to be invisible but clickable over the icon if needed, or just toggle a custom menu. 
                                             For simplicity/robustness, we'll keep the select but make it opacity 0 over the icon, OR just style the select itself if possible.
                                             Let's try a clean select approach first. -->
                                        <select class="orbit-lang-select-native" id="orbit-lang" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;">
                                            <option value="en">English</option>
                                            <option value="pt">Português</option>
                                            <option value="es">Español</option>
                                            <option value="de">Deutsch</option>
                                            <option value="fr">Français</option>
                                            <option value="it">Italiano</option>
                                        </select>
                                    </div>
                                    <button class="orbit-close">${this.icons.close}</button>
                                </div>
                            </div>
                            
                            <div class="orbit-dashboard">
                                <div class="orbit-stat-card">
                                    <span class="orbit-stat-value" id="orbit-stat-non-followers">0</span>
                                    <span class="orbit-stat-label">${this.i18n.t('nonFollowers')}</span>
                                </div>
                                <div class="orbit-stat-card">
                                    <span class="orbit-stat-value" id="orbit-stat-total">--</span>
                                    <span class="orbit-stat-label">${this.i18n.t('totalFollowers')}</span>
                                </div>
                            </div>

                            <div class="orbit-controls">
                                <div class="orbit-search-container">
                                    <div class="orbit-search-icon">${this.icons.search}</div>
                                    <input type="text" class="orbit-search" placeholder="${this.i18n.t('searchPlaceholder')}">
                                </div>
                                <div class="orbit-actions-row">
                                    <button class="orbit-btn-primary" id="orbit-start">
                                        ${this.i18n.t('start')}
                                    </button>
                                </div>
                            </div>

                            <div class="orbit-list" id="orbit-list">
                                <div class="orbit-list-empty">
                                    ${this.i18n.t('statusReady')}
                                </div>
                            </div>

                            <div class="orbit-footer">
                                <span class="orbit-status" id="orbit-status">Ready</span>
                                <span class="orbit-version">v2.1.0</span>
                            </div>
                        </div>
                    </div>
                `;

                document.body.insertAdjacentHTML('beforeend', html);
                document.body.style.overflow = 'hidden';

                this.cacheElements();
                this.bindEvents();
                this.updateLangSelect();
            }

            cacheElements() {
                this.el = {
                    overlay: document.querySelector('.orbit-overlay'),
                    close: document.querySelector('.orbit-close'),
                    list: document.querySelector('#orbit-list'),
                    startBtn: document.querySelector('#orbit-start'),
                    search: document.querySelector('.orbit-search'),
                    lang: document.querySelector('#orbit-lang'),
                    status: document.querySelector('#orbit-status'),
                    stats: {
                        nonFollowers: document.querySelector('#orbit-stat-non-followers'),
                        total: document.querySelector('#orbit-stat-total')
                    }
                };
            }

            bindEvents() {
                this.el.close.addEventListener('click', () => this.destroy());
                this.el.overlay.addEventListener('click', (e) => {
                    if (e.target === this.el.overlay) this.destroy();
                });

                this.el.startBtn.addEventListener('click', () => this.emit('start'));
                this.el.search.addEventListener('input', (e) => this.emit('filter', e.target.value));

                this.el.lang.addEventListener('change', (e) => this.emit('langChange', e.target.value));

                this.el.list.addEventListener('click', (e) => {
                    const btn = e.target.closest('.orbit-btn-unfollow');
                    if (btn) {
                        this.emit('unfollow', btn.dataset.id, btn);
                    }
                });
            }

            updateLangSelect() {
                if (this.el.lang) this.el.lang.value = this.i18n.currentLang;
            }

            destroy() {
                if (this.el.overlay) this.el.overlay.remove();
                document.body.style.overflow = '';
                this.emit('close');
            }

            on(event, fn) {
                this.events[event] = fn;
            }

            emit(event, ...args) {
                if (this.events[event]) this.events[event](...args);
            }

            addUser(user, isPremium, currentCount) {
                // Remove empty state if present
                const empty = this.el.list.querySelector('.orbit-list-empty');
                if (empty) empty.remove();

                // Logic:
                // 1. If Premium OR count <= LIMIT: Render Real User
                // 2. If !Premium AND count > LIMIT:
                //    a. If count <= LIMIT + 5: Render Fake User (Blurred)
                //    b. If count == LIMIT + 1: Render Overlay (Once)
                //    c. If count > LIMIT + 5: Do nothing (don't render anything)

                if (isPremium || currentCount <= CONFIG.FREEMIUM_LIMIT) {
                    this.renderRealUser(user);
                } else if (currentCount <= CONFIG.FREEMIUM_LIMIT + 5) {
                    // Create locked container if it doesn't exist yet
                    let lockedContainer = this.el.list.querySelector('.orbit-locked-container');
                    if (!lockedContainer) {
                        lockedContainer = document.createElement('div');
                        lockedContainer.className = 'orbit-locked-container';
                        this.el.list.appendChild(lockedContainer);

                        // Add Overlay immediately
                        // We don't know the total count here easily without passing it down or tracking it globally, 
                        // but we can update the text later or just say "More".
                        // For now, let's use a generic message or update it if possible.
                        const overlay = this.createPaywallOverlay();
                        lockedContainer.appendChild(overlay);
                    }

                    this.renderFakeUser(lockedContainer);
                }
            }

            renderRealUser(user) {
                const html = `
                    <div class="orbit-user-item" data-username="${user.username.toLowerCase()}" data-fullname="${(user.full_name || '').toLowerCase()}">
                        <a href="https://www.instagram.com/${user.username}/" target="_blank">
                            <img src="${user.profile_pic_url}" class="orbit-avatar">
                        </a>
                        <div class="orbit-user-info">
                            <a href="https://www.instagram.com/${user.username}/" target="_blank" class="orbit-username">
                                ${user.username}
                            </a>
                            <span class="orbit-fullname">${user.full_name}</span>
                        </div>
                        <button class="orbit-btn-unfollow" data-id="${user.id}" title="${this.i18n.t('unfollow')}">
                            ${this.icons.trash}
                        </button>
                    </div>
                `;
                this.el.list.insertAdjacentHTML('beforeend', html);
            }

            renderFakeUser(container) {
                const fakeRow = document.createElement('div');
                fakeRow.className = 'orbit-row is-locked';
                fakeRow.innerHTML = `
                    <div class="orbit-avatar" style="background: #333; border: none;"></div>
                    <div class="orbit-user-info">
                        <span class="orbit-username" style="color: #666;">********</span>
                        <span class="orbit-fullname" style="color: #444;">Hidden User</span>
                    </div>
                `;
                container.appendChild(fakeRow);
            }

            createPaywallOverlay() {
                const div = document.createElement('div');
                div.className = 'orbit-paywall-overlay';
                div.innerHTML = `
                    <div class="orbit-paywall-title">Unlock Full List</div>
                    <div class="orbit-paywall-subtitle">View all non-followers, whitelist friends, and protect your account.</div>
                    <button class="orbit-btn-upgrade" id="orbit-trigger-buy">
                        Get Orbit Pro
                    </button>
                    <a href="#" class="orbit-link-activate" id="orbit-trigger-activate">
                        Have a key? Activate
                    </a>
                `;

                // Bind events for these buttons
                // Note: Since we are creating this dynamically, we need to bind here or delegate.
                // Delegation is better but let's do direct for simplicity if we can access 'this'.
                // We can't easily access 'this.emit' inside innerHTML string, so we'll add listeners after.
                setTimeout(() => {
                    const buyBtn = div.querySelector('#orbit-trigger-buy');
                    const actBtn = div.querySelector('#orbit-trigger-activate');
                    if (buyBtn) buyBtn.addEventListener('click', () => window.open('https://orbittools.space/tools/orbit-social-circle', '_blank'));
                    if (actBtn) actBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        const key = prompt("Enter your License Key:");
                        if (key) {
                            chrome.runtime.sendMessage({ action: 'VALIDATE_LICENSE', key: key.trim() }, (response) => {
                                if (response && response.success) {
                                    alert("Pro Activated! Please refresh.");
                                    window.location.reload();
                                } else {
                                    alert("Invalid Key");
                                }
                            });
                        }
                    });
                }, 0);

                return div;
            }

            clearList() {
                this.el.list.innerHTML = '';
            }

            updateStatus(msg) {
                this.el.status.innerText = msg;
            }

            updateStats(nonFollowers, total) {
                if (nonFollowers !== null && nonFollowers !== undefined) this.el.stats.nonFollowers.innerText = nonFollowers;
                if (total !== null && total !== undefined) this.el.stats.total.innerText = total.toLocaleString();
            }

            setLoading(isLoading) {
                if (isLoading) {
                    this.el.startBtn.disabled = true;
                    this.el.startBtn.innerText = "Scanning..."; // Or use a spinner
                    this.el.startBtn.style.opacity = "0.8";
                    this.el.startBtn.style.cursor = "wait";
                } else {
                    this.el.startBtn.disabled = false;
                    this.el.startBtn.innerText = this.i18n.t('start');
                    this.el.startBtn.style.opacity = "1";
                    this.el.startBtn.style.cursor = "pointer";
                }
            }
        }

        // --- Main App ---
        class OrbitApp {
            constructor() {
                this.i18n = new window.OrbitI18n();
                this.api = new InstagramAPI();
                this.limiter = new RateLimiter();
                this.ui = new UIManager(this.i18n);

                this.state = {
                    users: [],
                    isRunning: false,
                    nonFollowers: 0,
                    isPremium: false // Default to false for Freemium
                };
            }

            async init() {
                if (!this.api.init()) {
                    alert(this.i18n.t('loginError'));
                    return;
                }

                // Check Premium Status
                try {
                    const storage = await chrome.storage.local.get(['orbit_status']);
                    if (storage.orbit_status === 'premium_active') {
                        this.state.isPremium = true;
                        console.log("Orbit: Premium Active 🌟");
                    }
                } catch (e) {
                    console.warn("Orbit: Failed to check premium status", e);
                }

                this.ui.inject();
                this.bindAppEvents();

                // Attempt to load stats immediately
                await this.loadStats();
            }

            toggle() {
                if (document.querySelector('.orbit-overlay')) {
                    this.ui.destroy();
                } else {
                    this.init();
                }
            }

            async loadStats() {
                // 1. Try scraping current page (fastest)
                let count = this.scrapeStatsFromPage(document.body.innerHTML);
                if (count !== null) {
                    this.ui.updateStats(null, count);
                    this.ui.updateStatus("Ready");
                    return;
                }

                if (!this.api.username) return;

                // 2. Try fetching profile HTML (bypasses API rate limits)
                try {
                    this.ui.updateStatus(this.i18n.t('loading'));
                    const html = await this.api.fetchProfileHtml(this.api.username);
                    count = this.scrapeStatsFromPage(html);
                    if (count !== null) {
                        console.log("Orbit: Scraped stats from profile HTML");
                        this.ui.updateStats(null, count);
                        this.ui.updateStatus("Ready");
                        return;
                    }
                } catch (e) {
                    console.warn("Orbit: Profile HTML fetch failed", e);
                }

                // 3. Fallback to API (last resort)
                try {
                    // Add delay to be polite
                    await new Promise(r => setTimeout(r, 1500));
                    const profile = await this.api.fetchUserProfile(this.api.username);
                    const user = profile.data.user;
                    if (user) {
                        this.ui.updateStats(null, user.edge_followed_by.count);
                    }
                    this.ui.updateStatus("Ready");
                } catch (e) {
                    console.warn("Orbit: API stats fetch failed", e);
                }
            }

            scrapeStatsFromPage(htmlContent) {
                try {
                    // Strategy 1: Meta Description (Most reliable for public/visible pages)
                    // Format is usually "123 Followers, 456 Following..." or "123 Seguidores..."
                    // We just grab the first number-like pattern at the start.
                    let metaContent = null;
                    if (htmlContent === document.body.innerHTML) {
                        metaContent = document.querySelector('meta[property="og:description"]')?.content;
                    } else {
                        const match = htmlContent.match(/<meta property="og:description" content="([^"]+)"/);
                        if (match) metaContent = match[1];
                    }

                    if (metaContent) {
                        console.log("Orbit: Found meta description:", metaContent);
                        // Match the first number (including k/m suffixes) at the start of the string
                        const match = metaContent.match(/^([\d,.]+[kKmM]?)/);
                        if (match && match[1]) {
                            return this.parseCount(match[1]);
                        }
                    }

                    // Strategy 2: Script Regex (Deep search in JSON blobs)
                    const matches = [
                        htmlContent.match(/"edge_followed_by":{"count":(\d+)}/),
                        htmlContent.match(/"edge_followed_by":\s*{"count":\s*(\d+)}/)
                    ];

                    for (let m of matches) {
                        if (m && m[1]) {
                            return parseInt(m[1]);
                        }
                    }
                } catch (e) {
                    console.warn("Orbit: Scraping failed", e);
                }
                return null;
            }

            parseCount(str) {
                str = str.replace(/,/g, '').toLowerCase();
                if (str.includes('k')) return parseFloat(str) * 1000;
                if (str.includes('m')) return parseFloat(str) * 1000000;
                return parseInt(str);
            }

            bindAppEvents() {
                this.ui.on('close', () => {
                    this.state.isRunning = false;
                    this.limiter.clear();
                });

                this.ui.on('start', () => this.startScan());

                this.ui.on('langChange', (lang) => {
                    this.i18n.setLanguage(lang);

                    // Capture State
                    const oldList = this.ui.el.list.innerHTML;
                    const currentTotalText = this.ui.el.stats.total.innerText;
                    let totalNum = null;
                    if (currentTotalText && currentTotalText !== '--') {
                        totalNum = parseInt(currentTotalText.replace(/[^0-9]/g, ''));
                    }

                    this.ui.destroy();
                    this.ui.inject();

                    // Restore State
                    this.ui.el.list.innerHTML = oldList;
                    this.ui.updateStats(this.state.nonFollowers, totalNum);

                    if (this.state.isRunning) {
                        this.ui.setLoading(true);
                        this.ui.updateStatus(this.i18n.t('analyzing'));
                    } else {
                        // If list has items but not running, maybe we finished? 
                        // For now, default to Ready to be safe, or "Finished" if we could track that.
                        // But "Ready" is acceptable.
                        this.ui.updateStatus(this.i18n.t('statusReady'));
                    }

                    this.bindAppEvents();
                });

                this.ui.on('filter', (query) => {
                    const q = query.toLowerCase();
                    const items = document.querySelectorAll('.orbit-user-item');
                    items.forEach(item => {
                        const u = item.dataset.username;
                        const f = item.dataset.fullname;
                        if (u.includes(q) || f.includes(q)) {
                            item.classList.remove('orbit-hidden');
                        } else {
                            item.classList.add('orbit-hidden');
                        }
                    });
                });

                this.ui.on('unfollow', (id, btn) => this.handleUnfollow(id, btn));
            }

            async startScan() {
                if (this.state.isRunning) return;
                this.state.isRunning = true;
                this.state.nonFollowers = 0; // RESET STATE
                this.ui.clearList();
                this.ui.setLoading(true);
                this.ui.updateStatus(this.i18n.t('analyzing'));

                try {
                    let hasNext = true;
                    let cursor = "";
                    let totalChecked = 0;

                    while (hasNext && this.state.isRunning) {
                        const data = await this.limiter.schedule(() => this.api.fetchFollows(cursor));

                        if (!data.data || !data.data.user) {
                            console.error("Orbit: API Error Full Response:", JSON.stringify(data, null, 2));
                            console.error("Orbit: Debug Info:", {
                                userId: this.api.userId,
                                headers: this.api.headers
                            });
                            throw new Error("Failed to fetch user data. Check console for details.");
                        }
                        const user = data.data.user;
                        const edges = user.edge_follow.edges;

                        if (user.edge_followed_by) {
                            this.ui.updateStats(this.state.nonFollowers, user.edge_followed_by.count);
                        }

                        hasNext = user.edge_follow.page_info.has_next_page;
                        cursor = user.edge_follow.page_info.end_cursor;

                        for (const edge of edges) {
                            if (!edge.node.follows_viewer) {
                                this.state.nonFollowers++;
                                this.ui.addUser(edge.node, this.state.isPremium, this.state.nonFollowers);
                                this.ui.updateStats(this.state.nonFollowers, null);
                            }
                        }

                        totalChecked += edges.length;
                        this.ui.updateStatus(`${this.i18n.t('analyzing')} (${totalChecked})`);
                    }

                    this.ui.updateStatus(this.i18n.t('finished'));
                } catch (err) {
                    console.error(err);
                    this.ui.updateStatus(this.i18n.t('error') + ": " + err.message);
                } finally {
                    this.state.isRunning = false;
                    this.ui.setLoading(false);
                }
            }

            async handleUnfollow(id, btn) {
                btn.disabled = true;
                btn.classList.add('orbit-spinning');

                try {
                    await this.limiter.schedule(() => this.api.unfollow(id));
                    btn.classList.remove('orbit-spinning');
                    // Success state: Checkmark icon
                    btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                    btn.style.cursor = "default";
                    btn.title = this.i18n.t('unfollowed');
                } catch (err) {
                    btn.classList.remove('orbit-spinning');
                    btn.disabled = false;
                    console.error("Orbit: Unfollow failed", err);
                }
            }
        }

        // Expose globally and initialize
        window.OrbitApp = OrbitApp;
        window.orbitInstance = new OrbitApp();
        window.orbitInstance.init();
    } else {
        // OrbitApp already loaded, just toggle its visibility
        if (window.orbitInstance) {
            window.orbitInstance.toggle();
        }
    }
})();