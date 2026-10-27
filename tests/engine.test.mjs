import test from 'node:test';
import assert from 'node:assert/strict';
import { Biquadris, COLS, ROWS, SHAPES, RESERVE_ROWS } from '../engine.js';

const occupied = (type = 'J', id = 900, level = 0) => ({ type, id, level });
const bounds = (cells) => ({ left: Math.min(...cells.map(([x]) => x)), right: Math.max(...cells.map(([x]) => x)), top: Math.min(...cells.map(([, y]) => y)), bottom: Math.max(...cells.map(([, y]) => y)) });
function piece(game, type, cells, level = 0, playerIndex = game.active) {
  const player = game.players[playerIndex];
  player.current = { type, cells: cells.map((cell) => [...cell]), level, id: ++game._id };
  return player;
}
function doubleClear(game, playerIndex = 0) {
  const player = piece(game, 'O', [[0, 16], [1, 16], [0, 17], [1, 17]], 0, playerIndex);
  for (const y of [16, 17]) for (let x = 2; x < COLS; x += 1) player.grid[y][x] = occupied();
  game.active = playerIndex;
  return game.execute('drop');
}

test('board, reserve rows, pieces and level-zero original sequences', () => {
  const game = new Biquadris({ mode: 'duel' });
  assert.equal(COLS, 11);
  assert.equal(ROWS, 18);
  assert.equal(RESERVE_ROWS, 3);
  assert.equal(Object.keys(SHAPES).length, 7);
  assert.equal(game.players[0].grid.length, 18);
  assert.ok(game.players[0].grid.every((row) => row.length === 11 && row.every((cell) => cell === null)));
  assert.equal(game.players[0].current.type, 'I');
  assert.equal(game.players[0].next.type, 'J');
  assert.equal(game.players[1].current.type, 'Z');
  assert.equal(game.players[1].next.type, 'O');
  for (const player of game.players) {
    assert.equal(bounds(player.current.cells).left, 0);
    assert.equal(bounds(player.current.cells).bottom, 3);
  }
});

test('model never applies timed gravity and snapshots cannot mutate the game', () => {
  const game = new Biquadris();
  const before = JSON.stringify(game.players[0].current);
  const snapshot = game.snapshot();
  snapshot.players[0].current.cells[0][0] = 99;
  snapshot.players[0].grid[17][0] = occupied();
  game.ghost();
  game.snapshot();
  assert.equal(JSON.stringify(game.players[0].current), before);
  assert.equal(game.players[0].grid[17][0], null);
  assert.equal(typeof game.tick, 'undefined');
});

test('seeded generation is reproducible for every random level', () => {
  for (const level of [1, 2, 3, 4]) {
    const first = new Biquadris({ level, seed: 'repeat-me' });
    const second = new Biquadris({ level, seed: 'repeat-me' });
    const different = new Biquadris({ level, seed: 'different' });
    const sample = (game) => Array.from({ length: 100 }, () => game._generate(0).type).join('');
    const sequence = sample(first);
    assert.equal(sequence, sample(second));
    assert.notEqual(sequence, sample(different));
    assert.ok([...sequence].every((type) => SHAPES[type]));
  }
});

test('movement, unique prefixes, aliases and multi-digit multipliers', () => {
  const game = new Biquadris();
  assert.equal(game.execute('3ri').ok, true);
  assert.equal(bounds(game.players[0].current.cells).left, 3);
  assert.equal(game.execute('20left').moved, 3);
  assert.equal(bounds(game.players[0].current.cells).left, 0);
  assert.equal(game.execute('do').ok, true);
  assert.equal(bounds(game.players[0].current.cells).top, 4);
  assert.equal(game.execute('c').ok, false);
  assert.match(game.lastResult.message, /ambiguous/);
  assert.equal(game.execute('101left').ok, false);
  assert.equal(game.execute('bananas').ok, false);
  assert.equal(game.execute('left extra').ok, false);
  assert.equal(game.execute('0right').repetitions, 0);
  assert.equal(game.execute('2restart').ok, false);
});

