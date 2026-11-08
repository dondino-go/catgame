/*
 * Lamplighter Block: a street with two runs of road.
 *
 * A back lane. Two roads with a block of houses between them, back to back,
 * joined by an alley at the bottom. Eight bowls and twenty sight lines --
 * Marrow Street's exactly -- so a night here runs at the same pace and the
 * two are worth comparing; the rest of the block is placeholder buildings
 * (scenery of kind 'block'), which the rules never see.
 *
 * Width 2 means the whole street is drawn at half size, and it has eight rows
 * rather than four so it still fills the screen. That is the shape of the
 * idea: not one street squashed, but a bigger place drawn smaller.
 *
 * This is the only street where "run away onto the road you are on" means
 * anything, which is what tests/runaway.js uses it for. Nothing ships it yet
 * -- it is not in C.STREETS, and the alley has no kerbs.
 *
 * JSON-clean, so a test page can be handed it as data.
 */
module.exports = {
  name: 'Lamplighter Block', rows: 8, roadX: 0.5, width: 2,
  paths: {
    stretches: [
      { id: 'main', roadX: 0.5, x: [0.2612, 0.7388], y: [0.2, 7.8] },
      { id: 'back', roadX: 1.5, x: [1.2612, 1.7388], y: [0.2, 7.8] },
      { id: 'alley',            x: [0.5,    1.5],    y: [7.0, 7.6] },
    ],
    links: [{ a: 'main', b: 'alley' }, { a: 'alley', b: 'back' }],
  },
  catStart: { x: 0.5, y: 3.5 },
  houses: [
    { name: 'The Pemburys', col: 0, row: 0, side: -1, bowl: { x: 0.29, y: 0.5 }, neighbours: [1, 3] },
    { name: 'Old Nan',      col: 0, row: 2, side: -1, bowl: { x: 0.29, y: 2.5 }, neighbours: [0, 2, 4] },
    { name: 'The Dobsons',  col: 0, row: 4, side: -1, bowl: { x: 0.29, y: 4.5 }, neighbours: [1, 4] },
    { name: 'Mr Quill',     col: 1, row: 1, side:  1, bowl: { x: 0.71, y: 1.5 }, neighbours: [0, 4, 5] },
    { name: 'Bea & Rook',   col: 1, row: 3, side:  1, bowl: { x: 0.71, y: 3.5 }, neighbours: [1, 2, 3] },
    /* backing onto Mr Quill across the block: the one sight line that crosses it */
    { name: 'The Mullens',  col: 2, row: 1, side: -1, bowl: { x: 1.29, y: 1.5 }, neighbours: [3, 6, 7] },
    { name: 'Doctor Pye',   col: 3, row: 0, side:  1, bowl: { x: 1.71, y: 0.5 }, neighbours: [5, 7] },
    { name: 'The Ashfords', col: 3, row: 2, side:  1, bowl: { x: 1.71, y: 2.5 }, neighbours: [5, 6] },
  ],
  /* the rest of the block: buildings with nobody in them, so a gap in a row
     reads as a street rather than as a mistake */
  scenery: [
    { kind: 'block', row: 1, side: -1, on: 'main' },
    { kind: 'block', row: 3, side: -1, on: 'main' },
    { kind: 'block', row: 5, side: -1, on: 'main' },
    { kind: 'block', row: 0, side:  1, on: 'main' },
    { kind: 'block', row: 2, side:  1, on: 'main' },
    { kind: 'block', row: 4, side:  1, on: 'main' },
    { kind: 'block', row: 0, side: -1, on: 'back' },
    { kind: 'block', row: 3, side: -1, on: 'back' },
    { kind: 'block', row: 5, side: -1, on: 'back' },
    { kind: 'block', row: 1, side:  1, on: 'back' },
    { kind: 'block', row: 3, side:  1, on: 'back' },
    { kind: 'block', row: 5, side:  1, on: 'back' },
    /* down to the alley. The two middle strips stop at row 6: row 7 is where
       the alley cuts through the block. */
    { kind: 'block', row: 6, side: -1, on: 'main' },
    { kind: 'block', row: 7, side: -1, on: 'main' },
    { kind: 'block', row: 6, side:  1, on: 'main' },
    { kind: 'block', row: 6, side: -1, on: 'back' },
    { kind: 'block', row: 6, side:  1, on: 'back' },
    { kind: 'block', row: 7, side:  1, on: 'back' },
  ],
  dog: { x: 0.5, ends: [-0.6, 8.6], overrun: 0.2 },
  fox: { x: 0.5, ends: [-0.6, 8.6], patrol: { y: [0.3, 7.7], speed: 0.3 } },
};
