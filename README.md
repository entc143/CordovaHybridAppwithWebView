# CordovaHybridAppwithWebView

A hybrid **Apache Cordova** sample app that demonstrates a full **CleverTap** integration — Push Notifications, In-App messages, and App Native Display — on top of a simple, real UI:

- A **home screen** with a live clock + date and an **auto-incrementing counter**.
- **Button 1 — Stop Counter:** stops the counter and **creates a CleverTap user profile**.
- **Button 2 — Continue:** opens a **WebView "Thank You" page** that fires a `thankss you` event and renders **Native Display banners** with viewed/clicked tracking.

> Account ID: `R57-R8W-557Z` &nbsp;·&nbsp; Token: `0b2-a52`
> Credentials are set in `config.xml`, and mirrored in the Android manifest and iOS plist. The native plugin reads them at init — they are never hard-coded in JS.

All CleverTap method names in this project are taken directly from CleverTap's official Cordova documentation:

- Quick Start — https://developer.clevertap.com/docs/cordova-quick-start-guide
- Push — https://developer.clevertap.com/docs/cordova-push-notification
- Advanced (Native Display) — https://developer.clevertap.com/docs/cordova-advance-features#native-display

---

## App Structure

```
CordovaHybridAppwithWebView/
├── config.xml                        # Cordova config + CleverTap plugin vars + platform config-file edits
├── package.json                      # Cordova platforms & plugin manifest
├── README.md                         # This file
│
├── www/                              # Web layer (runs inside the Cordova WebView)
│   ├── index.html                    # Home screen markup
│   ├── thankyou.html                 # "Thank You" page (opened in an InAppBrowser WebView)
│   ├── css/
│   │   └── index.css                 # Home screen styles
│   └── js/
│       ├── index.js                  # Home screen controller (counter, clock, buttons, boot)
│       ├── clevertap-service.js      # All CleverTap SDK calls + listeners (push/in-app/native display)
│       └── webview_bridge.js         # WebView <-> Cordova message bridge (RN-style contract)
│
└── platform-config/                  # Reference native config (auto-applied via config.xml)
    ├── AndroidManifest.snippet.xml   # CleverTap Application class, FCM service, permissions, credentials
    └── Info.plist.snippet.xml        # CleverTap credentials, background modes, APNs entitlement
```

### How the pieces talk to each other

```
 index.html ──> index.js ──> clevertap-service.js ──> window.CleverTap (native plugin)
                    │
                    │ (Continue button)
                    ▼
              webview_bridge.js ──opens──> thankyou.html (InAppBrowser WebView)
                    ▲                             │
                    └────── postMessage ──────────┘
             (recordEvent 'thankss you', displayUnitViewed, displayUnitClicked)
```

---

## Prerequisites & Run Instructions

```bash
# 1) Install Cordova
npm install -g cordova

# 2) From inside the project folder, add platforms
cordova platform add android
cordova platform add ios

# 3) Add the CleverTap plugin WITH your credentials
cordova plugin add https://github.com/CleverTap/clevertap-cordova.git \
  --variable CLEVERTAP_ACCOUNT_ID="R57-R8W-557Z" \
  --variable CLEVERTAP_TOKEN="0b2-a52"

# 4) Add the InAppBrowser plugin (used as the Thank-You WebView)
cordova plugin add cordova-plugin-inappbrowser

# 5) (Android push) Put your Firebase google-services.json in platforms/android/app/
#    and add the Firebase/FCM gradle dependencies (see Quick Start guide).

# 6) Build & run
cordova run android
cordova run ios
```

> The app also loads in a plain browser (`cordova serve`) for UI preview. When the CleverTap plugin is absent, all SDK calls are safely skipped and the counter/clock/buttons still work.

---

## What Every Function Does

### `www/js/index.js` — Home screen controller (`App`)

| Function | What it does |
|---|---|
| `initialize()` | Registers the Cordova `deviceready` listener (and a `DOMContentLoaded` fallback for browser preview). |
| `onDeviceReady()` | Boots the app: initialises `CleverTapService`, attaches `WebViewBridge`, starts the clock and counter, binds the two buttons, and records a `Home Screen Viewed` event. |
| `startClock()` / `renderClock()` | Starts a 1-second interval and renders the current **date and time** into the UI. |
| `startCounter()` | Starts the **auto-incrementing counter** (increments every second) and sets the state label to `running`. |
| `stopCounter()` | Clears the counter interval and sets the state label to `stopped`. |
| `onStopClicked()` | **Button 1.** Stops the counter, then **creates a CleverTap user profile** (`onUserLogin`) and records a `Counter Stopped` event. Disables the button afterward. |
| `onContinueClicked()` | **Button 2.** Grabs the current Native Display units and asks `WebViewBridge` to open the **Thank-You WebView** (falls back to in-place navigation in a browser). |
| `setCounterState()` / `setStatus()` | Small UI helpers for the counter state label and the CleverTap status line. |