test('clockwise/anticlockwise preserve bounding-box lower-left, four turns restore', () => {
  const game = new Biquadris();
  for (const type of Object.keys(SHAPES)) {
    game.execute(type);
    const player = game.players[0];
    const original = player.current.cells.map((cell) => cell.join(',')).sort();
    const anchor = bounds(player.current.cells);
    for (let i = 0; i < 4; i += 1) {
      assert.equal(game.execute('cw').moved, 1);
      assert.equal(bounds(player.current.cells).left, anchor.left);
      assert.equal(bounds(player.current.cells).bottom, anchor.bottom);
    }
    assert.deepEqual(player.current.cells.map((cell) => cell.join(',')).sort(), original);
    game.execute('cw');
    game.execute('ccw');
    assert.deepEqual(player.current.cells.map((cell) => cell.join(',')).sort(), original);
  }
});

test('rotation at a wall rejects invalid cells without wall kicks', () => {
  const game = new Biquadris();
  game.execute('cw'); // Vertical I, bottom remains row 3.
  game.execute('10right');
  const before = structuredClone(game.players[0].current.cells);
  const result = game.execute('cw');
  assert.equal(result.moved, 0);
  assert.deepEqual(game.players[0].current.cells, before);
});

test('ghost rests on stack without changing live piece, down never locks', () => {
  const game = new Biquadris();
  game.players[0].grid[12][0] = occupied();
  const current = structuredClone(game.players[0].current.cells);
  assert.equal(bounds(game.ghost()).bottom, 11);
  assert.deepEqual(game.players[0].current.cells, current);
  game.execute('20down');
  assert.equal(bounds(game.players[0].current.cells).bottom, 11);
  assert.equal(game.players[0].placed, 0);
  game.execute('drop');
  assert.equal(game.players[0].grid[11][0].type, 'I');
  assert.equal(game.players[0].placed, 1);
});

test('consecutive full rows clear together and receive line plus creation-level bonus', () => {
  const game = new Biquadris({ level: 3 });
  const player = piece(game, 'O', [[0, 16], [1, 16], [0, 17], [1, 17]], 2);
  for (const y of [16, 17]) for (let x = 2; x < COLS; x += 1) player.grid[y][x] = occupied('J', 900, 1);
  player.blocks[900] = { type: 'J', level: 1 };
  const result = game.execute('drop');
  assert.equal(result.lines, 2);
  assert.equal(result.scoreDelta, (3 + 2) ** 2 + (2 + 1) ** 2 + (1 + 1) ** 2);
  assert.equal(player.score, 38);
  assert.equal(player.lines, 2);
  assert.equal(player.highScore, 38);
  assert.ok(player.grid.every((row) => row.every((cell) => cell === null)));
});

test('partly erased blocks keep identity across row shifts; bonus awarded only once', () => {
  const game = new Biquadris();
  const player = game.players[0];
  player.blocks[77] = { type: 'O', level: 2 };
  for (const y of [16, 17]) for (const x of [0, 1]) player.grid[y][x] = occupied('O', 77, 2);
  for (let x = 2; x <= 6; x += 1) player.grid[17][x] = occupied('J', 900);
  piece(game, 'I', [[7, 17], [8, 17], [9, 17], [10, 17]]);
  assert.equal(game.execute('drop').scoreDelta, 2); // One row + the new I only.
  assert.ok(player.blocks[77]);
  assert.equal(player.grid[17][0].id, 77);
  for (let x = 2; x <= 6; x += 1) player.grid[17][x] = occupied('J', 900);
  piece(game, 'I', [[7, 17], [8, 17], [9, 17], [10, 17]]);
  assert.equal(game.execute('drop').scoreDelta, 11); // Row + new I + original O at creation level 2.
  assert.equal(player.blocks[77], undefined);
  assert.equal(player.score, 13);
});

test('levels change 0–4, preserve queued creation level, native heaviness once per command', () => {
  const game = new Biquadris();
  assert.equal(game.execute('10levelup').ok, true);
  assert.equal(game.players[0].level, 4);
  assert.equal(game.players[0].current.level, 0);
  assert.equal(game.players[0].next.level, 0);
  const before = bounds(game.players[0].current.cells);
  game.execute('3right');
  const after = bounds(game.players[0].current.cells);
  assert.equal(after.left, before.left + 3);
  assert.equal(after.top, before.top + 1);
  game.execute('cw');
  assert.equal(bounds(game.players[0].current.cells).bottom, after.bottom + 1);
  game.execute('10leveldown');
  assert.equal(game.players[0].level, 0);
});

