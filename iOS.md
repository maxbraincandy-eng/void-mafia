# Void Mafia — iOS App

The iOS app wraps **voidmafia.one** in a native WKWebView shell using [Capacitor](https://capacitorjs.com).  
The same React/Vite codebase powers Web, Android, and iOS — one update to voidmafia.one immediately reflects in all versions.

---

## Architecture

```
iPhone App (Capacitor shell)
  └─ WKWebView
       └─ loads https://voidmafia.one
            ├─ Socket.IO → wss://voidmafia.one
            └─ WebRTC P2P (mic + camera)
```

iOS's WKWebView has native WebRTC support. Permissions (camera, microphone) are declared in `Info.plist` and the system prompt appears automatically when the page calls `getUserMedia()`.

---

## Requirements (macOS only)

| Tool | Required version |
|------|-----------------|
| macOS | 13 Ventura+ |
| Xcode | 15+ |
| Apple Developer account | Free (run on device) or Paid (TestFlight/App Store) |
| Node.js | 18+ |
| CocoaPods | `sudo gem install cocoapods` |

> **iOS apps can only be built on macOS with Xcode. This step must be done on a Mac.**

---

## One-time setup

```bash
# Install Node dependencies
cd client
npm install

# Install CocoaPods dependencies for iOS
cd ios/App
pod install
cd ../..
```

---

## Open in Xcode

```bash
cd client
npm run ios:open
# Opens ios/App/App.xcworkspace in Xcode
```

> Always open `App.xcworkspace` (not `App.xcodeproj`) after running `pod install`.

---

## Run on iPhone Simulator

1. Open the project (`npm run ios:open`)
2. Select a simulator (e.g. iPhone 15 Pro) from the device picker
3. Press **⌘R** or click the Run button
4. The app loads voidmafia.one in the simulator

> Note: Microphone/camera don't work in the Simulator. Test voice/video on a real device.

---

## Run on a real iPhone

1. Connect your iPhone via USB
2. In Xcode: **Signing & Capabilities → Team** — select your Apple ID
3. Set Bundle Identifier to `one.voidmafia.app`
4. Select your device from the picker
5. Press **⌘R**

First run will ask you to trust the developer certificate on the iPhone:  
**Settings → General → VPN & Device Management → Trust**

---

## Sync after web changes

When the web app at voidmafia.one updates, no new build is needed — the app loads live.  
To sync Capacitor config/plugin changes:

```bash
cd client
npm run build      # rebuild Vite
npm run ios:sync   # sync into iOS project
npm run ios:open   # re-open Xcode if needed
```

---

## Available scripts

| Script | What it does |
|--------|-------------|
| `npm run ios:sync` | Sync web assets + Capacitor config into iOS |
| `npm run ios:open` | Open Xcode workspace |
| `npm run ios:run` | Run on connected device |
| `npm run cap:sync` | Sync both iOS and Android |

---

## Permissions configured

`Info.plist` contains the required iOS usage descriptions:

| Permission | Usage description |
|-----------|------------------|
| `NSMicrophoneUsageDescription` | Void Mafia uses your microphone for voice chat during games |
| `NSCameraUsageDescription` | Void Mafia uses your camera for optional video during games |
| `NSLocalNetworkUsageDescription` | Needed for WebRTC peer-to-peer connections |

iOS prompts the user for these permissions when `getUserMedia()` is first called (i.e. when the player taps **Join Voice** in a room).

---

## App Icon

The app icon (`Assets.xcassets/AppIcon.appiconset/`) contains all required sizes generated from the master Void Mafia icon:

| Size | Use |
|------|-----|
| 60×60 @2x, @3x | iPhone home screen |
| 40×40 @2x, @3x | Spotlight / Settings |
| 29×29 @2x, @3x | Settings |
| 1024×1024 | App Store |

To replace with new artwork, drop a 1024×1024 PNG into the set and regenerate sizes with [Asset Catalog Creator](https://apps.apple.com/app/asset-catalog-creator-pro/id809625456) or Xcode's built-in asset editor.

---

## TestFlight / App Store

To distribute via TestFlight:

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
2. Create an App ID `one.voidmafia.app` in App Store Connect
3. In Xcode: **Product → Archive**
4. Upload via **Organizer → Distribute App → TestFlight**

App Store submission additionally requires:
- Privacy policy URL
- App screenshots (6.7" iPhone, 12.9" iPad)
- App description and metadata

---

## WebRTC on iOS notes

- WKWebView supports WebRTC natively (iOS 14.3+)
- `getUserMedia()` triggers the system permission dialog on first call
- Remote audio plays automatically (no autoplay restriction for WebRTC audio)
- Camera toggle (add/remove track) triggers SDP renegotiation — this works correctly in WKWebView
- Min supported iOS: **14.3** (WebRTC in WKWebView)

---

## Troubleshooting

**"Untrusted Developer" on device**  
→ Settings → General → VPN & Device Management → Trust your certificate

**Camera/mic not working in Simulator**  
→ Use a real device. Simulator doesn't have a mic.

**WebRTC peer connection fails**  
→ Check that the device has network access. STUN/TURN from voidmafia.one is used for ICE.

**`pod install` fails**  
→ Run `sudo gem install cocoapods` then retry. If Ruby is outdated, use `rbenv`.

**Xcode shows "No account" signing error**  
→ Xcode → Preferences → Accounts → add your Apple ID
