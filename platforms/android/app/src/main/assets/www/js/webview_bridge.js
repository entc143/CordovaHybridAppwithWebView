/**
 * webview_bridge.js
 * ---------------------------------------------------------------------------
 * WebView <-> Cordova bridge for CordovaHybridAppwithWebView.
 *
 * This is the Cordova equivalent of the React-Native WebView bridge referenced
 * in the task:
 *   https://github.com/Rashmi-9514/ExpoReact/blob/main/app/webview-bridge.js
 *
 * In React Native, <WebView onMessage={handleMessage}/> is embedded in the
 * screen and receives messages the page sends with
 * `window.ReactNativeWebView.postMessage(...)`, then routes them to CleverTap.
 *
 * Here the Thank-You page loads in an EMBEDDED <iframe> inside the main app
 * screen (not a separate window). The contract is the same, using the browser
 * postMessage channel:
 *   - The iframe page posts messages with `window.parent.postMessage(json, '*')`.
 *   - This bridge listens on `window` 'message' events (RN onMessage equivalent)
 *     and routes each payload to the matching CleverTap Cordova method.
 *   - The app pushes the Native Display units INTO the iframe with
 *     `iframe.contentWindow.postMessage(...)`.
 *
 * Supported message types (same names as the RN reference, plus native-display):
 *   { type: 'recordEvent', eventName, data }      -> recordEventWithName
 *   { type: 'onUserLogin', data }                 -> onUserLogin
 *   { type: 'profileSet',  data }                 -> onUserLogin (profile push)
 *   { type: 'displayUnitViewed',  unitId }        -> pushDisplayUnitViewedEventForID
 *   { type: 'displayUnitClicked', unitId }        -> pushDisplayUnitClickedEventForID
 * ---------------------------------------------------------------------------
 */
(function (global) {
    'use strict';

    function log() {
        try { console.log.apply(console, ['[WebViewBridge]'].concat([].slice.call(arguments))); }
        catch (e) { /* no-op */ }
    }

    var CT = function () { return global.CleverTapService; };

    var WebViewBridge = {

        _units: [],          // Native Display units passed from the home screen
        _listening: false,

        /**
         * Registers the single window 'message' listener (RN onMessage
         * equivalent). Called once on deviceready.
         */
        attach: function () {
            if (this._listening) { return; }
            var self = this;
            global.addEventListener('message', function (event) {
                // Messages posted by the embedded Thank-You iframe.
                self.handleMessage(event && event.data);
            }, false);
            this._listening = true;

            // Native Display units load ASYNCHRONOUSLY (after a server round-trip).
            // When they arrive, CleverTapService fires 'nativeDisplayReady'. If the
            // Thank-You WebView is already open, re-push the fresh units into it so
            // the banners render even if they weren't ready when the page opened.
            document.addEventListener('nativeDisplayReady', function (e) {
                self._units = (e && e.detail) ? e.detail : [];
                self.pushUnitsToFrame();
            }, false);

            // Wire the Back button to close the embedded WebView.
            var back = document.getElementById('webview-back');
            if (back) { back.addEventListener('click', function () { self.close(); }); }

            log('WebView bridge ready.');
        },

        /** Pushes the current Native Display units into the open iframe (if any). */
        pushUnitsToFrame: function () {
            var overlay = document.getElementById('webview-overlay');
            var frame = document.getElementById('thankyou-frame');
            if (!overlay || overlay.classList.contains('hidden') ||
                !frame || !frame.contentWindow) {
                return;
            }
            try {
                frame.contentWindow.postMessage(JSON.stringify({
                    type: 'nativeDisplayUnits',
                    units: this._units
                }), '*');
                log('Pushed ' + this._units.length + ' display unit(s) to open WebView.');
            } catch (e) {
                log('Failed to push units into iframe:', e);
            }
        },

        /**
         * Loads the Thank-You page into the embedded <iframe> and shows it.
         * `units` are the CleverTap Native Display units to render as banners.
         */
        openThankYou: function (units) {
            var svc = CT();
            // Prefer the freshest units the SDK currently holds; fall back to
            // whatever was passed in.
            var latest = (svc && svc.getDisplayUnits) ? svc.getDisplayUnits() : [];
            this._units = (latest && latest.length) ? latest : (units || []);

            var overlay = document.getElementById('webview-overlay');
            var frame = document.getElementById('thankyou-frame');

            if (!overlay || !frame) {
                // Fallback (no iframe host, e.g. very old runtime): navigate in place.
                global.location.href = 'thankyou.html';
                return;
            }

            var self = this;

            // When the iframe page has loaded, push the current units in.
            frame.onload = function () {
                self.pushUnitsToFrame();
                log('Loaded Thank-You iframe; pushed ' + self._units.length + ' display unit(s).');
            };

            overlay.classList.remove('hidden');
            frame.src = 'thankyou.html';

            // Units may not be loaded yet (they arrive via a server round-trip).
            // Trigger a refresh; when they arrive, 'nativeDisplayReady' fires and
            // pushUnitsToFrame() re-pushes them into this open WebView.
            if (svc && svc.loadDisplayUnits) { svc.loadDisplayUnits(); }
        },

        /** Hides the embedded WebView and returns to the home screen. */
        close: function () {
            var overlay = document.getElementById('webview-overlay');
            var frame = document.getElementById('thankyou-frame');
            if (overlay) { overlay.classList.add('hidden'); }
            if (frame) { frame.src = 'about:blank'; }
            log('Embedded WebView closed.');
        },

        /**
         * Routes a message from the WebView to the correct CleverTap method.
         * Mirrors handleMessage() in the RN reference bridge.
         */
        handleMessage: function (data) {
            var message;
            try {
                message = (typeof data === 'string') ? JSON.parse(data) : data;
            } catch (err) {
                // Not our JSON message (could be other window chatter) — ignore quietly.
                return;
            }
            if (!message || !message.type) { return; }

            log('RAW WEBVIEW DATA:', JSON.stringify(message));
            var svc = CT();
            switch (message.type) {

                case 'onUserLogin':
                    if (svc) { svc.createUserProfile(message.data); }
                    break;

                case 'profileSet':
                    // No dedicated profileSet in the Cordova plugin; onUserLogin
                    // both creates and updates the active profile.
                    if (svc) { svc.createUserProfile(message.data); }
                    break;

                case 'recordEvent':
                    if (svc) { svc.recordEvent(message.eventName, message.data); }
                    break;

                case 'displayUnitViewed':
                    if (svc) { svc.pushDisplayUnitViewed(message.unitId); }
                    break;

                case 'displayUnitClicked':
                    if (svc) { svc.pushDisplayUnitClicked(message.unitId); }
                    break;

                default:
                    // e.g. 'nativeDisplayUnits' echoes are handled inside the iframe.
                    break;
            }
        }
    };

    global.WebViewBridge = WebViewBridge;

})(window);
