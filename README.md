# Bowl Bandit

A cat raids the food bowls on a street of nosy neighbours. Every house puts a
bowl out for you. Lovely. But neighbours gossip, and that's the whole game.

**[Play it](https://dondino-go.github.io/catgame/)** on your phone. It is a
portrait game made for touch, and once you add it to your home screen it opens
with no signal and picks up new builds by itself. Plain HTML, CSS and
JavaScript on one canvas: no build step, no dependencies.

## How to play

| | |
|---|---|
| **tap a house** | the cat walks to its bowl and sits down |
| **tap** | take a bite, when the marker is in the green |
| **swipe sideways** | run away from the bowl |

Eating is timing: a marker sweeps a bar, and you tap on the green. Each bite the
bar speeds up and the green shrinks. Miss and the bowl clatters, which is noisy.

The interesting part is *who is watching*. Every house has neighbours: the houses
either side of it, and the one across the road. A curtain twitches before a
neighbour comes to the window, and a window that is lit and looking at your bowl
means **leave now**. Being caught shuts that house for a while, and the second
catch at the same house ends it for good.

(Swipes are sideways only, because up and down belong to the phone.)

## The night

There is no countdown. Each house has **one dinner**: eat a bowl to the bottom
and that house is settled, so the street empties as you work through it and
there is no safe bowl to farm. A night ends three ways:

- **cleared**: you got a bowl from every house
- **done**: every house is settled, but some were lost
- **owner**: the attention meter filled and your owner came to carry you home

Attention drifts up slowly, jumps when a bowl clatters or you are caught, and
climbs while someone has their eyes on you. A quiet cat gets a long night; a
clumsy one gets carried home early. The verdict at the end is about how much of
the street you got. The rank is about how well you played it.

The street wakes up as you take its food, so it gets nosier the further you get:
more windows lit, a dog that barks and then bolts down the road sending every
neighbour to the window, and a fox that races you for the bowls.

## Streets

- **Marrow Street**: eight houses, two rows of four, either side of the road.
- **Terrace Row**: five brick terrace houses on a narrow road at a warm evening,
  and a pub opposite that watches every bowl once it is last orders. Reaching a
  rank on Marrow Street opens it. (Still tagged "work in progress".)

A street is a data description: where the houses are, which bowls each window can
see, how wide the road is, how it looks. The rules and the renderer both read it,
so a new street is data plus its own tests.

## Run it

Serve the folder's *parent* so the address matches GitHub Pages, then open it:

```sh
cd ..
python3 -m http.server 8123
# http://127.0.0.1:8123/catgame/
```

Add `?debug` to expose `window.__bb` for setting up scenes by hand, and
`?manual` to stop the animation timer so a test can step frames itself.

## Tests

```sh
node tests/run.js        # the rules, seeded playthroughs, both streets, the night, the entry pages
node tests/screens.js    # reference screenshots (needs Playwright)
node tests/safearea.js   # the canvas stays inside a phone's safe area
node tests/results.js    # the results screen fits on every phone shape
node tests/title.js      # the title screen fits, and PLAY always starts a round
node tests/update.js     # picking up a new build, over HTTP
node tools/simulate.js   # the balance simulator: bots of four skill levels
```

`tests/golden.test.js` replays twelve seeded nights and insists they come out
identical, so any change that alters play fails it until it is re-recorded on
purpose.

## How it's built

- `src/core.js`: the rules. No canvas, no DOM, no timers, so it runs in Node and
  in the browser and the tests drive it directly.
- `src/game.js`: the renderer and input. Everything is drawn in code, from the
  street description; sound is a handful of oscillators, so there are no assets.
- `index.html`: the page. `mobile.html` is the same page again, kept because
  phones that installed the game before it moved still launch that address.
- `manifest.webmanifest`, `sw.js`, `icons/`: the installable app. The service
  worker is network first, with the saved copy as the fallback.
- `src/version.js`: the build stamp, written by a commit hook and shown on the
  title and results screens.

The original desktop game (WASD and a two-minute round) is kept on the
`legacy-desktop` branch. Working rules for contributors, and the reasons behind
them, are in [CLAUDE.md](CLAUDE.md).

**The art is provisional.** It wants a proper design system and a real character
design; what's there now is placeholder that survived because the gameplay
mattered more.
