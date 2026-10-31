# Bowl Bandit

A portrait mobile game about a cat raiding food bowls on a street of nosy
neighbours. Plain HTML, CSS and JavaScript on one canvas: no framework, no
build step, no dependencies (Playwright is used by one optional test only).

## Branches: read this before committing

| Branch | What it is |
|---|---|
| `main` | The original desktop game (`index.html`). Untouched since the redesign began. |
| `claude/mobile-redesign` | **Live playtest build.** GitHub Pages serves this branch, and testers have it installed: <https://dondino-go.github.io/catgame/mobile.html>. Every push here reaches their phones: game changes go through the preview first (see Preview before shipping). |
| `claude/new-streets` | Where new features are built (new streets, minigames), branched from `claude/mobile-redesign`. Merged back after a preview and a `/code-review`. |
| `claude/data-driven-streets` | The refactor that made the street a data description (Phases 1 and 2). **Merged into `claude/mobile-redesign`; don't commit here any more.** |

Fixes from playtest feedback go on `claude/mobile-redesign`, then get merged
into the feature branch (`claude/new-streets`), not the other way round.

## Where things stand

- Phases 1 (#5: the rules read a street description) and 2 (#6: the renderer
  reads it) of the data-driven refactor are done, reviewed and live on
  `claude/mobile-redesign`. Marrow Street plays and looks exactly as before.
- Terrace Row, the first new street (#8), is live on `claude/mobile-redesign`
  and tagged "work in progress" in the picker for testers (`wip: true` on the
  street; remove it when the street is done). Five brick terrace houses on a
  narrow road at a warm evening, and a pub opposite that watches every bowl
  from wave 3 (a `venue` house: no bowl, watch only) with a bus stop and a beer
  garden beside it (`scenery`). It has its own ranks, wave wording, picker row,
  best score and unlock (Bin Lid Regular, 700, on Marrow Street: eased for
  playtesting, the first bar was Street Sweetheart, 1400). Shipped before its
  `/code-review`, which is still owed. #8 stays open until it is playtested.
  Next: Phase 3 walking routes (#7), then more streets (#12) and minigames (#9).
  Undecided: whether the eating screen should follow each street's look (#23).
- Open follow-ups: review findings #16 to #20, the screenshot flake (#21,
  mitigated by a retry, cause unknown), art style feedback being collected
  (#22), and the playtest checklist
  (#13).
- A new street is a description checked by `validateStreet` (see
  `tests/streets.js` for an odd-shaped one), with its own sight-line test,
  golden playthroughs and screenshots, a preview, and a `/code-review`.

## Layout

- `src/core.js`: the rules. No canvas, DOM, audio or timers. The street is a
  data description (`MARROW_STREET`, checked by `validateStreet`; `create()`
  takes a `street`) and the practice night is a core option
  (`create({ practice })`). Owns all game state; the renderer drives it with `update(g, dt)` and `tapHouse` /
  `tapRoad` / `tapEat`, reads state to draw, and drains `g.events` for sound
  and animation. UMD: `require()` in Node, `window.BowlCore` in the browser.
- `src/game.js`: the renderer and input. Everything is drawn in code, from
  `g.street` (houses by side of the road and row, bowls, road position), not
  from Marrow Street's shape. Holds
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
node tests/safearea.js            # canvas stays inside a phone's safe area
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
- `tests/terrace.test.js`: Terrace Row's sight lines (every window sees exactly
  the bowls it should, pub included), the pub's rules, its ranks and wording,
  and street unlocks and switching. A new street gets its own file like this.
- `tests/golden.test.js`: eight seeded Marrow rounds and four Terrace Row ones
  must replay **identically**.
  Any change that alters play fails it. If the change is intended, re-record
  with `--update` and say so in the commit message. During the refactor the
  logs must not change at all.
- `tests/screens.js`: key screens rendered in `?manual` mode and compared
  with `tests/screens/*.png` (pixel differences over 48/255 fail). Eight are
  Marrow Street (two of them the title with the street picker); four are
  Terrace Row (`terrace-*`: the pub shut and open, the close-up, the results
  map) and check that a tap on the pub walks to the road; two (`lane-*`) run on the odd-shaped test street in
  `tests/streets.js`, handed to the page as `window.__bbStreet` under `?debug`,
  and also check that taps land on the houses as drawn. Re-record with
  `--update` only for intended visual changes, and never re-record a Marrow
  screen during the refactor. Output goes to `tests/screens/out/`
  (git-ignored).
- `tests/safearea.js`: the canvas and the HUD must stay clear of the status
  bar, the Dynamic Island and the home indicator. Chromium doesn't emulate
  `env(safe-area-inset-*)`, so it puts the same values on `#stage` as padding,
  which is what the CSS does on a real phone.
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
- **Streets and ranks.** A street may carry its own `ranks` ladder and
  `waveBlurbs`; `rankFor(score, street)` and `blurbFor(street, wave)` read
  them. A street with fewer bowls scores lower, so scale its ladder from
  `node tools/simulate.js --street <name>`. Street unlocks name a street and a
  rung of its ladder (`unlock`); bests are stored per street id
  (`bowlbandit.bests`).
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

last reviewed: `f6c7d95` (`claude/data-driven-streets`, Phase 2, high, 9 findings; 1-6 fixed in `77f61cc`, 3 filed as issues)

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
- `node tests/screens.js --update` re-records **every** screen, Marrow ones
  included. To change one reference, delete just that PNG and rerun (or
  `git checkout` the others afterwards).
- The screenshot tests used to flake about one run in three (#21), on screens
  that hadn't changed (`results` 53 pixels, `eating-seen` 8, `title` 28); the
  cause was never found and it stopped reproducing (about 80 clean runs). A
  failing screen is now rendered once more, and a pass on the retry is
  reported as "needed a retry", with the first render kept in
  `tests/screens/out/<name>.first.png`. A real change fails both renders. If
  the retry notice appears often, the flake is back: compare that image with
  the reference and add what you find to #21.
- A new session can't overwrite the preview until it has read the files
  already published there (Artifact `read` with `paths`), and may start on a
  detached HEAD or a random `claude/...` branch: check `git status -sb` and
  switch to the branch you were asked to use before committing.
- A docs-only commit to `claude/mobile-redesign` skips the restamp
  (`git -c core.hooksPath=/dev/null commit ...`), so the build stamp testers
  see still matches the last change to the game and nobody is prompted to
  reload for nothing.
- `pkill -f tests/screens.js` also kills the shell command that contains that
  text. Wait for a background run or stop it by its task id.
- **Safe areas don't look after themselves.** `#stage` carries the phone's
  insets as padding, but `getBoundingClientRect()` returns the *border* box,
  padding included: measuring that sized the canvas to the whole screen, which
  overflowed under the Dynamic Island (taking the timer) and off the bottom
  (taking the build stamp). Measure the content box, and keep
  `tests/safearea.js` passing.
- The status bar style is `black`, not `black-translucent`. Translucent puts
  the game under the status bar and relies on iOS reporting an inset to lay
  out around, which it doesn't always do in an installed app. A phone-shaped
  bug like this can't be seen in the artifact preview, only on a phone.