### `www/js/clevertap-service.js` — CleverTap wrapper (`CleverTapService`)

| Function | What it does |
|---|---|
| `init()` | Sets debug level, registers all SDK listeners, calls **`notifyDeviceReady()`**, creates the Android notification channel, calls **`registerPush()`**, shows the **Push Primer**, and loads **Native Display** units. Also starts the app-state tracker (foreground/background/killed) using Cordova `pause`/`resume`. |
| `_registerListeners()` | Registers all `document.addEventListener` hooks: `onPushNotification`, `onDeepLink`, `onCleverTapDisplayUnitsLoaded`, in-app dismissed/button-click, push-permission result, profile init. |
| `trackPushImpression(payload)` | Records a **`Push Impression`** event tagged with the app state (`foreground` / `background` / `killed`) whenever a push payload is received. |
| `promptPushPrimer()` | Shows a half-interstitial **Push Primer** in-app before the OS notification permission dialog. |
| `loadDisplayUnits()` | Calls **`getAllDisplayUnits()`** and broadcasts the units to the app via a `nativeDisplayReady` event. |
| `getDisplayUnits()` | Returns the most recently loaded Native Display units. |
| `pushDisplayUnitViewed(unitId)` | Fires the Native Display **VIEWED** event for a unit id. |
| `pushDisplayUnitClicked(unitId)` | Fires the Native Display **CLICKED** event for a unit id. |
| `createUserProfile(profile)` | Creates / logs in a user profile via **`onUserLogin`**. |
| `recordEvent(name, props)` | Records a custom event via **`recordEventWithName`**. |

### `www/js/webview_bridge.js` — WebView bridge (`WebViewBridge`)

Cordova equivalent of the referenced React-Native WebView bridge
(`ExpoReact/app/webview-bridge.js`). In RN, `<WebView onMessage>` receives
`window.ReactNativeWebView.postMessage(...)` and routes to CleverTap. Here we
use `cordova-plugin-inappbrowser`'s `message` event for the same contract.

| Function | What it does |
|---|---|
| `attach()` | Bridge-ready hook, called on `deviceready`. |
| `openThankYou(units)` | Opens `thankyou.html` in an InAppBrowser WebView, injects the Native Display `units` on `loadstop`, and subscribes to the WebView's `message` and `exit` events. |
| `handleMessage(data)` | Parses a message posted by the page and routes it to CleverTap: `onUserLogin` / `profileSet` → `createUserProfile`; `recordEvent` → `recordEvent`; `displayUnitViewed` → `pushDisplayUnitViewed`; `displayUnitClicked` → `pushDisplayUnitClicked`. |

### `www/thankyou.html` — Thank-You page (`ThankYouPage`)

| Function | What it does |
|---|---|
| `post(msg)` | Sends a JSON message back to native (InAppBrowser `cordova_iab` handler; RN/browser fallbacks). |
| `field(unit, keys)` / `unitId(unit)` | Defensive readers for Native Display unit content fields and the unit id. |
| `render()` | Renders each injected Native Display unit as a **banner**; fires `displayUnitViewed` as each renders and `displayUnitClicked` on tap. |
| `init()` | On page load, fires the **`thankss you`** event via the bridge, then renders banners. |

---

## CleverTap Methods Implemented (and their use)

