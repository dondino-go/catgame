# Bowl Bandit

A portrait mobile game about a cat raiding food bowls on a street of nosy
neighbours. Plain HTML, CSS and JavaScript on one canvas: no framework, no
build step, no dependencies (Playwright is used by one optional test only).

## Branches: read this before committing

| Branch | What it is |
|---|---|
| `main` | The original desktop game (`index.html`). Untouched since the redesign began. |
| `claude/mobile-redesign` | **Live playtest build.** GitHub Pages serves this branch, and testers have it installed: <https://dondino-go.github.io/catgame/mobile.html>. Every push here reaches their phones: game changes go through the preview first (see Preview before shipping). |
| `claude/data-driven-streets` | Refactor making the street a data description, so new streets and minigames can be added. |

Fixes from playtest feedback go on `claude/mobile-redesign`, then get merged
into the refactor branch, not the other way round.

## Layout

- `src/core.js`: the rules. No canvas, DOM, audio or timers. The street is a
  data description (`MARROW_STREET`, checked by `validateStreet`; `create()`
  takes a `street`) and the practice night is a core option
  (`create({ practice })`). Owns all game state; the renderer drives it with `update(g, dt)` and `tapHouse` /
  `tapRoad` / `tapEat`, reads state to draw, and drains `g.events` for sound
  and animation. UMD: `require()` in Node, `window.BowlCore` in the browser.
- `src/game.js`: the renderer and input. Everything is drawn in code. Holds
  presentation-only state (eased glows, floaters, the practice night, hints).
- `src/version.js`: **generated** build stamp. Never edit by hand.
- `mobile.html`, `manifest.webmanifest`, `sw.js`, `icons/`: the installable
  app. `sw.js` is network first with an offline fallback.
- `index.html`: the legacy desktop game, kept until the mobile one replaces it.
- `tools/stamp-build.sh`: writes `src/version.js` (time and branch).
- `tools/preview.html`: the page the Claude artifact preview is published from.
- `tools/simulate.js`: the balance simulator (bots of four skill levels, careful
  or greedy). Re-run after any scoring change.

## Commands

```sh
node tests/run.js                 # all Node suites
node tests/golden.test.js         # seeded playthroughs vs tests/golden/*.log
node tests/screens.js             # reference screenshots (needs Playwright)
sh tools/stamp-build.sh           # stamp the build by hand
```

To play it over HTTP (needed for the service worker and install), serve the
repo's parent directory so the path matches GitHub Pages:
`python3 -m http.server 8123` from the parent, then open
`http://127.0.0.1:8123/catgame/mobile.html`.

URL flags: `?debug` exposes `window.__bb` (`g`, `C`, `tut()`, `advance()`...)
for setting up scenes by hand; `?manual` stops the animation timer so a test
steps frames itself with `__bb.advance(seconds)`.

## Tests and what they guard

- `tests/core.test.js`: the rules, directly against `src/core.js`.
- `tests/golden.test.js`: eight seeded bot rounds must replay **identically**.
  Any change that alters play fails it. If the change is intended, re-record
  with `--update` and say so in the commit message. During the refactor the
  logs must not change at all.
- `tests/screens.js`: six key screens rendered in `?manual` mode and compared
  with `tests/screens/*.png` (pixel differences over 48/255 fail). Re-record
  with `--update` only for intended visual changes. Output goes to
  `tests/screens/out/` (git-ignored).
- `behaviour`, `geometry`, `layout` test the **legacy `index.html`** only.
  They will be retired when the mobile game replaces it.

## Conventions

- **The build stamp.** A pre-commit hook in `.githooks/` runs
  `tools/stamp-build.sh` so every commit carries its time and branch, shown on
  the title and results screens. A SessionStart hook enables it
  (`git config core.hooksPath .githooks`). In a clone without it, run the
  script by hand before committing anything testers will see.
- **Design units.** The canvas is always 720 units wide; its height follows the
  phone's aspect (`DH`). Lay things out in those units, never CSS pixels.
- **World units** in the core: one row of houses is 1.0 tall; x runs 0..1
  across the street.
- **Difficulty and scoring are tuned by simulation.** After any change to
  scoring, the streak, the waves or the reaction windows, run
  `node tools/simulate.js` and re-check the `RANKS` thresholds in
  `src/core.js` against its output.
- **Comments explain why**, especially for anything learnt from a playtest.
  Match that density and tone.
- **Commits**: one clear subject line, then a body that says what was wrong or
  wanted and why this fixes it.

## Preview before shipping

- Changes meant for testers go to the Claude artifact preview first, not
  straight to `claude/mobile-redesign`. Publish the change there, say what to
  try, and wait for the user to say "ship it" before pushing to
  `claude/mobile-redesign` (it's live on testers' phones via GitHub Pages).
- Exceptions: changes the user has explicitly asked to go straight to the
  branch, and docs or test-only changes that don't affect the game.
- Say which build stamp the preview should show, so the user can confirm
  they're looking at the right version. Stamp the build first
  (`sh tools/stamp-build.sh`), since the preview isn't a commit.
- The preview link is <https://claude.ai/artifact/MnG5ZjmTZpgai9BN9SydKL>.
  Publish `tools/preview.html` with the Artifact tool, passing `src/core.js`,
  `src/game.js`, `src/style.css` and `src/version.js` as files at those same
  paths. From a new session, pass the link as `url` so it updates in place
  rather than creating a second preview.

## Backlog lives in GitHub issues

- Playtest feedback, review findings that weren't fixed, and feature ideas
  are tracked as issues in `dondino-go/catgame`, not just in chat.
- When the user reports a bug or idea, offer to file it as an issue. When work
  starts on one, reference it in the commit message (e.g. "Fixes #12"), and
  close it once the work is done and pushed.
- Labels: `playtest`, `review`, `bug`, `idea`, `refactor`.

## Code review

- Suggest a `/code-review` (high) at the end of each refactor phase, before
  merging a branch into `claude/mobile-redesign` or `main`, and after a new
  street, minigame or scoring change.
- Review only the commits since the last review, and update the marker below
  after each one.
- Report findings first; fix only what the user picks. Don't push review
  fixes to `claude/mobile-redesign` without asking: it's live on testers'
  phones.
- Small visual tweaks don't need a review; the golden and screenshot tests
  cover them.

last reviewed: `bcc0f84` (`claude/mobile-redesign` against `main`, high, 10 findings; 1-7 fixed in `69b99dd`)

## Things learnt the hard way

- Vertical swipes belong to the phone (home gesture, closing the app's sheet).
  Running away is a **sideways** flick only.
- While eating, a touch is held about 90ms to tell a tap from a swipe, but the
  bite is judged where the marker was when the finger landed. Don't change one
  without the other.
- Taps on the window strip of the eating screen must never bite: players poke
  the windows out of curiosity.
- Android resumes installed apps instead of restarting them. `game.js` checks
  the server's build stamp on resume and reloads on the title screen.
- For visual changes, render options side by side and let the user pick,
  rather than guessing in successive pushes.
