# Your personal edition: Vincent's guide

This is for you, not for the public. It covers your own copy of Reveille, where everything lives, and the routine for publishing updates. Every step can be done by copying and pasting commands, or by asking Claude Code to do it for you.

---

## The two editions at a glance

| | **Your edition** | **Public edition** |
|---|---|---|
| App name on your phone | **Reveille VK** | **Reveille** |
| Shows | "Vincent's edition" in the corner | "Made by Vincent Kovar" in Settings |
| Android app ID | `com.vincentkovar.reveille.vk` | `com.vincentkovar.reveille` |
| File | `release/Reveille-VK-2.0.0-personal.apk` | `release/Reveille-2.0.0.apk` |
| Published? | **No.** Stays on your Mac and phone. | Yes: GitHub Releases, then your website |

They're built from the same code, so any improvement lands in both. Because the app IDs differ, you can install both on one phone to see exactly what your users see.

Neither edition contains an API key. Each person pastes their own, and it stays on their phone.

---

## Put your edition on your phone (first time)

Pick whichever is easiest:

### Option A: Google Drive (no cables)
1. On your Mac, open Finder → `Projects/Poetry Alarm/release/`.
2. Drag `Reveille-VK-2.0.0-personal.apk` into Google Drive in your browser.
3. On your phone, open the **Drive** app, tap the file, and tap **Install**. Allow installs from Drive when asked (see [INSTALL-ANDROID.md](INSTALL-ANDROID.md), step 2).
4. Afterwards, delete it from Drive if you like. It's just your copy.

### Option B: Email it to yourself
Attach the `.apk` to an email to yourself, open it on the phone, and tap the attachment.

### Option C: USB cable
1. On the phone: Settings → About phone → tap **Build number** 7 times (this enables Developer options), then Settings → System → Developer options → turn on **USB debugging**.
2. Connect the cable, accept the "Allow USB debugging?" prompt on the phone, then run this on your Mac:
```bash
~/Library/Android/sdk/platform-tools/adb install -r "release/Reveille-VK-2.0.0-personal.apk"
```

Then follow the setup guide in the app (paste your Gemini key, set alarms, allow permissions).

---

## Where the important things live

| What | Where | Notes |
|---|---|---|
| The code | `~/Projects/Poetry Alarm/` | Also on GitHub once published |
| **App signing key** | `~/.reveille-signing/` | ⚠️ **Back this up.** See below. |
| Java (for building) | `~/Developer/jdk-21…` | Installed for this project |
| Android SDK (for building) | `~/Library/Android/sdk/` | Installed for this project |
| Built apps | `release/` | Not uploaded to GitHub (ignored) |

### ⚠️ Back up the signing key

`~/.reveille-signing/` holds the key that proves updates come from you. Android will only install an update over an existing Reveille if it's signed with **the same key**. If you lose it, everyone (including you) has to uninstall and reinstall to get updates, which erases their journals.

**Do this once:** copy the whole `~/.reveille-signing` folder to a USB stick, or to a password manager as an attachment (the folder is hidden; in Finder press **Cmd+Shift+.** to see hidden folders). **Never** put it in the GitHub repo. The project is set up so it can't be committed by accident.

---

## Changing things yourself

Settings you might want to edit are all in one file: **`www/js/config.js`**.

- `AUTHOR_URL`: set this to your website once it exists, and the "Made by Vincent Kovar" credit becomes a link.
- `SUPPORT_LINK`: a Buy Me a Coffee (or similar) link. Leave it empty to hide the button. It never shows in your own edition.
- `VOICES`: which Gemini voices appear in Settings.
- `FAILSAFE_START_SECONDS`, `FAILSAFE_AFTER_POEM_SECONDS`, `VOLUME_RAMP_SECONDS`: fail-safe timing.
- `GEMINI_TEXT_MODEL`, `GEMINI_TTS_MODEL`: if Google retires a model and poems or the voice stop working, the fix is usually changing these names. Current names are listed at [ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models).

The built-in poems are in **`www/js/poems.js`**. Copy an entry and change it to add your favorites (public-domain poems only in the public edition).

To try changes in a browser before building:
```bash
npm run dev
```
Then open http://localhost:8125.

---

## Releasing a new version (the routine)

Easiest: open Claude Code in this folder and say *"release version 2.0.1 of Reveille"*. It'll do the steps below. To do it by hand:

1. **Bump the version** in two places (use the same number):
   - `package.json` → `"version": "2.0.1"`
   - `android/app/build.gradle` → `versionName "2.0.1"` and add 1 to `versionCode` (e.g. `2` → `3`)
   - `www/sw.js` → `CACHE_NAME = "reveille-v2.0.1"` (makes iPhones pick up the update promptly)
2. **Run the tests and build both editions:**
```bash
npm test
```
```bash
JAVA_HOME=$(ls -d ~/Developer/jdk-21*/Contents/Home) ANDROID_HOME=~/Library/Android/sdk npm run build:android
```
   This produces both signed APKs in `release/`, plus `Reveille.apk` (the public edition with no version number in its name, for the permanent download link).
3. **Install your edition** on your phone (any option above) and try a test wake-up.
4. **Commit and publish** the public edition:
```bash
git add -A && git commit -m "Reveille 2.0.1" && git push
```
```bash
gh release create v2.0.1 release/Reveille.apk "release/Reveille-2.0.1.apk" --title "Reveille 2.0.1" --notes "What changed…"
```
   Pushing also updates the iPhone web version automatically (via GitHub Pages, in a minute or two).
5. **Your website** needs no change if its Android button uses the permanent link (the download page is set up this way):
   `https://github.com/VincentKovar/reveille/releases/latest/download/Reveille.apk`

---

## Your website (when it's ready)

`website/index.html` is a ready-made, self-contained download page in Reveille's style. It has buttons for Android and iPhone, and step-by-step install instructions.

1. Open it in a text editor. At the top there's a short **"EDIT THESE"** block with the Android download link and the iPhone web-app link. Put in your real links.
2. Upload `index.html` to your site (e.g. as `yoursite.com/reveille/`).
3. Set `AUTHOR_URL` in `www/js/config.js` to your site and release a new version, so the in-app credit links back to you.

**Where should the APK download come from?** Either:
- **GitHub Releases** (simplest, and the default). The permanent link `https://github.com/VincentKovar/reveille/releases/latest/download/Reveille.apk` always gives the newest version. There's nothing to re-upload on your site.
- **Your own site.** Upload the `.apk` next to the page and link to it. Some web hosts need `.apk` files served as `application/vnd.android.package-archive`; if phones download it as a `.zip` or text file, that setting is the fix.

---

## If something's broken

- **Alarm didn't ring on your phone:** see "If an alarm didn't ring" in [INSTALL-ANDROID.md](INSTALL-ANDROID.md).
- **The build fails:** open Claude Code in this folder and paste the error. The toolchain paths are listed in the table above.
- **Poems or the voice stopped working:** it's almost always a retired Gemini model. Update the model names in `config.js` (see above).
