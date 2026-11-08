# Bowl Bandit

A portrait mobile game about a cat raiding food bowls on a street of nosy
neighbours. Plain HTML, CSS and JavaScript on one canvas: no framework, no
build step, no dependencies (Playwright is used by one optional test only).

## Branches: read this before committing

| Branch | What it is |
|---|---|
| `main` | **The live build and the canonical source.** GitHub Pages serves this branch, and testers have it installed: <https://dondino-go.github.io/catgame/> (installed apps still launch `mobile.html`, see below). Every push here reaches their phones: game changes go through the preview first (see Preview before shipping). |
| `claude/new-streets` | **Where work is built** (new streets, minigames, the endgame). Branched from `main`; merged back into `main` after a preview and, where it applies, a `/code-review`. |
| `legacy-desktop` | The original desktop game (`index.html`) and its three suites, exactly as `main` held them before the swap. Retired from `main` by #10; kept here for reference. |

Retired -- **don't commit to these**: `claude/mobile-redesign` (the old live
branch; Pages moved to `main`), `claude/slow-loop` (the night) and
`claude/data-driven-streets` (the refactor). All three were merged into `main`.

Fixes from playtest feedback go on `main` (through the preview), then get
merged into `claude/new-streets`, not the other way round.

**`index.html` is the mobile game** (Pages serves it at the root). **`mobile.html`
is the same page again, kept on purpose and never to be deleted as a duplicate:**
an iPhone stores the address it was added from and never updates it, so every
install made before #10 still launches `mobile.html`, and would open a 404
without it. `start_url` in the manifest is deliberately still `./mobile.html`:
changing it without an `id` makes Chrome treat the app as a different one, and
the phones that matter cannot be updated from here. `tests/entry.test.js` fails
if the two pages differ or either goes missing. When you change the page, change
both: `cp index.html mobile.html`.

## Git workflow

- **Run `git push` as its own standalone command.** Never chain it after a
  build, a test run or a commit with `&&` or `;`. A push buried at the end of
  a long chain was refused as a production deploy, and a bare push of the same
  commit to the same branch went through moments later -- the objection was to
  the shape of the command, not to the branch.
- **Say which branch and remote you are pushing to before you push.**
- **Confirm before deleting or force-pushing any branch.** Deleting a remote
  branch is refused here anyway (`[Git Destructive]`), so it falls to the user
  to run; say so rather than retrying.
- Remember which branch is live: `main` is what GitHub Pages serves, so a
  push there reaches testers' phones. `claude/new-streets` reaches nobody.

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

## Walking routes

A street's walkable ground is a list of convex rectangles -- **stretches** --
and the **links** that join them. Inside one stretch a straight line is always
legal, which is the whole reason the ground is described as areas rather than
as a thin graph of points: Marrow Street and Terrace Row are one stretch each,
so every walk on them is the straight line it always was, down to the last bit
of arithmetic, and **all twelve golden logs are byte-identical across the
change**. A spine-and-spurs graph of points would instead have sent the cat out
to the middle of the road and back every time it crossed between two bowls --
longer, slower, visibly on rails, and it would have rewritten every log for
nothing.

Where two linked stretches meet is simply their overlap, so a junction has no
coordinates of its own to drift out of step with the rectangles. A stretch that
carries its own `roadX` is a **run of road** -- the ground a renderer can paint,
and the only kind a house may front. One without is a crossing or a yard:
walkable, but nothing stands on it.

`walk: { x, y }` is the original single-rectangle shape and still works: it
reads as one stretch called `main`. A street gives one or the other, never
both.

The cat and the fox follow routes; the fox also judges which bowl is nearest by
**how far it has to walk**, not by the crow flight. `routeNext` returns `null`
for "walk straight at it", which is the answer everywhere on a one-run street
and is what the callers lean on to stay bit-identical.

The fox's **mooch** -- what it does with nothing to rob -- paces the line
`street.fox` names, in a straight line, easing x towards it. That is fine on
one run of road and was off walkable ground 0.22s later up a cul-de-sac, so it
now walks back to the road by route first. The line itself must be walkable
end to end on **one** stretch, which `validateStreet` checks: the mooch cannot
turn a corner, so pointing it across a gap is a street bug, not a fox bug.

