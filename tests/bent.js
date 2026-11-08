/*
 * Bent Lane: a street that is not one straight road, for exercising walking
 * routes. A run of road down the page, a short cut-through near the bottom,
 * and a cul-de-sac that comes back up the far side of a block of houses.
 *
 *   main (roadX 0.50)        close (roadX 0.76)
 *   row 0  0 Pike's
 *   row 1  1 Old Harrow   3 The Larks   |   5 Wren Cottage
 *   row 2  2 No. 4                      |   6 The Fennings
 *   row 3                4 Miss Alder   |
 *   row 4        <--- cross --->
 *
 * The point of the shape: Pike's bowl and Wren Cottage's bowl are close to
 * each other as the crow flies, and the straight line between them runs
 * through the block in the middle -- ground nothing walks on. The only way
 * across is down to the cut-through at the bottom and back up the far side.
 * A character that arrives at Wren Cottage without having been near row 4 has
 * walked through somebody's kitchen.
 *
 * `cross` carries no roadX of its own: it is a crossing, not a run of road, so
 * nothing fronts it and it has no pavement for a bowl.
 *
 * Nothing draws this street. The renderer still paints one straight road (see
 * #7 phase 3b), so Bent Lane is a rules fixture and is deliberately not in
 * C.STREETS.
 *
 * Known wart, kept on purpose: `col`/`row` are a flat grid, and makeNoise
 * measures a clatter's reach across it, so a bowl on `main` and one on `close`
 * read as closer than the walk between them. Sight lines are unaffected --
 * they come from the explicit neighbour lists. Noise by route distance is a
 * follow-up, not part of phase 3.
 *
 * JSON-clean, so a test page can be handed it as data.
 */
module.exports = {
  name: 'Bent Lane', rows: 5, roadX: 0.5,
  paths: {
    stretches: [
      { id: 'main',  roadX: 0.5,  x: [0.2612, 0.7388], y: [0.2, 4.8] },
      { id: 'cross',              x: [0.60,   0.90],   y: [4.2, 4.6] },
      { id: 'close', roadX: 0.76, x: [0.78,   0.9988], y: [1.0, 4.6] },
    ],
    links: [
      { a: 'main',  b: 'cross' },
      { a: 'cross', b: 'close' },
    ],
  },
  catStart: { x: 0.5, y: 2.5 },
  houses: [
    { name: 'Pike\'s',       col: 0, row: 0, side: -1, bowl: { x: 0.29, y: 0.5 }, neighbours: [1] },
    { name: 'Old Harrow',    col: 0, row: 1, side: -1, bowl: { x: 0.29, y: 1.5 }, neighbours: [0, 2, 3] },
    { name: 'No. 4',         col: 0, row: 2, side: -1, bowl: { x: 0.29, y: 2.5 }, neighbours: [1, 4] },
    { name: 'The Larks',     col: 1, row: 1, side:  1, bowl: { x: 0.71, y: 1.5 }, neighbours: [1, 4] },
    { name: 'Miss Alder',    col: 1, row: 3, side:  1, bowl: { x: 0.71, y: 3.5 }, neighbours: [2, 3] },
    /* up the cul-de-sac: level with The Larks, and a long walk from it */
    { name: 'Wren Cottage',  col: 3, row: 1, side:  1, bowl: { x: 0.95, y: 1.5 }, neighbours: [6], on: 'close' },
    { name: 'The Fennings',  col: 3, row: 2, side:  1, bowl: { x: 0.95, y: 2.5 }, neighbours: [5], on: 'close' },
  ],
  dog: { x: 0.5, ends: [-0.6, 5.6], overrun: 0.2 },
  fox: { x: 0.5, ends: [-0.6, 5.6], patrol: { y: [0.3, 4.7], speed: 0.3 } },
};
