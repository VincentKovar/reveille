# Roadmap

Where Reveille is, and what's next. Each phase below is meant to be done on
its own feature branch with a PR back to `main` — one phase, one PR, reviewed
before merging, rather than committing straight to `main` like most of 2.0
was. Pull the latest `main` before starting a phase; check this file for
updates since another session may have finished one.

## Where things stand (as of 2.0.5)

- Native Android alarm engine: locked-screen ringing, reboot-safe scheduling,
  fail-safe chime, a real loudness boost on top of the phone's volume ceiling.
- Android-only, done outside this chain of sessions: a bundled fallback poem
  if Gemini's voice isn't ready in time, ambient sound (bowl/chimes/rain)
  moved to the alarm's own audio channel so it survives DND and a locked
  screen, and a sound-volume slider in Settings.
- iPhone/browser edition: works, but hasn't had the fallback-poem or
  reliable-ambient-audio work above — see Phase 1.
- Download page fixed to avoid Play Protect/Samsung install friction;
  documented but not eliminated (see Phase 5).
- CI: GitHub Actions builds the Android app and publishes the web app on
  every push to `main`. No automated release step yet (Phase 3).
- Tests: `tests/schedule.test.mjs` and `tests/gemini.test.mjs` only — pure JS
  logic. Nothing covers the Android Java code or the storage layer (Phase 2).

## Phase 1 — Bring the iPhone/web edition to parity

Android quietly got more reliable than the web edition this week. Close the gap:
- Port the fallback-poem behavior (if Gemini's voice isn't ready in time, read
  a bundled recording instead of leaving the alarm silent) to `platform.js`'s
  browser path.
- Give the browser edition the same ambient-sound reliability Android has —
  as close as Web Audio allows, since there's no alarm-channel equivalent.
- Add the same sound-volume slider to Settings for both platforms.

## Phase 2 — Close the test-coverage gaps

- `AlarmScheduler.nextOccurrence` (Java) is a hand-written mirror of
  `nextOccurrence` (`schedule.js`) — the comment says "keep the two in step,"
  but nothing enforces it. Add a small JUnit test suite for the Java version,
  ideally checked against the same cases as `schedule.test.mjs`.
- Add tests for `storage.js`'s preview cache (hit/miss/eviction) — currently
  only verified by hand in a browser console.

## Phase 3 — Automate releases

Right now a release is: bump the version in three files, run the build
script, install on a phone to sanity-check, commit, push, tag a GitHub
release. All manual (see `docs/PERSONAL-EDITION.md`). Turn this into one
command or one workflow dispatch: version bump, build, test, tag, release,
update `downloads/`.

## Phase 4 — Real-device QA pass

- Collect what friends report when installing (phone model, which Play
  Protect screen they saw, whether sound was audible) and fix anything real.
- Test the iPhone/web edition on an actual iPhone in Safari — nightstand
  mode's wake lock has only been checked in an emulated browser viewport,
  never real iOS.
- Try at least one non-Samsung, non-Pixel Android phone (Xiaomi/OnePlus) if
  a friend has one — those OEMs have their own battery/notification quirks
  beyond what `docs/INSTALL-ANDROID.md` already covers.

## Phase 5 — Accessibility pass

Screen reader labels, focus order through the alarm editor and ringing
screen, color contrast. Never audited. Worth doing before pointing more
people (especially employers) at it.

## Phase 6 — Optional: Play Console distribution (only if needed)

Deferred earlier in favor of free, organic reputation-building through
friends installing the direct APK. Revisit only if Play Protect friction is
still a real problem after that — see the conversation in
`docs/INSTALL-ANDROID.md`'s "why does this happen" note for the background.
Costs $25 one-time and a Google account; not something to do by default.

## Parking lot (not scheduled)

Ideas worth keeping, not yet prioritized: richer journal export, more Gemini
voices, a light/paper theme alternative to the current dark one.
