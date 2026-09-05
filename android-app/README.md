# Rent A Room — Android app

This is a native Android app built with [Capacitor](https://capacitorjs.com/): a real installable `.apk`
containing your existing website's frontend (`www/`, copied from `public/index.html` and `public/admin.html`),
running inside a WebView with native app chrome (its own icon, splash screen, no browser address bar).

It is **not** a rewrite — it's the same HTML/CSS/JS you already have, packaged as a native app shell that
talks to your existing backend API over the network.

## 1. Before building anything: set your backend URL

Open `www/config.js` and replace the placeholder:

```js
window.API_BASE_URL = 'https://REPLACE_WITH_YOUR_DEPLOYED_BACKEND_URL';
```

The app has no backend of its own. Every API call in the app is relative on the website (same server serves
both), but the Android app has no "same server" to be relative to — so this one file tells it where the real
API lives. It must be your backend's actual public HTTPS URL (Railway, Render, a VPS with a domain, etc.) —
not `localhost`, which only exists on the machine running it.

## 2. Why this can't be built in a sandboxed/offline environment

Building an Android app downloads the Android Gradle Plugin and Android SDK components live from
`dl.google.com` and Maven Central during the build — there's no way around that; it's how the Android
toolchain works. If you try to build this in a network-restricted environment (a CI runner with a strict
egress allowlist, an offline machine, etc.), the build will fail with `403 Forbidden` / `could not resolve`
errors on those hosts. Confirmed by actually attempting it while building this project.

Two real ways to build it:

### Option A — GitHub Actions (recommended, no local setup)

`.github/workflows/android-build.yml` (at the repo root, one level up from this folder) builds the app
automatically on GitHub's own runners, which have normal internet access. Push this repo to GitHub, then
either push to `main` or trigger it manually from the Actions tab ("Run workflow"). When it finishes, download
the `rent-a-room-debug-apk` artifact from the run's summary page — that's your installable `.apk`.

This produces a **debug** build: installable on any Android phone with "install from unknown sources"
allowed, or shareable with testers directly. It is NOT signed for the Play Store (see Option C below for that).

### Option B — Android Studio, locally

1. Install [Android Studio](https://developer.android.com/studio) (it bundles the Android SDK and downloads
   what it needs automatically).
2. Open the `android-app/android` folder as a project.
3. Let Gradle sync (first sync downloads dependencies — needs internet).
4. Run ▶ on a connected device or emulator, or **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

### Option C — Publishing to the Play Store

The debug build from A/B is for testing only. A Play Store listing needs a **signed release build**:

1. In Android Studio: **Build → Generate Signed Bundle / APK**, create a new keystore (keep it safe — losing
   it means you can never update the app again under the same listing), and build an `.aab` (Android App
   Bundle, what the Play Store wants, not a raw `.apk`).
2. Create a [Google Play Console](https://play.google.com/console) account (one-time $25 registration fee,
   Google's, not mine) and create a new app listing there.
3. Upload the `.aab`, fill in the store listing (screenshots, description, privacy policy URL — required),
   and submit for review.

I can walk through the Play Console listing itself once you have an account, but I can't create a Google
developer account or pay its fee on your behalf.

## App icon & branding

This project currently uses Capacitor's default placeholder icon. Before publishing, replace it with your
actual "R" logo (visible in your app's own header) using Android Studio's **Image Asset Studio**
(right-click `app/src/main/res` → New → Image Asset), which generates all the required icon sizes for you
from one source image.

## Project layout

- `www/` — the app's frontend. This is a **copy** of `../public/index.html`, `../public/admin.html`,
  `../public/css`, `../public/js`, plus `config.js` (see step 1). Edits to the website's `public/` folder do
  not automatically appear here — re-copy the files and run `npx cap sync android` to pick up changes.
- `android/` — the generated native Android project (opened directly in Android Studio, or built by CI).
- `capacitor.config.json` — app ID (`za.co.rentaroom.soweto`), app name, and native settings.
