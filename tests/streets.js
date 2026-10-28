/*
 * A street that is nothing like Marrow Street, for checking that the rules and
 * the renderer read the description rather than assume its shape: five rows,
 * the road a little left of centre, houses on each side at different rows (with
 * gaps), and neighbours that don't follow the grid, including a house whose two
 * across-the-road neighbours share a window direction.
 *
 *   left of the road     right of the road
 *   row 0  0 Pip's
 *   row 1  1 Sorrel's    4 The Hobbs
 *   row 2  2 No. 2
 *   row 3                5 Miss Vane
 *   row 4  3 Corner Shop
 *
 * JSON-clean, so a test page can be handed it as data.
 */
module.exports = {
  name: 'Test Lane', rows: 5, roadX: 0.48,
  walk: { x: [0.27, 0.69], y: [0.2, 4.8] }, catStart: { x: 0.48, y: 2.5 },
  houses: [
    { name: 'Pip\'s',       col: 0, row: 0, side: -1, bowl: { x: 0.27, y: 0.5 }, neighbours: [1] },
    { name: 'Sorrel\'s',    col: 0, row: 1, side: -1, bowl: { x: 0.27, y: 1.5 }, neighbours: [0, 2, 4] },
    { name: 'No. 2',        col: 0, row: 2, side: -1, bowl: { x: 0.27, y: 2.5 }, neighbours: [1, 3, 5] },
    { name: 'Corner Shop',  col: 0, row: 4, side: -1, bowl: { x: 0.27, y: 4.5 }, neighbours: [2, 5] },
    { name: 'The Hobbs',    col: 1, row: 1, side: 1,  bowl: { x: 0.69, y: 1.5 }, neighbours: [1, 5] },
    { name: 'Miss Vane',    col: 1, row: 3, side: 1,  bowl: { x: 0.69, y: 3.5 }, neighbours: [4, 2, 3] },
  ],
  dog: { x: 0.48, ends: [-0.6, 5.6], overrun: 0.2 },
  fox: { x: 0.48, ends: [-0.6, 5.6], patrol: { y: [0.3, 4.7], speed: 0.3 } },
};
