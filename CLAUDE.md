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
| `claude/slow-loop` | The night: the clock round replaced by an open-ended night with an attention meter. **Merged into `claude/mobile-redesign` and live; don't commit here any more.** |
| `claude/data-driven-streets` | The refactor that made the street a data description (Phases 1 and 2). **Merged into `claude/mobile-redesign`; don't commit here any more.** |

Fixes from playtest feedback go on `claude/mobile-redesign`, then get merged
into the feature branch (`claude/new-streets`), not the other way round.

## The night: how a round works

There is no countdown. Each house has **one dinner**: eating a bowl to the
bottom settles that house (`h.cleared`), so the street empties as it is worked
through and there is no safe bowl to farm. That is what makes a night finite
without a clock, and what makes its length follow the street's size rather
than a constant.

Being caught **shuts** a house for `SHUT_SECS` rather than angering it; the
second catch at the same house (`STRIKES`) ends it for good. A single mistake
costs tempo, not the night.

A night ends three ways, and the results headline says which:

| Ending | Trigger |
|---|---|
| `cleared` | a bowl from every house |
| `done` | every house settled, but some were lost |
| `owner` | the attention meter filled |

**Every ending gets a moment.** The owner's arrival has `PICKUP_SECS` of
animation; clearing the street used to cut to the results on the same frame,
so the one ending with a beat was the one you are trying to avoid ("the game
just ended"). `beginLeave` now gives it `LEAVE_SECS`: a turn
on the spot for `LEAVE_CIRCLE` and then a walk off the end of the road, shot
the same way the pickup is -- `leaveCamera` pushes in on the cat and follows
it out, easing off at the end so the street does not whip past. The caption
is up during the turn and gone before the cat is, so the last beat is the
street emptying rather than words sitting over it. A good night gets the hearts the cat gives
its owner when it is carried home; a thin one gets none. A tap skips the lot
after `LEAVE_SKIP`. Scene order is `play` -> `leaving`/`pickup` -> `over`, so a
test that settles a street sees `leaving`, not `over`.

**The endgame waits scale down** (`endgameScale`). A bowl comes back 5.5-9s
after a fox theft and a frightened house reopens after `SHUT_SECS`; those
pace a street with somewhere else to be, but with one or two houses left
there is nowhere else and a playtest found it was just standing about waiting
for the fox. The wait halves with two houses in play and quarters with one.
It is not a discount on the penalty -- being caught still costs the tempo.

**Attention** replaces the clock: it drifts up slowly (`RACKET_DRIFT`, a
backstop so a flawless cat cannot prowl for ever), jumps on a clattered bowl
(`RACKET_MISS`) and on being caught (`RACKET_CAUGHT`), and climbs while a
neighbour has eyes on you (`RACKET_SEEN`). The first tuning fed it only from
misses and catches with a faster drift, which punished patience -- careful
bots got the owner on 20% of nights and reckless ones on none, the same
inversion #13 found under the clock. Feeding it mainly from **being noticed**
is what makes careful play win.

**Waves follow progress**, not time (`waveByProgress`): the street wakes up as
you take its food, so playing slowly no longer means missing the late waves.
`lockWave(g, i)` stands the street at a wave for tests and `?debug`.

A night is **graded on how much of the street you got** (`nightGrade`), not on
what you scored: eight of eight is rare, so seven has to read as a good night
rather than a near miss. The results headline is that grade **as a verdict in
plain words** -- A GOOD NIGHT, A FAIR NIGHT, BETTER LUCK TOMORROW -- because a
playtest showed a tally ("SIX OF EIGHT") is a fact rather than an answer to
"did I do well?". The count stays on the map and in the card. The line under
the map says **why the night stopped**, and when houses were lost that is the
reason, so it leads. Two scares end a house, which nothing used to say: the
caught card names it the second time, and the spotted line counts what it
cost. Thresholds are fractions (0.35, 0.6, 0.8, 1) so a
five-bowl street grades like an eight-bowl one.

The grade is a **rung, not a name**: it drives the verdict wording and the
send-off's hearts, and nothing else. **The rank the player is shown comes from
the score** (`rankFor`), so it agrees with their best and with what unlocks a
street. The two used to come from different measures, and a greedy night that
cleared the whole street for few points read "GHOST OF MARROW STREET" over
"BEST 1400 · Bowl Bandit". Re-deriving the ladders narrowed that but could not
close it: completion and points are different axes, so each is said once --
the headline says how much you took, the rank says how well you played it.

The **score ladders were re-derived for the night** and now agree with that
grade instead of fighting it. Without a clock to farm against, one dinner per
house caps what a street pays and scores fell by about a third: against the
clock-era thresholds every skill level piled onto the middle rungs and the top
one came up on 1% of nights, so the results screen could say "GHOST OF MARROW
STREET" over "BEST 1946 · Street Sweetheart". Both ladders now sit at their own
street's night medians, so the same play earns the same rung on either street
(expert careful bots reach the top rung on 57% of Marrow nights and 49% of
Terrace ones). **Re-derive them from `node tools/simulate.js --rounds 150`
whenever the loop changes what a street can pay**, and remember the unlock in
a street's `unlock` moves with them.

Nothing is announced. A wave is the street getting nosier and that is already
on screen -- more windows lit, the dog's bark, the fox walking on. **Don't add
a card back.**

There was a SLIP AWAY button for leaving while you were ahead. Nobody used it,
and the reason was structural, not presentational: **every ending pays the same
kept bonus and the same points**, and the score is banked as you eat, so
leaving early protects nothing. A cash-out needs something at stake. If the
night ever wants a final decision, give the endings different outcomes first --
then the button earns itself.

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
  best score and unlock (Bin Lid Regular on Marrow Street: eased for
  playtesting from the second rung to the first, and now 600 rather than 700
  since the ladders were re-derived for the night). Its owed
  `/code-review` is now done (6 findings; 4 fixed, 2 filed). #8 stays open
  until it is playtested.
  Next: Phase 3 walking routes (#7), then more streets (#12) and minigames (#9).
  Undecided: whether the eating screen should follow each street's look (#23).
- Open follow-ups: review findings #16 to #20 (#20 is half done -- the title
  helpers read the page now, the street-row ones still restate `L.hud`), the
  screenshot flake (#21, mitigated by a retry, cause unknown -- but see the
  resize lesson below for a lead), and art style feedback being collected
  (#22). The old playtest checklist (#13) is closed: it was written for the
  clock round and its numbers would mislead.
- **The night is live.** The clock loop was kept beside it for a playtest and
  lost; the attention meter was the clear winner. Shipped to testers on 1 Nov
  after two `/code-review` passes (7 findings then 4, all addressed). All
  twelve golden logs are night playthroughs now, and the wave cards, the HUD's
  wave row, `timeLeft`, `GAME_SECONDS` and `waveAt` are gone. Testers had only
  ever played the clock version, so the first round of feedback is a reaction
  to a different game, not an update to the old one.
- Open on the night: fighting the fox off at a bowl (#30) -- the fox now races
  you for a bowl rather than eating out of it, which cost it most of its teeth
  -- and whether a dog pass in the endgame is unfair (#31).
- **New streets are on hold** until the art style feedback (#22) lands: each
  street is drawn by hand, so a restyle would mean redrawing them. The work
  that isn't art carries on -- per-street events (#27), walking routes (#7),
  and how the streets fit together (the picker, unlocks and transitions).
  The rule that keeps this cheap: no `if (street.id === ...)` in the renderer.
  Everything per-street comes from the street description, `look` included.
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
node tests/results.js             # the results screen fits on every phone shape
node tests/title.js               # the title screen fits, and PLAY always starts a round
node tests/update.js              # picking up a new build, over HTTP
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
- `tests/night.test.js`: what the night added -- cooling off, one dinner per
  house, the four endings, the attention meter, waves following progress, the
  fox racing rather than sharing, and that the lesson is left alone by all of
  it. `tests/core.test.js` covers the rules the night inherited.
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
  which is what the CSS does on a real phone. The HUD checks read where the
  game actually drew (`fillText` and `strokeText` are recorded with the
  transform in force), so text creeping back under the island fails even when
  the canvas itself is placed correctly.
- `tests/results.js`: the worst-case results screen -- every stat line, a new
  best, a new street and a street choice -- measured at every phone shape the
  renderer allows (DH 1125..1714). Nothing may overlap and nothing may fall off
  the bottom. The screen is laid out from a fit factor computed from its own
  content, so adding a stat line or a banner can't push it back into a clash.
- `tests/update.js`: picking up a new build, served over HTTP because the
  check is skipped on `file://`. It stalls the stamp request, then mends it,
  and insists the game asks again and reloads. A stalled fetch used to leave
  the single-flight guard up for the life of the page.
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
  scoring, the streak, the waves, the reaction windows or the attention
  constants, run `node tools/simulate.js` (and `--street terrace`) and check
  its output: careful play must beat greedy on what it *gets* as well as what
  it scores, and night length must follow the street's size. Bots see every
  window at once, so they get far more of the street than a real player --
  a tester not reaching the last bowl is the simulator being optimistic, not
  the night being too easy. Do not retune against bot numbers alone.
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

last reviewed: `b5ed7b3` (the night's second pass, `e0b35c6..b5ed7b3`, high,
4 findings; all 4 fixed in `0954268` -- a results line that clipped at 719 of
720 units, the two ranks disagreeing, a frozen RUN bar through the send-off,
and a stale threshold in a comment).
before that: `e0b35c6` (the night, `origin/claude/mobile-redesign..claude/slow-loop`,
high, 7 findings; all 7 addressed -- the score ladders were re-derived rather
than dropped).
before that: `c69e469` (Terrace Row, `6b88173..c69e469`, high, 6 findings;
1-4 fixed in `7584741`, 5-6 filed as #28 and #29). The Terrace Row work shipped before its
review, so this one reached back past the marker below it; both ranges have
now been reviewed.
before that: `34a55c0` (`claude/iphone-home-screen-cache-vfzflx`, the
update-path fixes and the results-screen fit, high, 4 findings; all 4 fixed)

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
- **The update path is confirmed end to end on both platforms** (#24, closed):
  an installed iPhone *and* a Pixel both went from 31 Oct 12:15 to 1 Nov 08:43
  on their own, with nothing cleared by hand. All a tester does is open the app
  and wait a second or two on the title screen. Two things look like a failure
  and are not: resuming straight into a round reloads nothing (deliberately --
  the title and results screens offer "Update ready, it loads when you tap"
  instead), and a first attempt that does not take is meant to be followed by a
  full close and reopen, which is what triggers the self-heal. Try twice before
  believing it is broken. None of this can reach a phone still on the original
  cache-first worker; those still need the manual steps in #24.
- For visual changes, render options side by side and let the user pick,
  rather than guessing in successive pushes.
- `node tests/screens.js --update` re-records **every** screen, Marrow ones
  included. **To change one reference, delete just that PNG and rerun without
  `--update`**: a missing reference is recorded (`REC`) and nothing else is
  touched. Do not reach for `--update` and tidy up afterwards with
  `git checkout` -- that reverts to the last *commit*, so a reference that
  legitimately changed earlier in the same session, but is not on the list you
  are tidying around, is silently restored to a stale version. It happened to
  `results-partial`: re-recorded correctly for a shortened line, reverted by
  the next clean-up, and it sat wrong until the final check before shipping.
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
- **Playwright's `setViewportSize` returns before the page has relaid out**, so
  the canvas can still report its old size. Measuring or clicking through a
  stale rect maps design units to the wrong place: it made `tests/title.js`
  fail about one run in five until it waited for the canvas to match the
  window. Worth trying against the screenshot flake (#21), whose symptom --
  two alternating renders rather than random noise -- has the same shape.
- **The canvas is cleared in screen space, before the camera.** `drawStreet`
  has a full-canvas fill of its own, but it is inside the transform: as soon
  as a camera move followed the cat past the end of the road it stopped
  covering the screen and the previous frame showed through, so the cat was
  smeared across the road as it walked off. For the same reason `leaveCamera`
  clamps to the painted street -- following the cat out showed the void below
  the pavement. `tests/screens/leaving-thin.png` is taken late in the walk,
  where both would show.
- A new layout number belongs in one place and is asked of the page by the
  tests (`__bb.titleRects()`, `__bb.g.street.rows`), not restated in them.
  The same goes for thresholds: `tests/screens.js` hard-coded a best of 699 to
  stand just under Terrace Row's 700 unlock, and when the ladders were
  re-derived for the night that scene silently stopped testing a locked street
  -- it still passed its screenshot, and only its own tap check caught it. Read
  the number off the ladder (`RANKS[street.unlock.rank][0]`).
- **The results screen is the one that runs out of room.** It grows a card
  line for every kind of trouble in the round and two banners after a good
  one, so it is laid out from a fit factor measured against its own content,
  not from a fixed size with the prompt pulled up to suit -- that put TAP TO
  PROWL AGAIN on top of NEW BEST and NEW STREET on shorter phones. Keep
  `tests/results.js` passing when anything is added to it. The fit makes the
  bottom clamp bind exactly, so whatever `footer` reserves under the prompt is
  the clearance the build stamp gets: change one and check the other.
- **A promise guarding a network call needs a way out.** `fetch` has no
  timeout, so one stalled request left the update check's single-flight guard
  up for ever and every later check did nothing -- on iOS, where the app is
  resumed rather than relaunched, that page lives for days and the phone sits
  a build behind with no way back but a force-quit. The guard races a timeout
  now and the fetch is aborted. A wedged phone recovers on a force-quit alone:
  the wedge is page state, not storage, so it needs no clearing of site data.
- `reg.update()` is never awaited. It only settles once a new worker has
  finished installing, and ours precaches ten files first, so waiting on it
  holds up the very fetch that detects a new build.
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