test('native level-three weight includes down, follows whole multiplier and never auto-locks', () => {
  const normal = new Biquadris({ level: 0 });
  const heavy = new Biquadris({ level: 3 });
  const before = bounds(heavy.players[0].current.cells).bottom;
  normal.execute('3down');
  heavy.execute('3down');
  assert.equal(bounds(normal.players[0].current.cells).bottom, 6);
  assert.equal(bounds(heavy.players[0].current.cells).bottom, before + 4);
  const unchanged = structuredClone(heavy.players[0].current.cells);
  heavy.execute('0down');
  assert.deepEqual(heavy.players[0].current.cells, unchanged);
  const id = heavy.players[0].current.id;
  heavy.execute('100down');
  assert.equal(bounds(heavy.players[0].current.cells).bottom, 17);
  assert.equal(heavy.players[0].current.id, id);
  assert.equal(heavy.players[0].placed, 0);
  assert.equal(heavy.gameOver, false);
});

test('practice stays on player one; duel alternates on lock, multi-drop belongs to one player', () => {
  const practice = new Biquadris();
  practice.execute('drop');
  assert.equal(practice.active, 0);
  const duel = new Biquadris({ mode: 'duel' });
  duel.execute('right');
  assert.equal(duel.active, 0);
  const result = duel.execute('2drop');
  assert.equal(result.locks, 2);
  assert.equal(duel.players[0].placed, 2);
  assert.equal(duel.players[1].placed, 0);
  assert.equal(duel.active, 1);
  duel.execute('drop');
  assert.equal(duel.active, 0);
});

test('two-row clear offers exactly one attack and blocks commands until selection', () => {
  const game = new Biquadris({ mode: 'duel' });
  assert.equal(doubleClear(game).lines, 2);
  assert.deepEqual(game.pendingAttack, { from: 0, to: 1, rows: 2 });
  assert.equal(game.active, 0);
  assert.equal(game.execute('right').ok, false);
  assert.equal(game.execute('force potato').ok, false);
  assert.ok(game.pendingAttack);
  assert.equal(game.execute('blind').ok, true);
  assert.equal(game.active, 1);
  assert.equal(game.pendingAttack, null);
  assert.equal(game.execute('heavy').ok, false);
});

test('blind masks only intended playable region and expires on affected player lock', () => {
  const game = new Biquadris({ mode: 'duel' });
  doubleClear(game);
  game.execute('blind');
  assert.equal(game.players[1].blind, true);
  for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) assert.equal(game.isBlindCell(1, x, y), x >= 2 && x <= 8 && y >= 5 && y <= 14);
  game.execute('right');
  assert.equal(game.players[1].blind, true);
  game.execute('drop');
  assert.equal(game.players[1].blind, false);
});

test('heavy adds two down after horizontal movement, auto-locks when either step blocks', () => {
  const game = new Biquadris({ mode: 'duel' });
  doubleClear(game);
  game.execute('heavy');
  const player = game.players[1];
  const initialBottom = bounds(player.current.cells).bottom;
  game.execute('3right');
  assert.equal(bounds(player.current.cells).bottom, initialBottom + 2);
  assert.equal(bounds(player.current.cells).left, 3);
  piece(game, 'I', [[0, 16], [1, 16], [2, 16], [3, 16]], 0, 1);
  const result = game.execute('right');
  assert.equal(result.locked, true);
  assert.equal(player.grid[17][1].type, 'I');
  assert.equal(player.heavy, false);
  assert.equal(game.active, 0);
});

test('native level weight and attack-heavy effects stack once after multiplied horizontal command', () => {
  const game = new Biquadris({ mode: 'duel', level: 3 });
  doubleClear(game);
  game.execute('heavy');
  const player = game.players[1];
  const before = bounds(player.current.cells);
  game.execute('3right');
  const after = bounds(player.current.cells);
  assert.equal(after.left, before.left + 3);
  assert.equal(after.bottom, before.bottom + 3); // Native one + attack two.
});

