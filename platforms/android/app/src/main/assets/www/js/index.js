/**
 * index.js  — Home screen controller for CordovaHybridAppwithWebView
 * ---------------------------------------------------------------------------
 * Responsibilities:
 *   - Boot the app on Cordova `deviceready` and initialise CleverTap.
 *   - Drive the live clock/date and the auto-incrementing counter.
 *   - Button 1 (Stop): stop the counter + create a CleverTap user profile.
 *   - Button 2 (Continue): open the Thank-You page inside a WebView
 *     (InAppBrowser) and hand it off to the webview bridge.
 * ---------------------------------------------------------------------------
 */
var App = {

    // ---- runtime state ----
    counter: 0,
    counterTimer: null,
    clockTimer: null,
    counterRunning: false,

    /** Wire up Cordova + DOM listeners. */
    initialize: function () {
        document.addEventListener('deviceready', this.onDeviceReady.bind(this), false);
        // In a plain browser (no Cordova), still boot the UI for previewing.
        if (!window.cordova) {
            document.addEventListener('DOMContentLoaded', this.onDeviceReady.bind(this), false);
        }
    },

    /** Called once the Cordova platform (and plugins) are ready. */
    onDeviceReady: function () {
        // 1) Bring CleverTap online (push, in-app, native display, listeners).
        if (window.CleverTapService) {
            var ok = window.CleverTapService.init();
            this.setStatus(ok ? 'CleverTap: ready (R57-R8W-557Z)' : 'CleverTap: plugin not found');
        }

        // 2) Initialise the webview bridge module (safe if plugin missing).
        if (window.WebViewBridge) {
            window.WebViewBridge.attach();
        }

        // 3) Start UI: clock + counter.
        this.startClock();
        this.startCounter();

        // 4) Bind buttons.
        document.getElementById('btn-stop').addEventListener('click', this.onStopClicked.bind(this));
        document.getElementById('btn-thankyou').addEventListener('click', this.onContinueClicked.bind(this));

        // 5) Record a screen-view event for the home screen.
        if (window.CleverTapService) {
            window.CleverTapService.recordEvent('Home Screen Viewed', { 'Source': 'app_launch' });
        }
    },

    // =======================================================================
    //  LIVE CLOCK + DATE
    // =======================================================================
    startClock: function () {
        var self = this;
        this.renderClock();
        this.clockTimer = setInterval(function () { self.renderClock(); }, 1000);
    },

    /** Renders the current date and time into the UI every second. */
    renderClock: function () {
        var now = new Date();
        var dateOpts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('live-date').textContent =
            now.toLocaleDateString(undefined, dateOpts);
        document.getElementById('live-time').textContent =
            now.toLocaleTimeString(undefined, { hour12: false });
    },

    // =======================================================================
    //  AUTO-INCREMENTING COUNTER
    // =======================================================================
    startCounter: function () {
        var self = this;
        this.counterRunning = true;
        this.setCounterState('running', false);
        // Increment every second.
        this.counterTimer = setInterval(function () {
            self.counter += 1;
            document.getElementById('counter').textContent = self.counter;
        }, 1000);
    },

    /** Stops the counter interval. */
    stopCounter: function () {
        if (this.counterTimer) {
            clearInterval(this.counterTimer);
            this.counterTimer = null;
        }
        this.counterRunning = false;
        this.setCounterState('stopped', true);
    },

    // =======================================================================
    //  BUTTON 1 — STOP  → create a CleverTap user profile
    // =======================================================================
    onStopClicked: function () {
        if (!this.counterRunning) { return; }

        this.stopCounter();

        // Create/log in the user profile at the moment the counter stops.
        // Uses CleverTap onUserLogin (Ref: cordova-quick-start-guide).
        var profile = {
            'Name': 'Cordova Sample User',
            'Identity': 'cordova_' + Date.now(),
            'Email': 'sachin.gajbhiye@clevertap.com',
            'Phone': '+14155551234',
            'Counter Stopped At': this.counter,
            'Stopped On': new Date().toISOString(),
            'MSG-push': true,
            'MSG-email': true
        };
        if (window.CleverTapService) {
            window.CleverTapService.createUserProfile(profile);
            window.CleverTapService.recordEvent('Counter Stopped', { 'Value': this.counter });
        }

        // Disable the stop button so it can't fire twice.
        var btn = document.getElementById('btn-stop');
        btn.disabled = true;
        btn.textContent = 'Counter Stopped';
    },

    // =======================================================================
    //  BUTTON 2 — CONTINUE  → open the Thank-You page in a WebView
    // =======================================================================
    onContinueClicked: function () {
        if (window.WebViewBridge) {
            // Pass the currently-loaded Native Display units so the Thank-You
            // page can render them as banners inside the WebView.
            var units = window.CleverTapService ? window.CleverTapService.getDisplayUnits() : [];
            window.WebViewBridge.openThankYou(units);
        } else {
            // Fallback (browser preview): navigate in place.
            window.location.href = 'thankyou.html';
        }
    },

    // =======================================================================
    //  small UI helpers
    // =======================================================================
    setCounterState: function (text, stopped) {
        var el = document.getElementById('counter-state');
        el.textContent = text;
        el.classList.toggle('stopped', !!stopped);
    },

    setStatus: function (text) {
        var el = document.getElementById('ct-status');
        if (el) { el.textContent = text; }
    }
};

App.initialize();
