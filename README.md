# Bowl Bandit

A cat works one street. Eight houses, eight bowls, two minutes.

Every house on Marrow Street puts a bowl of food out for you. Lovely. But
neighbours gossip — and that's the whole game.

**[Play it](https://dondino-go.github.io/catgame/)** · or clone and open
`index.html`. No build step, no dependencies.

## Controls

| | |
|---|---|
| `WASD` / arrow keys | prowl the street |
| `Space` | start eating, then time each bite |
| walk away | stop eating |
| `Esc` | stop eating |
| `M` | mute |

## The rule

Eating is a timing minigame: a marker sweeps a bar, and you press `Space` on the
green to take a bite. Each bite the bar speeds up and the green shrinks. Miss and
the bowl clatters, which brings nearby residents to their windows.

The interesting part is *who is watching*. Every house has neighbours — the
houses either side of it, and the one directly across the road. If a neighbour of
the bowl's owner sees you eating from it, **someone stops feeding you, for good**:

- if the witness still puts a bowl out, **they** withdraw theirs
- if the witness already gave up on you, they can't withhold anything — so they
  **grass you up to the owner**, and the owner withdraws instead

The bowl's own owner never minds. They put it there for you.

You get a warning: a curtain twitches before a window opens, a watching resident
spills light onto the street (yellow if harmless, red if they can see *you* at
*this* bowl), and once you're spotted a `RUN!` bar gives you a beat to bolt
before it counts.

Every neighbour still feeding you when the whistle blows is worth **40 points**,
so stripping the street to feed faster is a losing trade. Lose all eight and the
round ends early.

## Waves

Difficulty steps at 30-second boundaries rather than creeping, so you can feel
the street turning against you.

| Wave | | Warning | Watchers | Bowl | Time to bolt |
|---|---|---|---|---|---|
| 1 | Quiet Street | 1.90s | 1 | 3 bites | 0.55s |
| 2 | Curtains Twitching | 1.45s | 2 | 4 bites | 0.42s |
| 3 | Getting Nosy | 1.05s | 3 | 5 bites | 0.30s |
| 4 | Neighbourhood Watch | 0.72s | 4 | 6 bites | 0.18s |

Wave 2 lets **a dog** loose: it barks, then bolts the length of the road while
every resident goes to the window. Get off the bowls. Wave 3 brings **a fox**
working the same street — it robs bowls one ball at a time, and it's slower than
you are, so you can beat it to one. When the clock runs out your owner comes and
carries you home.

## Tests

```sh
node tests/run.js
```

103 checks, no dependencies. The suites read `index.html` and run its `<script>`
against a stubbed canvas and DOM, so they exercise exactly the file a browser
loads.

| | |
|---|---|
| `behaviour.test.js` | the rule in all its cases, waves, dog, fox, owner ending, 9000 frames of mashing |
| `geometry.test.js` | all 64 window/bowl sight pairs, house layout, on-screen tells |
| `layout.test.js` | traces every text draw through the canvas transforms to catch overflow and collisions |
| `balance.js` | simulates rounds across five skill profiles (a report, not a test) |

`geometry.test.js` is the one to keep an eye on. The core rule is enforced by a
sight radius, so moving a window or a bowl can silently break which neighbours
can see what. It asserts every window reaches exactly its own bowl, both
same-side neighbours and the one across — and no diagonals.

## How it's built

One `index.html`: a canvas, a fixed-timestep loop, and everything drawn with
canvas primitives. Sound is a handful of oscillators, so there are no assets at
all.

Outline weight for the whole game is the single `STROKE` constant — every stroke
is scaled by it, so the line weight can be tuned from one number.

**The art is provisional.** It wants a proper design system and a real character
design; what's there now is placeholder that survived because the gameplay
mattered more.
