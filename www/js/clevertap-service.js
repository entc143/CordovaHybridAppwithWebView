/**
 * clevertap-service.js
 * ---------------------------------------------------------------------------
 * Thin wrapper around the CleverTap Cordova plugin (`window.CleverTap`).
 *
 * All method names used here are taken directly from CleverTap's official
 * Cordova documentation:
 *   - Quick Start : https://developer.clevertap.com/docs/cordova-quick-start-guide
 *   - Push        : https://developer.clevertap.com/docs/cordova-push-notification
 *   - Advanced    : https://developer.clevertap.com/docs/cordova-advance-features
 *
 * Account ID : R57-R8W-557Z
 * Token      : 0b2-a52
 * (Credentials are configured in config.xml / AndroidManifest.xml / Info.plist;
 *  they are NOT passed here — the native plugin reads them at init.)
 * ---------------------------------------------------------------------------
 */
(function (global) {
    'use strict';

    // -----------------------------------------------------------------------
    // App lifecycle state tracker.
    // Used to tag the Push Impression event with the state the app was in when
    // the push payload arrived: 'foreground' | 'background' | 'killed'.
    // -----------------------------------------------------------------------
    var AppState = {
        current: 'killed',          // app starts from a killed (cold) state
        coldStartHandled: false     // flips true shortly after deviceready
    };

    function log() {
        try { console.log.apply(console, ['[CleverTapService]'].concat([].slice.call(arguments))); }
        catch (e) { /* no-op */ }
    }

    function ct() {
        // Guard so the app still runs in a plain browser (plugin absent).
        return global.CleverTap || null;
    }

    var CleverTapService = {

        /**
         * Registers CleverTap event listeners and initialises the SDK.
         * Must be called from the Cordova `deviceready` handler.
         */
        init: function () {
            var plugin = ct();
            if (!plugin) {
                log('CleverTap plugin not found (running outside device?).');
                return false;
            }

            // 1) Verbose logging during integration/QA. (0 in production, 3 = verbose)
            //    Ref: cordova-advance-features#debugging
            plugin.setDebugLevel(3);

            // 2) Register CleverTap SDK-level listeners BEFORE notifyDeviceReady
            //    so no early callbacks are missed.
            this._registerListeners();

            // 3) Tell the native SDK the JS layer is ready. MANDATORY first call.
            //    Ref: cordova-quick-start-guide (Step 3)
            plugin.notifyDeviceReady();

            // 4) Create an Android notification channel (no-op on iOS).
            //    Ref: cordova-push-notification#create-notification-channel
            plugin.createNotificationChannel(
                'CtCS',                       // channel id
                'CleverTap Cordova',          // channel name
                'General notifications',      // channel description
                5,                            // importance 1..5 (5 = highest)
                true                          // show badge
            );

            // 5) Register for push (iOS APNs registration; safe no-op on Android).
            //    Ref: cordova-push-notification#ios
            plugin.registerPush();

            // 6) Ask for notification permission via a Push Primer in-app.
            //    On Android 13+/iOS this shows the primer, then the OS dialog.
            //    Ref: cordova-push-notification#push-primer
            this.promptPushPrimer();

            // 7) Load Native Display units for this user (banners).
            //    Ref: cordova-advance-features#native-display
            this.loadDisplayUnits();

            // Mark cold-start window as passed after the first tick so that any
            // push payload arriving now is attributed to foreground, not killed.
            var self = this;
            setTimeout(function () {
                AppState.coldStartHandled = true;
                AppState.current = 'foreground';
            }, 1500);

            // Track Cordova app lifecycle to know foreground/background state.
            document.addEventListener('pause', function () {
                AppState.current = 'background';
                log('App paused -> background');
            }, false);
            document.addEventListener('resume', function () {
                AppState.current = 'foreground';
                log('App resumed -> foreground');
            }, false);

            log('CleverTap initialised.');
            return true;
        },

        // ===================================================================
        //  SDK EVENT LISTENERS
        //  Ref: cordova-quick-start-guide ("Integrate Javascript…")
        // ===================================================================
        _registerListeners: function () {
            var self = this;

            // ---- PUSH NOTIFICATION RECEIVED --------------------------------
            // Fires with the push payload. In foreground it fires on arrival;
            // for background/killed it fires when the notification is opened
            // or on the launch that follows. We use it to record a Push
            // Impression event tagged with the current app state.
            document.addEventListener('onPushNotification', function (e) {
                var payload = (e && e.notification) ? e.notification : {};
                log('onPushNotification', JSON.stringify(payload));
                self.trackPushImpression(payload);
            }, false);

            // ---- DEEP LINK -------------------------------------------------
            document.addEventListener('onDeepLink', function (e) {
                log('onDeepLink', e && e.deeplink);
            }, false);

            // ---- NATIVE DISPLAY UNITS LOADED -------------------------------
            // Ref: cordova-advance-features#native-display
            document.addEventListener('onCleverTapDisplayUnitsLoaded', function (e) {
                var units = (e && e.units) ? e.units : [];
                log('onCleverTapDisplayUnitsLoaded units=' + (units.length || 0));
                self._latestUnits = units;
                // Broadcast to any page (e.g. the Thank-You webview) waiting for banners.
                document.dispatchEvent(new CustomEvent('nativeDisplayReady', { detail: units }));
            }, false);

            // ---- IN-APP MESSAGE listeners ----------------------------------
            document.addEventListener('onCleverTapInAppNotificationDismissed', function (e) {
                log('InApp dismissed', e && JSON.stringify(e));
            }, false);
            document.addEventListener('onCleverTapInAppButtonClick', function (e) {
                log('InApp button click', e && JSON.stringify(e.customExtras));
            }, false);

            // ---- PUSH PERMISSION RESULT ------------------------------------
            // Ref: cordova-push-notification#available-callbacks-for-push-primer
            document.addEventListener('onCleverTapPushPermissionResponseReceived', function (e) {
                log('Push permission accepted =', e && e.accepted);
            }, false);

            // ---- PROFILE INIT ----------------------------------------------
            document.addEventListener('onCleverTapProfileDidInitialize', function () {
                log('Profile initialised');
            }, false);
        },

        // ===================================================================
        //  PUSH IMPRESSION TRACKING (foreground / background / killed)
        // ===================================================================
        /**
         * Records a "Push Impression" event whenever a push payload is received,
         * tagged with the app state at receipt time.
         *
         * Note: the native CleverTap SDK also AUTOMATICALLY raises its own
         * "Notification Viewed" system event for pushes it renders. This custom
         * event is an explicit, demo-friendly impression signal on top of that.
         */
        trackPushImpression: function (payload) {
            var plugin = ct();
            if (!plugin) { return; }

            var state = AppState.coldStartHandled ? AppState.current : 'killed';

            var props = {
                'State': state,                              // foreground | background | killed
                'Title': payload.nt || payload.title || '',
                'Message': payload.nm || payload.message || '',
                'wzrk_pid': payload.wzrk_pid || '',          // CleverTap push id (if present)
                'Received At': new Date().toISOString()
            };

            plugin.recordEventWithName('Push Impression', props);
            log('Recorded "Push Impression" in state=' + state);
        },

        // ===================================================================
        //  PUSH PRIMER / PERMISSION
        //  Ref: cordova-push-notification#push-primer
        // ===================================================================
        promptPushPrimer: function () {
            var plugin = ct();
            if (!plugin) { return; }

            var localInApp = {
                inAppType: 'half-interstitial',
                titleText: 'Stay in the loop',
                messageText: 'Enable notifications to get live updates from CordovaHybridAppwithWebView.',
                followDeviceOrientation: true,
                positiveBtnText: 'Allow',
                negativeBtnText: 'Not now',
                backgroundColor: '#FFFFFF',
                titleTextColor: '#0d1b2a',
                messageTextColor: '#333333',
                btnTextColor: '#FFFFFF',
                btnBackgroundColor: '#f72585',
                fallbackToSettings: true
            };
            plugin.promptPushPrimer(localInApp);
        },

        // ===================================================================
        //  NATIVE DISPLAY
        //  Ref: cordova-advance-features#native-display
        // ===================================================================
        loadDisplayUnits: function () {
            var plugin = ct();
            if (!plugin) { return; }
            plugin.getAllDisplayUnits(function (units) {
                log('getAllDisplayUnits ->', JSON.stringify(units));
                CleverTapService._latestUnits = units || [];
                document.dispatchEvent(new CustomEvent('nativeDisplayReady', {
                    detail: CleverTapService._latestUnits
                }));
            });
        },

        /** Returns the most recently loaded Native Display units. */
        getDisplayUnits: function () {
            return this._latestUnits || [];
        },

        /** Notification VIEWED event for a Native Display unit id. */
        pushDisplayUnitViewed: function (unitId) {
            var plugin = ct();
            if (plugin && unitId) {
                plugin.pushDisplayUnitViewedEventForID(unitId);
                log('Native Display VIEWED ->', unitId);
            }
        },

        /** Notification CLICKED event for a Native Display unit id. */
        pushDisplayUnitClicked: function (unitId) {
            var plugin = ct();
            if (plugin && unitId) {
                plugin.pushDisplayUnitClickedEventForID(unitId);
                log('Native Display CLICKED ->', unitId);
            }
        },

        // ===================================================================
        //  USER PROFILE + EVENTS
        //  Ref: cordova-quick-start-guide ("Track User Profiles"/"…Events")
        // ===================================================================
        /** Creates / logs in a user profile (onUserLogin). */
        createUserProfile: function (profile) {
            var plugin = ct();
            if (plugin && profile) {
                plugin.onUserLogin(profile);
                log('onUserLogin ->', JSON.stringify(profile));
            }
        },

        /** Records a custom event, with optional properties. */
        recordEvent: function (name, props) {
            var plugin = ct();
            if (!plugin || !name) { return; }
            if (props) { plugin.recordEventWithName(name, props); }
            else { plugin.recordEventWithName(name); }
            log('recordEventWithName ->', name, props ? JSON.stringify(props) : '');
        }
    };

    CleverTapService._latestUnits = [];
    global.CleverTapService = CleverTapService;

})(window);