test('force replaces opponent current piece at spawn, obstruction immediately loses duel', () => {
  const game = new Biquadris({ mode: 'duel' });
  doubleClear(game);
  const queued = game.players[1].next.type;
  assert.equal(game.execute('force T').ok, true);
  assert.equal(game.players[1].current.type, 'T');
  assert.equal(game.players[1].next.type, queued);
  assert.equal(bounds(game.players[1].current.cells).bottom, 3);
  const blocked = new Biquadris({ mode: 'duel' });
  doubleClear(blocked);
  blocked.players[1].grid[3][0] = occupied();
  const result = blocked.execute('force I');
  assert.equal(result.ok, true);
  assert.equal(blocked.gameOver, true);
  assert.equal(blocked.players[1].gameOver, true);
  assert.equal(blocked.winner, 0);
  assert.match(result.message, /wins/);
});

test('level four center obstacle falls from above after five no-clear locks', () => {
  const game = new Biquadris({ level: 4 });
  const player = game.players[0];
  player.dropsWithoutClear = 4;
  player.grid[10][5] = occupied('J', 900);
  piece(game, 'O', [[0, 16], [1, 16], [0, 17], [1, 17]], 4);
  const result = game.execute('drop');
  assert.equal(result.obstacle, true);
  assert.equal(player.grid[9][5].type, '*');
  assert.equal(player.grid[17][5], null); // Cannot teleport through row-10 obstacle.
  assert.equal(player.dropsWithoutClear, 5);
});

test('line clear resets level-four no-clear counter and suppresses center obstacle', () => {
  const game = new Biquadris({ level: 4 });
  game.players[0].dropsWithoutClear = 4;
  assert.equal(doubleClear(game).obstacle, false);
  assert.equal(game.players[0].dropsWithoutClear, 0);
});

test('blocked next spawn ends practice and restart restores seed, level and session high score', () => {
  const game = new Biquadris({ level: 1, seed: 44 });
  const original = [game.players[0].current.type, game.players[0].next.type];
  const player = game.players[0];
  game.execute('7right');
  const nextSpawn = game._spawn(player.next);
  const [x, y] = nextSpawn.cells[0];
  player.grid[y][x] = occupied();
  player.highScore = 99;
  assert.equal(game.execute('drop').ok, true);
  assert.equal(game.gameOver, true);
  assert.equal(game.execute('right').ok, false);
  assert.equal(game.execute('restart').ok, true);
  assert.equal(game.gameOver, false);
  assert.equal(game.players[0].score, 0);
  assert.equal(game.players[0].highScore, 99);
  assert.equal(game.players[0].level, 1);
  assert.deepEqual([game.players[0].current.type, game.players[0].next.type], original);
  assert.ok(game.players[0].grid.every((row) => row.every((cell) => cell === null)));
});

test('inline sequence and custom piece sequence give clear browser-specific errors', () => {
  const game = new Biquadris({ level: 3 });
  assert.equal(game.execute('norandom pieces.txt').ok, false);
  assert.equal(game.execute('norandom I O T').ok, true);
  assert.deepEqual(Array.from({ length: 5 }, () => game._generate(0).type), ['I', 'O', 'T', 'I', 'O']);
  assert.equal(game.execute('random').ok, true);
  assert.equal(game.players[0].customSequence, null);
  const result = game.execute('sequence 3right; cw; drop; left');
  assert.equal(result.ok, true);
  assert.equal(result.performed, 3);
  assert.equal(game.players[0].placed, 1);
  assert.equal(result.locked, true);
  assert.equal(result.locks, 1);
  assert.equal(game.execute('sequence left; rubbish').ok, false);
  assert.equal(game.execute('sequence restart').ok, false);
  assert.equal(game.execute('help').ok, true);
});

test('integrated guided lesson scores five at far right, including inline sequence results', () => {
  for (const mode of ['practice', 'duel']) {
    const game = new Biquadris({ mode, level: 0 });
    game.execute('O');
    const player = game.players[0];
    for (let y = 16; y < 18; y += 1) for (let x = 0; x < 9; x += 1) player.grid[y][x] = occupied('J', -1 - x - y * 11);
    player.blocks = {};
    const result = game.execute('sequence 9right; drop');
    assert.equal(result.ok, true);
    assert.equal(result.performed, 2);
    assert.equal(result.lines, 2);
    assert.equal(result.scoreDelta, 5);
    assert.equal(result.locked, true);
    assert.equal(player.score, 5);
    assert.equal(player.lines, 2);
    assert.ok(player.grid.every((row) => row.every((cell) => cell === null)));
    assert.equal(Boolean(game.pendingAttack), mode === 'duel');
    assert.equal(game.active, 0);
  }
});