**A link carries `open`, and nothing closes one.** It is there so that a gate
-- "clearing this bowl opens that path" -- is a flag the search already reads
rather than a rebuild of the section. When something does close a path, the
callers will need more than this: with no route the router falls back to a
straight line rather than leaving a character stuck on the spot, so a closed
gate would let the cat walk through a house. Gating means `tapHouse` declining
an unreachable bowl, not just flipping the flag.

**Not routed, and tied to the road line on purpose:** the dog's run, the cat's
walk off at the end of a night, and the owner's approach (which is drawn
entirely in screen space in `pickupPlan`). All three are set-pieces shot along
a straight road, and they move to routes when the renderer can draw a bend.

**Houses and scenery belong to a run of road, not just to a side.** `on` names
it and defaults to the run the bowl stands on (scenery: the first run). Every
rule about what may sit where -- the pavement a bowl stands on, two tap strips
overlapping, scenery sitting on a house -- is measured against that run, or
things round a corner from each other read as on top of each other.

**A street says how wide it is.** One run of road with houses down both sides
is 232 + 256 + 232 = 720 design units: exactly the canvas, so a second run
could not be on screen at all. `width` (default 1) says how many of those a
street is, and the renderer draws the whole thing at one scale in `draw()`
rather than threading a factor through forty drawing calls. Rows are measured
**before** that scale, so the street still fills the height -- which means a
wide street wants more rows too, or it leaves the bottom of the screen empty.
That is the shape of the idea: not one street squashed, but a bigger place
drawn smaller. Marrow Street rendered at 60% and 50% is what settled it; every
house name is still legible at 60%.

**Everything that asks "which road?" must ask the cat's, not the street's.**
Houses stand against the run they front (`h.run`, from core) and a strip
reaches halfway across the block it shares with the next run along. The
run-away flick aims at the road the *bowl* is on: aiming at `street.roadX`
sent a cat eating on the back road off round the block by way of the alley,
and the route finder walked it there quite correctly, so it never looked
broken -- it just did not work. `scenery` takes a `block` kind for the gaps a
wider street leaves: a building with nobody in it, which the rules never see.

