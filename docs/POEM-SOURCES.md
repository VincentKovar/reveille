# Poem sources: evaluation (Phase 1)

Evaluated 2026-10-02. Question: where can Reveille fetch poem *text* from, so
that Gemini only chooses and verifies and never supplies the words itself?

What the app needs from a source: public-domain text we can trust, fetchable
from a phone or browser with no key, line breaks and stanza breaks intact,
usable terms, and enough short narrative/imagistic poems to fill a pool of ~10
and refresh it.

## Summary

| Source | Verdict | Why |
|---|---|---|
| **PoetryDB** (poetrydb.org) | **Use (primary)** | Open JSON API, no key, CORS open, clean line arrays, ~3,100 poems / 129 authors |
| **OpenPoet** (openpoet.org) | Maybe later, as a candidate list only | 117,575 poems with tags/themes/year, but undisclosed sources, no terms, undocumented API |
| **Wikisource** | Spot-verification only | API works, but poems are wikitext pages, not a clean line list |
| **Project Gutenberg** | Not for runtime | Whole-book plain text; no per-poem API; would need parsing |
| poets.org | **Exclude** | Terms explicitly forbid scraping and AI use |
| Poetry Cove | **Exclude** | Terms forbid automated scraping; robots.txt blocks ClaudeBot etc. |
| The Poet's Place | **Exclude** | `/api/` disallowed in robots.txt; source of texts undisclosed; mixes in recent user-submitted poems |
| poetry.org | **Exclude** | Static educational site, four featured poets, not a text source |

## PoetryDB (recommended)

- `GET https://poetrydb.org/author`, `/title/<t>`, `/linecount/<n>`,
  `/lines/<text>`. Returns `{title, author, lines[], linecount}`. Responds with
  `access-control-allow-origin: *`, so it works from both the Android WebView
  and the browser edition.
- Measured: 3,176 poems matched; 129 authors; **2,033 poems of 4-30 lines,
  1,649 of 20 or fewer** (`linecount` counts non-blank lines, which matches
  our "hard cap 30" rule; 3,169 of 3,176 agree exactly). 115 authors have a
  short poem. Stanza breaks come through as empty strings (1,208 of the 2,033
  short poems).
- Weaknesses found:
  - **Skews lyric.** Dickinson is 425 of the short poems, then Shelley 187,
    Byron 161, Shakespeare sonnets 158. Narrative short poems exist but are a
    minority, so Gemini's filter will reject most of what it's shown.
  - Occasional data defects: 3 poems with mojibake; 56 duplicate titles in the
    short set; some author fields look truncated (an author shown as just
    "Robinson").
  - Community-run, no stated SLA or rate limit. Mitigation: the pool of ~10
    unused poems is stored on the device, and the built-in library remains the
    fallback, so an outage only delays refills.
- Every poem Gemini picks must still pass the verification step below.

## OpenPoet (candidate list only, not yet)

- Public JSON API (`/api/poems`, `/api/authors`, `/api/collections`) with
  117,575 poems, 20 per page. Each poem carries `year`, `collection_name`,
  `tags`, `themes` and structure metrics including `line_count`. That would
  help find narrative, surprising short poems far better than PoetryDB.
- Why not yet: no terms or license page, the site doesn't say where its texts
  come from, the API is undocumented (robots.txt only says the API is allowed
  "for prerendering"), and there are parsing artifacts (titles such as "?",
  "1", "(1)"). `year` is null for some poems, so we couldn't apply a
  publication-date public-domain check to those.
- If PoetryDB's variety proves too thin, revisit: use OpenPoet only to pick
  candidates, and require the text to match a second source before it's used.

## Excluded sites, with evidence

- **poets.org**, public-domain anthology page: the poems are marked public
  domain, but the Terms of Use say the Academy "does not permit, authorize or
  condone the copying or scraping of its website ... in order to create
  unauthorized products or train artificial intelligence tools and models."
  Honor that, even for the public-domain pages. Reading poems there to
  nominate candidates by hand is fine; fetching them from the app is not.
- **Poetry Cove**: its Terms say "Do not use automated scraping or extraction
  methods that exceed reasonable access without permission," and its
  robots.txt disallows ClaudeBot, GPTBot and others. Its own text comes from
  the PoeTree corpus and Project Gutenberg, so go to those upstreams instead.
  PoeTree's license has not been checked.
- **The Poet's Place**: robots.txt disallows `/api/`; the terms page is
  client-rendered and shows no text; the sitemap includes recent
  user-submitted poems, so "public domain" can't be assumed per poem.
- **poetry.org**: the "Famous Poets" pages cover four poets (Shakespeare,
  Frost, Dickinson, e.e. cummings). No API, and cummings is mostly still in
  copyright.

## Proposed verification rule

A discovered poem is stored only if all of these hold:
1. The text comes from the source API, not from Gemini.
2. Gemini returns the chosen poem's id plus its judgment against the selection
   rules; it never returns poem text we then use.
3. Line count is 4-30 and the author is in the pre-1931 allowlist or the
   poem's publication year is known to be 1930 or earlier (US public-domain
   cutoff as of 2026).
4. Gemini's judgment must also pass the narrative/surprising filter and the
   "doesn't fully resolve at the last line" rule.

The built-in library (7 poems today, target ~30) stays text we ship ourselves,
drafted for the owner's review.

## Decisions (owner, 2026-10-02)

- PoetryDB alone for the first release; OpenPoet deferred.
- No author exclusions. Every PoetryDB author is a 19th or early 20th century
  poet, so the pre-1931 check is not enforced in code (the names were read,
  but each death date was not audited).

## How it's built

`www/js/discovery.js` fetches and shortlists; `judgePoems` in `gemini.js`
judges. Gemini's answer is only indexes and labels, validated by
`parseVerdicts`; the poem text stored is always PoetryDB's.

- **Top-up** (`discoverForPool`): at most once per 20 h, when fewer than 10
  unused discovered poems are stored. Lists 80 random titles (light request),
  shortlists 12 of a usable length with at most 2 per poet, fetches their full
  text, and asks Gemini to accept or reject each. Up to two rounds per day.
- **Mood search** (`discoverForMood`): Gemini suggests single search words,
  PoetryDB lists poems containing them, up to 20 are fetched in full, and
  Gemini picks the best fit or says none fits.
- Lines are trimmed, blank stanza breaks are kept, and poems with garbled text
  or outside 4-30 real lines are dropped before Gemini sees them.
- Judge rules: complete poem (not an excerpt or part of a sequence);
  narrative or built on a fresh image; open-ended last line; no slurs or
  demeaning language. The last rule was added as a guard for old verse and can
  be removed from the prompt in `gemini.js`.