| Method / Listener | Where | Use |
|---|---|---|
| `CleverTap.notifyDeviceReady()` | `clevertap-service.js` → `init()` | **Mandatory** first call; tells the native SDK the JS layer is ready. |
| `CleverTap.setDebugLevel(3)` | `init()` | Verbose SDK logging during integration/QA (set `0` or `-1` in production). |
| `CleverTap.createNotificationChannel(id, name, desc, importance, showBadge)` | `init()` | Creates the Android notification channel required for push (no-op on iOS). |
| `CleverTap.registerPush()` | `init()` | Registers for push (APNs on iOS; safe no-op on Android). |
| `CleverTap.promptPushPrimer(localInApp)` | `promptPushPrimer()` | Shows an in-app **Push Primer** before the OS notification-permission dialog. |
| `CleverTap.getAllDisplayUnits(cb)` | `loadDisplayUnits()` | Fetches all **App Native Display** units (banners) for the user. |
| `CleverTap.pushDisplayUnitViewedEventForID(unitId)` | `pushDisplayUnitViewed()` | Tracks Native Display **Notification Viewed** for a unit. |
| `CleverTap.pushDisplayUnitClickedEventForID(unitId)` | `pushDisplayUnitClicked()` | Tracks Native Display **Notification Clicked** for a unit. |
| `CleverTap.onUserLogin(profile)` | `createUserProfile()` | **Creates / logs in a user profile** — fired when the Stop button is clicked. |
| `CleverTap.recordEventWithName(name[, props])` | `recordEvent()` / `trackPushImpression()` | Records custom events: `Home Screen Viewed`, `Counter Stopped`, `Push Impression`, and `thankss you`. |
| **Listener** `onPushNotification` | `_registerListeners()` | Receives the push payload → records the **Push Impression** event. |
| **Listener** `onCleverTapDisplayUnitsLoaded` | `_registerListeners()` | Fires when Native Display units are loaded. |
| **Listener** `onCleverTapInAppNotificationDismissed` | `_registerListeners()` | **In-App** message dismissed callback. |
| **Listener** `onCleverTapInAppButtonClick` | `_registerListeners()` | **In-App** message custom button-click payload. |
| **Listener** `onCleverTapPushPermissionResponseReceived` | `_registerListeners()` | Push permission grant/deny result. |
| **Listener** `onDeepLink` | `_registerListeners()` | Deep link delivered (e.g. from a push open). |

---

## Feature Walk-through

### 1. Push Notifications — impression tracking in all app states

The native CleverTap SDK **automatically** raises its own `Notification Viewed`
and `Notification Clicked` system events for pushes it renders. On top of that,
this app records an explicit **`Push Impression`** custom event so you can see the
impression tagged with the app state at receipt time:

- **Foreground:** `onPushNotification` fires on arrival while the app is active → `State = foreground`.
- **Background:** the app was paused (Cordova `pause`); the payload surfaces on open/resume → `State = background`.
- **Killed (cold start):** the app was not running; the payload surfaces on the launch that follows → `State = killed`.

The state is derived from the Cordova app-lifecycle (`pause`/`resume`) plus a
cold-start window flag in `clevertap-service.js`. Android delivers pushes in all
three states through the `FcmMessageListenerService` declared in the manifest;
iOS requires the `remote-notification` background mode (set in the plist).

### 2. In-App messages

In-App campaigns are delivered and rendered by the native SDK automatically once
`notifyDeviceReady()` runs. This app wires the optional in-app callbacks
(`onCleverTapInAppNotificationDismissed`, `onCleverTapInAppButtonClick`) and also
uses an in-app **Push Primer** to request notification permission.

### 3. App Native Display (banners on the Thank-You page)

`getAllDisplayUnits()` loads the units in the Cordova app. When the user taps
**Continue**, those units are injected into the Thank-You WebView, which renders
them as banners. As each banner renders it posts `displayUnitViewed`, and on tap
it posts `displayUnitClicked`; the bridge forwards these to
`pushDisplayUnitViewedEventForID` / `pushDisplayUnitClickedEventForID`.

### 4. User profile on Stop + `thankss you` event

Clicking **Stop** calls `onUserLogin(...)` to create the profile. Landing on the
Thank-You page posts a `recordEvent` message that fires the **`thankss you`**
event back in the Cordova app.

---

## Notes & Assumptions

- **Native Display unit schema:** `thankyou.html` reads banner fields defensively
  across several possible key names (`title`/`titleText`, `message`/`messageText`,
  `icon`/`media`/`imageUrl`, `unitID`/`wzrk_id`) because the exact content keys
  depend on how each campaign is configured in the dashboard.
- **Android push (FCM)** requires a valid Firebase project: place `google-services.json`
  in `platforms/android/app/` and add the Firebase gradle dependencies from the
  Quick Start guide.
- **iOS push (APNs)** requires push capability + certificates configured in your
  Apple Developer account; update `aps-environment` to `production` for release.
- Credentials in this sample are the ones provided (`R57-R8W-557Z` / `0b2-a52`).
  Rotate/replace them for your own project.

## References

- CleverTap Cordova Quick Start — https://developer.clevertap.com/docs/cordova-quick-start-guide
- CleverTap Cordova Push — https://developer.clevertap.com/docs/cordova-push-notification
- CleverTap Cordova Advanced Features / Native Display — https://developer.clevertap.com/docs/cordova-advance-features#native-display
- WebView bridge reference (React Native) — https://github.com/Rashmi-9514/ExpoReact/blob/main/app/webview-bridge.js
