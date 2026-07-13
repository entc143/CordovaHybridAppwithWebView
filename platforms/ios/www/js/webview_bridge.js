/**
 * webview_bridge.js
 * ---------------------------------------------------------------------------
 * WebView <-> Cordova bridge for CordovaHybridAppwithWebView.
 *
 * This is the Cordova equivalent of the React-Native WebView bridge referenced
 * in the task:
 *   https://github.com/Rashmi-9514/ExpoReact/blob/main/app/webview-bridge.js
 *
 * In React Native, <WebView onMessage={handleMessage}/> receives messages that
 * the web page sends with `window.ReactNativeWebView.postMessage(...)`, then
 * routes them to CleverTap (onUserLogin / profileSet / recordEvent).
 *
 * In Cordova we reproduce the same contract using cordova-plugin-inappbrowser:
 *   - The native side opens the Thank-You page in an InAppBrowser WebView.
 *   - The web page posts messages with:
 *         window.webkit.messageHandlers.cordova_iab.postMessage(JSON.stringify(msg))
 *     (the InAppBrowser injects this handler; it surfaces here as a 'message'
 *      event on the InAppBrowser reference — analogous to RN's onMessage).
 *   - handleMessage(...) parses the payload and calls the matching CleverTap
 *     Cordova method.
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

        ref: null,       // InAppBrowser reference for the open WebView
        _units: [],      // Native Display units passed from the home screen

        /** Optional attach hook (called on deviceready). */
        attach: function () {
            log('WebView bridge ready.');
        },

        /**
         * Opens the Thank-You page inside a WebView and wires up the message
         * bridge. `units` are the CleverTap Native Display units to render.
         */
        openThankYou: function (units) {
            this._units = units || [];

            if (!global.cordova || !global.cordova.InAppBrowser) {
                // Browser preview fallback.
                global.location.href = 'thankyou.html';
                return;
            }

            // hidden=no, location=no gives a clean full-screen WebView.
            var ref = global.cordova.InAppBrowser.open(
                'thankyou.html',
                '_blank',
                'location=no,hidden=no,beforeload=yes,footer=no,zoom=no'
            );
            this.ref = ref;

            var self = this;

            // When the page finishes loading, inject the Native Display units
            // so the page can render banners inside the WebView.
            ref.addEventListener('loadstop', function () {
                var payload = JSON.stringify(self._units).replace(/<\/script>/g, '<\\/script>');
                ref.executeScript({
                    code: 'window.__NATIVE_DISPLAY_UNITS__ = ' + payload + ';' +
                          'if (window.ThankYouPage) { window.ThankYouPage.render(); }'
                });
                log('Injected ' + self._units.length + ' display unit(s) into WebView.');
            });

            // Receive messages posted by the page (RN onMessage equivalent).
            ref.addEventListener('message', function (params) {
                self.handleMessage(params && params.data);
            });

            ref.addEventListener('exit', function () {
                self.ref = null;
                log('WebView closed.');
            });
        },

        /**
         * Routes a message from the WebView to the correct CleverTap method.
         * Mirrors handleMessage() in the RN reference bridge.
         */
        handleMessage: function (data) {
            log('RAW WEBVIEW DATA:', data);
            var message;
            try {
                message = (typeof data === 'string') ? JSON.parse(data) : data;
            } catch (err) {
                log('WebView bridge parse error:', err);
                return;
            }
            if (!message || !message.type) { return; }

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
                    log('Unhandled message type:', message.type);
            }
        }
    };

    global.WebViewBridge = WebViewBridge;

})(window);
