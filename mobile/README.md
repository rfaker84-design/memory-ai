# 忆见移动产品壳

This directory is a Capacitor 7 mobile product shell for the existing Next.js product. It packages the 忆见启动、登录、创建 TA、陪伴聊天和记忆影像流程 locally; it is not a generic browser wrapper:

- `MemoryMediaPlugin` uses Android's system document picker / MediaStore and iOS `PHPicker` / `PHPhotoLibrary` for image-and-video selection and signed-video saving.
- system share, haptics, notifications and deep-link events use Capacitor native plugins;
- the shipped local page opens the 忆见 product experience and a restrained offline state;
- the packaged UI always loads from the APK, including when the device is offline;
- an optional HTTPS **non-production API base URL** is injected at build time and never changes the local startup URL.

Phone login and memory creation use the existing API contract when a non-production origin is injected. Chat and memory routes remain controlled-beta product capabilities; no production route, payment or store integration is added here.

The native capability lab is reachable only in a **Debug** build through `yijianmemory://debug/native`. It is compiled out of the Release web bundle. Push registration and account deletion remain unavailable until their authenticated server endpoints exist, and their controls are not rendered in Release.

## Secure staging connection

The secure session design is documented in
[`SECURE_SESSION_CONTRACT.md`](./SECURE_SESSION_CONTRACT.md). Create a local
environment file from `.env.staging.example`. A Debug build is pinned to the
packaged local WebView origin `https://app.staging.yijianmemory.cn` and accepts
only its same-site API sibling `https://api.staging.yijianmemory.cn`.

The API value is available only to packaged Debug UI adapters; it is never
assigned to Capacitor `server.url`. Release rejects both that value and the
Debug test-video value at bundle time, then uses the local HTTPS origin
`https://app.yijianmemory.cn` with no remote API configured.

The staging host must:

1. serve the existing Next.js app over HTTPS;
2. set `AUTH_ALLOWED_ORIGIN=https://app.staging.yijianmemory.cn`; API CORS must return that exact Origin plus credential support, never `*`;
3. use non-production SMS, PostgreSQL, COS and provider credentials;
4. never redirect to `yijianmemory.cn`.

`src/config/environment.ts` rejects HTTP, LAN/IP targets, mismatched siblings,
and any Release API injection. `capacitor.config.ts` has no `server.url` entry,
and `verify:config` rejects a generated Android remote URL or non-HTTPS Release
origin.

## Commands

Windows Android builds require JDK 21 and Android SDK Platform/Build Tools 35.
This worktree was validated with Temurin 21.0.11, Platform Tools 37.0.0,
Build Tools 35.0.0, Android Emulator 36.6.11 and an API 35 Google APIs image.

```powershell
cd mobile
npm install
npm run verify:config
npm run sync

# Build a debug APK with an approved same-site staging API. The optional video
# is debug-only evidence for the native save/share path.
$env:MOBILE_APP_ORIGIN_HOST = "app.staging.yijianmemory.cn"
$env:VITE_MOBILE_API_BASE_URL = "https://api.staging.yijianmemory.cn"
$env:VITE_MOBILE_TEST_VIDEO_URL = "https://example.invalid/debug-video.mp4"
npm run android:debug

# Install a built debug APK on a connected device/emulator
npm run android:install

# Build and audit an unsigned release APK without environment injection.
# Release fails closed if either Debug variable is still defined.
Remove-Item Env:VITE_MOBILE_API_BASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:VITE_MOBILE_TEST_VIDEO_URL -ErrorAction SilentlyContinue
Remove-Item Env:MOBILE_APP_ORIGIN_HOST -ErrorAction SilentlyContinue
npm run android:release-audit

# On a macOS machine with Xcode and CocoaPods
npm run ios:sync
npx cap open ios
```

Debug APK output: `android/app/build/outputs/apk/debug/app-debug.apk`.

Useful manual device checks:

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb shell am start -a android.intent.action.VIEW -d "yijianmemory://memory/example-id" cn.yijianmemory.mobile
```

## Native capability contracts

| Capability | Foundation behavior | Service-side condition |
| --- | --- | --- |
| Phone login | packaged client adapter boundary targets the injected non-production API origin | staging `AUTH_ALLOWED_ORIGIN` and trusted proxy configuration |
| Album selection | Native photo/video picker returns persisted local URIs | client upload adapter consumes existing authenticated `/api/media/upload` |
| Save video | native code streams only an HTTPS short-lived signed URL into MediaStore / Photos | existing authenticated `GET /api/media/:id` supplies the signed URL |
| System share | native share sheet | none |
| Push | no Release entry is rendered; the Debug capability lab remains fail-closed | new authenticated device-token registration endpoint is required; current `/api/notification/push` is unavailable |
| Deep link | `yijianmemory://…` opens a single-task app and emits `appUrlOpen` | HTTPS Universal/App Links wait for staging AASA / `assetlinks.json` |
| Account deletion | no Release entry is rendered; the Debug capability lab remains fail-closed | new audited, session-bound deletion workflow is required; clearing a local session is not deletion |
| IAP | explicit disabled native boundary, no store SDK and no payment path | separate approved commerce task and store product configuration |

## iOS conditions

The Xcode project is generated at `ios/App/App.xcworkspace` (after CocoaPods runs). This Windows environment has no `xcodebuild` or CocoaPods, so an iOS binary has not been built here. Before an iOS build:

1. use a macOS runner with current Xcode and CocoaPods;
2. run `npm run ios:sync`, then `pod install` in `ios/App` if needed;
3. configure an Apple team, a unique production bundle signing identity, APNs capability and push certificate/key;
4. add an `apple-app-site-association` file only when the staging/production HTTPS deep-link domain is approved;
5. test photo/video picker, saving, notification permission, custom deep link and phone login on a physical device.

## Current blockers deliberately left outside this worktree

- the checked-in example uses the reserved `.invalid` non-production host; a reachable staging origin has not been supplied;
- no current authenticated endpoint safely accepts push tokens or performs account deletion;
- no FCM `google-services.json`, APNs credentials or iOS signing material is available;
- no IAP product, store SDK or payment integration is included.