**Still tied to the main run:** `pickupPlan` (the owner's approach), the dog's
run and the cat's walk off. Those are set-pieces shot along one road, and the
cameras have not been checked at width 2 either.

**Lamplighter Block is the first street with two of them** (`BLOCK_STREET`):
a back lane, two roads with a block of houses between them and an alley at
the bottom joining them. Eight bowls and twenty sight lines -- Marrow
Street's exactly -- on purpose, so a night on a shaped street can be compared
with a night on a straight one without the bowl count explaining the
difference. It is `wip` and deliberately **not** gated behind an unlock while
it is being played; give it one before it is anything but work in progress.
`tests/bent.js` is still only a rules fixture.

## Where things stand

- Phases 1 (#5: the rules read a street description) and 2 (#6: the renderer
  reads it) of the data-driven refactor are done, reviewed and live on
  `main`. Marrow Street plays and looks exactly as before.
- Terrace Row, the first new street (#8), is live on `main`
  and still tagged "work in progress" in the picker (`wip: true` on the street;
  removing it is a game change, so it goes through the preview -- the street is
  done and playtested, the tag just has not been taken off). Five brick terrace houses on a
  narrow road at a warm evening, and a pub opposite that watches every bowl
  from wave 3 (a `venue` house: no bowl, watch only) with a bus stop and a beer
  garden beside it (`scenery`). It has its own ranks, wave wording, picker row,
  best score and unlock (Bin Lid Regular on Marrow Street: eased for
  playtesting from the second rung to the first, and now 600 rather than 700
  since the ladders were re-derived for the night). Its owed
  `/code-review` is now done (6 findings; 4 fixed, 2 filed). #8 is closed: it was
  playtested by the owner and by the iPhone tester.
  Phase 3 walking routes (#7) is done in the rules (see **Walking routes**);
  drawing a street that bends is still to do.
  Next: more streets (#12) and minigames (#9).
  Undecided: whether the eating screen should follow each street's look (#23).
- Open follow-ups: review findings #16 to #20 (#20 is half done -- the title
  helpers read the page now, the street-row ones still restate `L.hud`), the
  screenshot flake (#21, mitigated by a retry, cause unknown -- but see the
  resize lesson below for a lead; note that a both-render failure can still be
  a flake, and can also be a stale reference). The old playtest checklist (#13) is closed: it was written for the
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
- **New streets are no longer on hold.** They used to wait for the art style
  feedback (#22) on the grounds that a restyle would mean redrawing every
  hand-drawn street. #22 collected nothing in the eleven days it was open and
  was closed; the hold it created was the only thing it was doing, and it was
  holding up work that turned out not to touch the art at all.
  The rule that keeps new streets cheap: no `if (street.id === ...)` in the
  renderer. Everything per-street comes from the street description, `look`
  included.
- A new street is a description checked by `validateStreet` (see
  `tests/streets.js` for an odd-shaped one and `tests/bent.js` for one that
  bends), with its own sight-line test,
  golden playthroughs and screenshots, a preview, and a `/code-review`.
- **Lamplighter Block (`block`) is in the picker, open and tagged `wip`**,
  waiting on its first playtest. It is the first street with two roads. What
  it still owes: an unlock, a look of its own (it borrows the default night
  palette), kerbs on the alley, and the set-pieces listed under **Walking
  routes** that still follow the main road. The results screen's street map
  does not know about runs either -- it draws every house as left or right of
  one road -- which reads fine but is not the street's shape.

## Layout

- `src/core.js`: the rules. No canvas, DOM, audio or timers. The street is a
  data description (`MARROW_STREET`, checked by `validateStreet`; `create()`
  takes a `street`) and the practice night is a core option
  (`create({ practice })`). Its walkable ground is one rectangle (`walk`) or
  several joined up (`paths`), and the cat and the fox take the shortest way
  round it -- see **Walking routes**. Owns all game state; the renderer drives it with `update(g, dt)` and `tapHouse` /
  `tapRoad` / `tapEat`, reads state to draw, and drains `g.events` for sound
  and animation. UMD: `require()` in Node, `window.BowlCore` in the browser.
- `src/game.js`: the renderer and input. Everything is drawn in code, from
  `g.street` (houses by side of the road and row, bowls, road position), not
  from Marrow Street's shape. Holds
  presentation-only state (eased glows, floaters, the practice night, hints).
- `src/version.js`: **generated** build stamp. Never edit by hand.
- `index.html` (and its copy `mobile.html`), `manifest.webmanifest`, `sw.js`,
  `icons/`: the installable app. `sw.js` is network first with an offline
  fallback, and precaches the bare address, `index.html` and `mobile.html`
  separately because its cache is keyed by URL.
- `tools/stamp-build.sh`: writes `src/version.js` (time and branch).
- `tools/preview.html`: the page the Claude artifact preview is published from.
- `tools/simulate.js`: the balance simulator (bots of four skill levels, careful
  or greedy). Re-run after any scoring change.
- `tools/street-gen.js`, `street-lab.js`, `planning-lab.js`, `fed-sleep.js`,
  `street-gallery.js`, `street-lab-play.html`: prototypes from the street-a-day
  experiment (#34, closed). A street generator that derives `neighbours` from
  geometry, bot labs that measure how much a street or a rule changes a night,
  and a playable page. Nothing in `src/` uses them. They only know straight
  roads -- they predate `paths` and have not been taught about it -- so they
  are a starting point for the roguelike run (#37), not a finished tool.

## Commands

```sh
node tests/run.js                 # all Node suites
node tests/golden.test.js         # seeded playthroughs vs tests/golden/*.log
node tests/screens.js             # reference screenshots (needs Playwright)
node tests/safearea.js            # canvas stays inside a phone's safe area
node tests/results.js             # the results screen fits on every phone shape
node tests/title.js               # the title screen fits, and PLAY always starts a round
node tests/runaway.js             # a flick off a bowl, on a street with two roads
node tests/update.js              # picking up a new build, over HTTP
sh tools/stamp-build.sh           # stamp the build by hand
```

To play it over HTTP (needed for the service worker and install), serve the
repo's parent directory so the path matches GitHub Pages:
`python3 -m http.server 8123` from the parent, then open
`http://127.0.0.1:8123/catgame/`.

URL flags: `?debug` exposes `window.__bb` (`g`, `C`, `tut()`, `advance()`...)
for setting up scenes by hand; `?manual` stops the animation timer so a test
steps frames itself with `__bb.advance(seconds)`.

## Tests and what they guard

- `tests/core.test.js`: the rules, directly against `src/core.js`.
- `tests/block.test.js`: Lamplighter Block -- its sight lines, including the
  one that crosses the block (Mr Quill and The Mullens back onto each other
  from different roads), that the walk between the two roads goes by the alley
  and never crosses the block, its ladder and wording, and that it is in the
  picker. It guards hardest that the street has **the same eight bowls and
  twenty sight lines as Marrow Street**: the moment that stops being true, a
  night here measures the size rather than the shape, which is the one thing
  the street exists to measure.
- `tests/terrace.test.js`: Terrace Row's sight lines (every window sees exactly
  the bowls it should, pub included), the pub's rules, its ranks and wording,
  and street unlocks and switching. A new street gets its own file like this.
- `tests/night.test.js`: what the night added -- cooling off, one dinner per
  house, the four endings, the attention meter, waves following progress, the
  fox racing rather than sharing, and that the lesson is left alone by all of
  it. `tests/core.test.js` covers the rules the night inherited.
- `tests/routes.test.js`: walking routes. The route functions on Bent Lane
  (`tests/bent.js`, a street with a cul-de-sac round a block of houses), and
  then a real cat and a real fox set loose on it and watched every tick -- a
  route that is right on paper and a walk that leaves the pavement are
  different bugs. It also pins the half that must NOT change: on a street with
  one run of road the router asks for no corners and every distance is exactly
  the crow flight, which is what keeps the golden logs identical.
- `tests/runaway.js`: a sideways flick off a bowl, on Lamplighter Block
  (`tests/block.js`, two roads with a block of houses between them) and on
  Marrow Street. It measures how far the cat moves **along** the road, not
  across it: the first version checked the cat ended up near its own road and
  passed happily with the bug put back, because a cat setting off down the
  back road towards the alley is at much the same x as one stepping across it.
- `tests/golden.test.js`: eight seeded Marrow rounds, four Terrace Row ones
  and four Lamplighter Block ones must replay **identically**. The Block logs
  pin the walk round a shaped street: route-finding changed by accident shows
  up there as a night that goes differently.
  Any change that alters play fails it. If the change is intended, re-record
  with `--update` and say so in the commit message. During the refactor the
  logs must not change at all.
- `tests/screens.js`: key screens rendered in `?manual` mode and compared
  with `tests/screens/*.png` (pixel differences over 48/255 fail). Eight are
  Marrow Street (two of them the title with the street picker); four are
  Terrace Row (`terrace-*`: the pub shut and open, the close-up, the results
  map) and check that a tap on the pub walks to the road; three (`block-*`)
  are Lamplighter Block, where the taps matter more than the picture -- every
  one goes through the half-size scale before it reaches a house, and the two
  middle strips are back to back with only a fence between them; two (`lane-*`) run on the odd-shaped test street in
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
- `tests/entry.test.js`: the two ways into the game and what an installed app
  depends on -- `index.html` is the mobile game, `mobile.html` still exists and
  is identical to it, `start_url` and every file the service worker precaches
  and the update check refreshes exist, and both entry pages are in both lists.
  Remove `mobile.html` and it fails, which is the point.
- The legacy desktop game's suites (`behaviour`, `geometry`, `layout`, `balance`)
  and the stubbed-browser half of `tests/harness.js` were retired with it in #10;
  `harness.js` is now only the shared `ok()` / `report()`.

## Screenshot goldens: how to re-record

- **Never re-record across the whole suite.** `node tests/screens.js --update`
  rewrites *every* reference, Marrow ones included.
- **To change one reference, delete that PNG and rerun without `--update`.**
  A missing reference is recorded (`REC`) and nothing else is touched. There is
  no flag for targeting one screen: `tests/screens.js` parses `--update` and
  nothing else.
- **Do not use `--update` and tidy up afterwards with `git checkout`.** That
  reverts to the last *commit*, so a reference that legitimately changed
  earlier in the same session is silently restored to a stale version. That is
  what happened to `results-partial`: re-recorded correctly for a shortened
  line, reverted by the next clean-up, and wrong until the final check before
  shipping. **A stale reference is worse than a failing one -- it passes.**
- **If you do run `--update`, `git status tests/screens/` afterwards** and
  check every changed file is one you meant to change.
- **Known flaky, do not re-record on a single failure** (#21): historically
  `results` (53 pixels), `eating-seen` (8), `title` (28) and `title-locked`
  (30). Rerun before believing a failure, and compare `tests/screens/out/`
  with the reference.
- **Failing both renders is not proof of a real change.** That used to be the
  rule here and it is wrong twice over. `lane-street` failed both renders on
  every run for a whole session, including on an unmodified tree at
  `5edf3cf` -- it was a **stale reference**, not a flake, and re-recording
  that one PNG fixed it. In the same session `lane-eating` failed both
  renders by 18 pixels once and passed clean on the next two runs, so the
  retry does not always catch the flake either. The test that tells them
  apart is **does it still fail on a fresh run**, and for a persistent one,
  **does it fail with your changes stashed**. If it fails without your work in
  the tree, it is not your work.

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
- **A test that passes without the fix proves nothing.** Put the bug back,
  confirm the test fails, then restore. It is a minute's work and it keeps
  earning: the old title layout failed 9 of 33 phone shapes, the over-long
  results line failed all 33 at "719 wide", and the shipped update-check guard
  failed three of `tests/update.js`'s six checks -- each of those is why the
  guard around it can be trusted.
- **When that check shows a test is weak, say so in the test.** The night's
  first "cleared and angry never overlap" sweep passed happily with the grass
  rule reverted: a bot has to be caught twice by the same cleared house in one
  night, which is rare. The sweep was kept, because it still catches some
  *other* path turning a cleared house angry, but it now says in its own
  comment that it does not guard the grass rule and points at the contrived
  case beside it that does. A sweep that reads like a guard and is not one is
  worse than no sweep -- it is where the next session stops looking.
- **Comments explain why**, especially for anything learnt from a playtest.
  Match that density and tone.
- **Commits**: one clear subject line, then a body that says what was wrong or
  wanted and why this fixes it.

## Preview before shipping

- Changes meant for testers go to the Claude artifact preview first, not
  straight to `main`. Publish the change there, say what to
  try, and wait for the user to say "ship it" before pushing to
  `main` (it's live on testers' phones via GitHub Pages).
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
- **Close an issue with evidence**: a comment naming the commit that fixed it
  and how it was verified, not just a state change. The backlog is only worth
  keeping if a closed issue says what made it closable.
- Labels: `playtest`, `review`, `bug`, `idea`, `refactor`.

## Code review

- Suggest a `/code-review` (high) at the end of each refactor phase, before
  merging a branch into `main`, and after a new
  street, minigame or scoring change.
- Review only the commits since the last review, and update the marker below
  after each one.
- Report findings first; fix only what the user picks. Don't push review
  fixes to `main` without asking: it's live on testers'
  phones.
- Small visual tweaks don't need a review; the golden and screenshot tests
  cover them.

last reviewed: `82ed815` (walking routes phase 3, `5edf3cf..82ed815`, high,
3 findings; all 3 fixed in the commit after it -- validateStreet throwing a
TypeError on a misshapen `paths` instead of reporting it, the fox's mooch
walking through the houses up a cul-de-sac, and the scenery check never
learning about runs of road, which refused a legal street. A guard that the
fox's patrol line is walkable end to end came with them: nothing checked it,
which is how the mooch bug got in.)
before that: `1e2eddb` (everything since the night's second pass, including
two commits that had shipped unreviewed, `b5ed7b3..1e2eddb`, high, 10 findings;
9 fixed in `8320a8b` -- a RUN bar frozen through the owner's pickup, the
full-meter rule living in three places, a rank test that guarded nothing, an
update test with a fixed sleep and a silent skip, the bot loop copied into the
labs, and a stale install description -- and 1 filed as #38).
before that: `b5ed7b3` (the night's second pass, `e0b35c6..b5ed7b3`, high,
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
  rather than guessing in successive pushes. **Render the thing before
  arguing about it.** "Everything gets too small to read" was the reason a
  street wider than one road looked impossible; Marrow Street drawn at 60%
  and 50% took five minutes to produce and showed it was fine, which turned a
  large piece of work (houses drawn facing up a horizontal road) into a small
  one (one `ctx.scale`).
- **Put the bug back, then check you measured the right thing.** The run-away
  test passed with its bug restored: it asked whether the cat ended up near
  its own road, and a cat setting off DOWN that road towards the alley is at
  much the same x as one stepping ACROSS it. The two only part in y. A test
  can be aimed at the right behaviour and still measure a quantity that both
  the fix and the bug produce.
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
- A docs-only commit to `main` skips the restamp
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
