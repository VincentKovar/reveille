# Reveille — Poem Alarm Clock

A creative morning alarm that wakes you by reading a poem aloud instead of blaring a
tone — narrative or surprising public-domain poetry, with a fresh one fetched daily
via Google's Gemini API so you don't hear the same poem on repeat.

This is a **portfolio project**: a static, no-backend, no-build-step web app meant
to be forked, run locally, or hosted for free on GitHub Pages. It is not distributed
through an app store and is not a commercial product.

**[Live demo →](#)** _(add your GitHub Pages URL here once deployed)_

## What it does

- Set a wake-up time; when it hits, the app reads a poem aloud with Gemini's
  text-to-speech, using a voice/persona you choose in Settings.
- Poems are sourced from a small curated public-domain library, plus a poem
  auto-fetched from Gemini once a day so it stays fresh — a local history log
  makes sure you don't hear the same poem again for 30 days.
- A "Vault" tab to browse/preview all poems, and a "Journal" tab to jot down
  whatever image or thought the morning's poem left behind.
- Installable to your phone's home screen (PWA) for a full-screen, app-like feel.

## Before you start: a real limitation, stated honestly

This is a **static web app with no backend or native code** — so it cannot
guarantee firing while your phone is locked or the browser/app is fully
backgrounded. Android (and especially iOS) will throttle or suspend JavaScript
timers in an inactive tab. There is no way around this without either a native
app (App Store distribution) or a backend push-notification server, both of
which are intentionally out of scope for this project.

**What actually works well:** treat it like a real bedside alarm clock — install
it to your home screen, leave the app open in the foreground, and keep your
phone plugged in overnight. That's a well-supported, everyday usage pattern and
is what this app is designed around.

## Setup (for your own copy)

1. **Get a free Gemini API key** at [Google AI Studio](https://aistudio.google.com/app/apikey).
   Google's free tier is enough for personal daily use of this app.
2. **Get the code**: fork this repo, or download it as a ZIP (`Code → Download ZIP`
   on GitHub) and unzip it.
3. **Run it locally.** Because the service worker / PWA install requires a real
   origin (not `file://`), serve the folder instead of double-clicking `index.html`:
   ```bash
   npx serve .
   # or
   python3 -m http.server 8080
   ```
   Then open the printed `http://localhost:...` URL in your browser.
4. **Open the app → Settings tab → paste your Gemini API key.** It's saved only
   in that browser's `localStorage` — it is never written to any file, never
   committed to the repo, and never sent anywhere except directly to Google's
   Gemini API from your own browser.
5. **Set your wake-up time and voice**, then hit "Test Alarm & Poem Voice Now"
   to confirm everything works end-to-end.
6. **Install to your home screen** (on Android Chrome: menu → "Add to Home
   Screen" / "Install app") for the best full-screen experience.

## Deploying your own public copy (GitHub Pages)

1. Push your fork to GitHub.
2. Repo Settings → Pages → set source to the `main` branch, root folder.
3. GitHub will give you a URL like `https://yourname.github.io/your-repo/`.
   Because everything (including the API key) is client-side, this is safe to
   host publicly — each visitor pastes in *their own* key, which stays in
   *their* browser only. You never see or pay for anyone else's usage.

## Project structure

```
index.html      # App shell (markup + Tailwind CDN)
manifest.json   # PWA manifest (installable to home screen)
sw.js           # Service worker (offline app-shell caching only)
icons/          # App icons
js/
  config.js     # Editable constants (support link, model names, tuning)
  storage.js    # localStorage helpers (settings, API key, poem history, journal)
  poems.js      # Curated fallback poem library + no-repeat local selection
  gemini.js     # Gemini poem-fetch + text-to-speech calls
  app.js        # UI wiring: tabs, clock, alarm logic, settings persistence
```

No build step, no framework, no bundler — edit and refresh.

## Customizing your fork

- **Poem library**: add/edit entries in `js/poems.js`.
- **Voice & persona defaults**: edit the `<select>`/`<input>` defaults in
  `index.html`, or just change them once in Settings (they persist).
- **How often a new poem is fetched / how long repeats are avoided**: tune
  `ORACLE_PREFETCH_INTERVAL_HOURS` and `POEM_HISTORY_WINDOW_DAYS` in
  `js/config.js`.
- **Support link (see below)**: set `SUPPORT_LINK` in `js/config.js`.

## Support this project (optional, future)

If you'd like to support continued work on this project, a "Buy Me a Coffee"
(or similar) link can be enabled by setting `SUPPORT_LINK` in `js/config.js`:

```js
const SUPPORT_LINK = "https://www.buymeacoffee.com/yourname";
```

Leave it as an empty string (the default) to keep the app free of any support
prompts — it's entirely optional and hidden until you opt in.

## License

MIT — see [LICENSE](LICENSE). Fork it, remix it, make it yours.
