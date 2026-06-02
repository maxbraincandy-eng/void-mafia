# Void Mafia — Android APK

The Android app wraps the live **voidmafia.one** web app inside a native Android WebView shell using [Capacitor](https://capacitorjs.com).  
No re-bundling of assets is needed — the APK loads `https://voidmafia.one` directly, so every web update is immediately available in the app without a new APK release.

---

## Architecture

```
Android APK (Capacitor shell)
  └─ Android WebView
       └─ loads https://voidmafia.one
            ├─ Socket.IO → wss://voidmafia.one
            └─ WebRTC P2P (mic + camera)
```

The `MainActivity.java` grants WebRTC `getUserMedia` requests from the WebView and requests the Android runtime permissions (RECORD_AUDIO, CAMERA) on first launch.

---

## Prerequisites (local build machine)

| Tool | Required version |
|------|-----------------|
| Android Studio | Hedgehog 2023.1.1+ |
| Android SDK | API 36 (compileSdk) |
| Min Android version | API 24 (Android 7.0) |
| Java | 17 or 21 |
| Node.js | 18+ |

---

## One-time setup

```bash
# 1. Install dependencies (already done if running from the repo)
cd client
npm install

# 2. Add Android platform (only needed once — already committed to the repo)
npx cap add android

# 3. (Optional) Rebuild the web client and sync
npm run build
npm run android:sync
```

---

## Building the APK

### Option A — Android Studio (recommended)

```bash
cd client
npm run android:open     # opens Android Studio
```

In Android Studio:
1. Wait for Gradle sync to finish
2. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. APK is at: `android/app/build/outputs/apk/debug/app-debug.apk`

### Option B — Command line (requires Android SDK in PATH)

```bash
cd client
npm run android:apk
# Runs: build → cap sync → gradlew assembleDebug
```

APK output:
```
client/android/app/build/outputs/apk/debug/app-debug.apk
```

### Available scripts

| Script | What it does |
|--------|-------------|
| `npm run android:sync` | Sync web assets + Capacitor config into Android |
| `npm run android:open` | Open Android Studio |
| `npm run android:run` | Run on connected device/emulator |
| `npm run android:build-debug` | Build debug APK via Gradle |
| `npm run android:build-release` | Build release APK via Gradle |
| `npm run android:apk` | Full pipeline: build → sync → debug APK |

---

## Release APK (signed)

To publish to Google Play, you need a signed release APK:

1. In Android Studio: **Build → Generate Signed Bundle / APK**
2. Create or use an existing keystore
3. Build the release variant
4. Output: `android/app/build/outputs/apk/release/app-release.apk`

---

## Permissions

The following Android permissions are declared in `AndroidManifest.xml`:

| Permission | Purpose |
|-----------|---------|
| `INTERNET` | Connect to voidmafia.one |
| `ACCESS_NETWORK_STATE` | Detect connection type for WebRTC ICE |
| `RECORD_AUDIO` | Microphone for voice chat |
| `MODIFY_AUDIO_SETTINGS` | Speaker/earpiece routing |
| `CAMERA` | Camera for video |
| `BLUETOOTH` / `BLUETOOTH_CONNECT` | Bluetooth headset support |

On first launch the app requests RECORD_AUDIO and CAMERA runtime permissions via the Android system dialog.

---

## WebRTC notes

- `getUserMedia` works in the Capacitor WebView because:
  1. `MainActivity.java` overrides `onPermissionRequest` to forward grants to the WebView
  2. Android runtime permissions are requested on app start
  3. `setMediaPlaybackRequiresUserGesture(false)` allows remote audio to autoplay
- The page is served over HTTPS (`voidmafia.one`), which satisfies the browser security requirement for WebRTC

---

## App icon

Placeholder icon: dark `#060314` background with a neon-cyan V-chevron foreground.

To replace with final assets:
- `android/app/src/main/res/mipmap-*/ic_launcher.png` — standard icon
- `android/app/src/main/res/mipmap-*/ic_launcher_round.png` — circular icon
- `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` — adaptive icon foreground
- `android/app/src/main/res/values/ic_launcher_background.xml` — background color

Recommended: use [Android Asset Studio](https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html) to generate all densities from a single SVG.

---

## Updating the Android app

Since the APK loads `https://voidmafia.one` live, **web-only changes require no new APK**.

A new APK is only needed when:
- Changing `AndroidManifest.xml` (permissions, intents)
- Changing `capacitor.config.ts` (server URL, plugins)
- Updating Capacitor or Android-specific native code

To sync any Capacitor config change:
```bash
cd client
npm run android:sync
# then rebuild APK
```

---

## Known limitations

- Requires internet — the APK loads the live site, so offline play is not supported
- WebRTC on Android depends on the device's WebView version (Chromium 90+, Android 7.0+)
- Push notifications are not configured (no `google-services.json`)
- `webContentsDebuggingEnabled: false` — set to `true` temporarily if debugging WebView issues via `chrome://inspect`
