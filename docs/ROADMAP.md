# Roadmap

Where Reveille is, and what's next. Each phase below is meant to be done on
its own feature branch with a PR back to `main` — one phase, one PR, reviewed
before merging, rather than committing straight to `main` like most of 2.0
was. Pull the latest `main` before starting a phase; check this file for
updates since another session may have finished one.

This file is the single source of truth for phase numbering. Update it when a
phase ships or the plan changes.

## Where things stand (as of 2.0.6)

- Native Android alarm engine: locked-screen ringing, reboot-safe scheduling,
  fail-safe chime, a real loudness boost on top of the phone's volume ceiling.
- Shipped in 2.0.5: a bundled fallback poem ("In the Desert", Sulafat voice)
  that plays on Android if Gemini's voice isn't playing 10 s after the alarm
  fires; ambient sound (bowl/chimes/rain) moved to the alarm's own audio
  channel so it survives DND and a locked screen; a "Sound volume" slider in
  Settings (shared `www/` code, so it already exists on both platforms).
- Shipped in 2.0.6: failed voice recordings are retried while the app is open
  (transient failures at 2/10/30 min; a 429 pauses attempts for 1 h; auth and
  bad-request errors aren't retried), and a "Tomorrow's voice" status line
  (ready / getting ready / not ready + reason) under "Your next poem" and on
  the browser nightstand screen. Config: `VOICE_RETRY_MINUTES` and
  `VOICE_QUOTA_PAUSE_HOURS` in `config.js`.
- iPhone/browser edition: works, but the bundled fallback poem is Android-only
  (`platform.js`'s browser `playFallback` throws) and ambient audio is still
  plain Web Audio — see Phase 2.
- Voice prep only runs while the app is open. There is deliberately no native
  background job: Doze blocks the network overnight, and the fallback poem
  covers a recording that didn't get made.
- Download page fixed to avoid Play Protect/Samsung install friction;
  documented but not eliminated (see Phase 7).
- CI: GitHub Actions builds the Android app and publishes the web app on
  every push to `main`. No automated release step yet (Phase 4).
- Tests: `tests/schedule.test.mjs` and `tests/gemini.test.mjs` only — pure JS
  logic. Nothing covers the Android Java code, the storage layer, or the voice
  retry logic (Phase 3).

Not yet verified on a device: the 2/10/30-minute retry timing (the free Gemini
quota was exhausted when 2.0.6 shipped, so no attempt could fail transiently)
and the nightstand copy of the "Tomorrow's voice" line (checked in a browser
only).

## Phase 1 — Poem discovery (next)

Today the app picks from a small built-in library (7 poems) plus whatever
Gemini suggests. Make discovery reliable and keep the text honest:
- Fetch poem text from a verified public-domain source and let Gemini only
  choose and verify, rejecting any poem whose text doesn't match the source.
  Evaluate PoetryDB, Project Gutenberg and Wikisource first. Poetry Foundation
  and poets.org are copyrighted — not options.
- Selection rules (from the original prototype): prefer narrative or
  quasi-narrative over static lyric; fresh, surprising, open-ended imagery;
  don't fully resolve the central idea by the last line; short (hard cap 30
  lines, prefer under 20); rotate tone and season/weather.
- Keep the existing narrative/surprising filter and mood search.
- Keep a pool of about 10 unused discovered poems and refill it automatically.
  Discovery runs only when the app opens, at most once per 20 h, and needs a
  Gemini key.
- Grow the built-in library from 7 to about 30. Draft the additions for the
  owner's review before they ship.
- Source evaluation is done: see `docs/POEM-SOURCES.md`. Decision: PoetryDB
  as the text source, no author exclusions; OpenPoet only as a possible later
  candidate list; poets.org, Poetry Cove and The Poet's Place excluded.
- Status: fetching, Gemini judging, the pool top-up and mood search are built
  on branch `phase-1-poem-discovery` (unit-tested, not yet tried on a device).
  Still to do: grow the built-in library from 7 to about 30, for owner review.

## Phase 2 — Bring the iPhone/web edition to parity

Android got more reliable than the web edition. Close the gap:
- Port the fallback-poem behavior (if Gemini's voice isn't ready in time, read
  a bundled recording instead of leaving the alarm silent) to `platform.js`'s
  browser path.
- Give the browser edition the same ambient-sound reliability Android has —
  as close as Web Audio allows, since there's no alarm-channel equivalent.
- The sound-volume slider is already shared; confirm it behaves correctly on
  the browser path.

## Phase 3 — Close the test-coverage gaps

- `AlarmScheduler.nextOccurrence` (Java) is a hand-written mirror of
  `nextOccurrence` (`schedule.js`) — the comment says "keep the two in step,"
  but nothing enforces it. Add a small JUnit test suite for the Java version,
  ideally checked against the same cases as `schedule.test.mjs`.
- Add tests for `storage.js`'s preview cache (hit/miss/eviction) — currently
  only verified by hand in a browser console.
- Add tests for the voice retry/pause rules (which errors retry, the 2/10/30
  schedule, the 1 h quota pause and its reset when a new key is verified).

## Phase 4 — Automate releases

Right now a release is: bump the version in two files (`package.json` and
`android/app/build.gradle`), run the build script, install on a phone to
sanity-check, commit, push, tag a GitHub release. All manual (see
`docs/PERSONAL-EDITION.md`). Turn this into one command or one workflow
dispatch: version bump, build, test, tag, release, update `downloads/`.

## Phase 5 — Real-device QA pass

- Verify on a device what 2.0.6 couldn't: the retry timing, and the
  nightstand "Tomorrow's voice" line.
- Collect what friends report when installing (phone model, which Play
  Protect screen they saw, whether sound was audible) and fix anything real.
- Test the iPhone/web edition on an actual iPhone in Safari — nightstand
  mode's wake lock has only been checked in an emulated browser viewport,
  never real iOS.
- Try at least one non-Samsung, non-Pixel Android phone (Xiaomi/OnePlus) if
  a friend has one — those OEMs have their own battery/notification quirks
  beyond what `docs/INSTALL-ANDROID.md` already covers.

## Phase 6 — Accessibility pass

Screen reader labels, focus order through the alarm editor and ringing
screen, color contrast. Never audited. Worth doing before pointing more
people (especially employers) at it.

## Phase 7 — Optional: Play Console distribution (only if needed)

Deferred earlier in favor of free, organic reputation-building through
friends installing the direct APK. Revisit only if Play Protect friction is
still a real problem after that — see the conversation in
`docs/INSTALL-ANDROID.md`'s "why does this happen" note for the background.
Costs $25 one-time and a Google account; not something to do by default.

## Decisions

- No native background job for voice prep (Doze blocks the network overnight;
  the bundled fallback poem covers it).
- Users with no Gemini key keep the phone's text-to-speech voice. If nothing
  can speak, the alarm falls back to the chime plus an on-screen message.
- OpenRouter was considered as an alternative voice/poem provider and
  rejected for now.

## Parking lot (not scheduled)

Ideas worth keeping, not yet prioritized: richer journal export, more Gemini
voices, a light/paper theme alternative to the current dark one.
