/**
 * Biquadris browser adaptation.
 * Pure, dependency-free game model: advancing time never moves a piece.
 * Coordinates are [column, row], with row zero at the top of the board.
 */
export const COLS = 11;
export const ROWS = 18;
export const RESERVE_ROWS = 3;
export const SHAPES = Object.freeze({
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  T: [[0, 0], [1, 0], [2, 0], [1, 1]],
});
export const COMMANDS = Object.freeze([
  { command: 'left / right / down', example: '3right', effect: 'Move one cell; a numeric prefix repeats the action.' },
  { command: 'clockwise / counterclockwise', example: 'cw', effect: 'Rotate around the bottom-left of the bounding box; no wall kicks.' },
  { command: 'drop', example: 'drop', effect: 'Land and lock the piece, clear full rows, then hand over the turn.' },
  { command: 'levelup / leveldown', example: 'levelup', effect: 'Change the active player’s difficulty, from 0 to 4.' },
  { command: 'blind / heavy / force <piece>', example: 'force I', effect: 'After clearing 2+ rows in a duel, choose an attack before the other turn.' },
  { command: 'I / J / L / O / S / Z / T', example: 'T', effect: 'Replace your current piece at its spawn point; a testing command from the original game.' },
  { command: 'norandom <pieces> / random', example: 'norandom I O T', effect: 'At level 3 or 4, loop an inline piece sequence or restore weighted randomness.' },
  { command: 'sequence <commands>', example: 'sequence 3right; cw; drop', effect: 'Run semicolon-separated commands on your current turn.' },
  { command: 'restart', example: 'restart', effect: 'Clear the boards, keeping current levels, the original seed and the session high score.' },
]);

const DEFAULT_SEQUENCES = ['IJLOSTZILTSJOZ', 'ZOTSJILTZJOSLI'];
const WEIGHTS = { 1: 'IJLOSTZIJLOT', 2: 'IJLOSTZ', 3: 'IJLOSTZSZ', 4: 'IJLOSTZSZ' };
const COMMAND_NAMES = ['left', 'right', 'down', 'drop', 'clockwise', 'counterclockwise', 'levelup', 'leveldown', 'restart', 'blind', 'heavy', 'force', 'norandom', 'random', 'sequence', 'help'];
const ALIASES = { cw: 'clockwise', cc: 'counterclockwise', ccw: 'counterclockwise', rotate: 'clockwise', l: 'left', r: 'right' };
const clone = (value) => JSON.parse(JSON.stringify(value));
const emptyGrid = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

function seedNumber(value) {
  let result = 2166136261;
  for (const char of String(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

function parseCommand(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { error: 'Enter a command, for example 3right, cw or drop.' };
  const match = /^(\d*)\s*([a-z]+)(?:\s+(.*))?$/i.exec(raw);
  if (!match) return { error: 'Use a command with an optional numeric prefix: 3right, clockwise or force T.' };
  const [, digits, word, argument = ''] = match;
  const count = digits === '' ? 1 : Number(digits);
  if (!Number.isSafeInteger(count) || count > 100) return { error: 'Use a multiplier between 0 and 100.' };
  // Uppercase tetromino commands remain distinct from lowercase abbreviations.
  if (word.length === 1 && SHAPES[word]) return { action: 'replace', type: word, count, argument };
  const token = word.toLowerCase();
  if (ALIASES[token]) return { action: ALIASES[token], count, argument };
  if (COMMAND_NAMES.includes(token)) return { action: token, count, argument };
  const matches = COMMAND_NAMES.filter((name) => name.startsWith(token));
  if (matches.length === 1) return { action: matches[0], count, argument };
  if (matches.length > 1) return { error: `“${word}” is ambiguous: ${matches.join(', ')}. Type a longer prefix.` };
  return { error: `Unknown command “${word}”. Try left, right, down, cw, drop or help.` };
}

export class Biquadris {
  constructor({ mode = 'practice', level = 0, seed = 123, sequences = DEFAULT_SEQUENCES } = {}) {
    this.mode = mode === 'duel' ? 'duel' : 'practice';
    this.seed = seed;
    this.sequences = sequences.map((sequence, index) => {
      const cleaned = String(sequence).toUpperCase().replace(/\s/g, '');
      return /^[IJLOSTZ]+$/.test(cleaned) ? cleaned : DEFAULT_SEQUENCES[index % 2];
    });
    this._initialLevel = Math.min(4, Math.max(0, Math.trunc(Number(level) || 0)));
    this._id = 0;
    this.reset({ level: this._initialLevel });
  }

  get state() { return this.snapshot(); }

  snapshot() {
    return clone({ mode: this.mode, seed: this.seed, players: this.players, active: this.active,
      pendingAttack: this.pendingAttack, gameOver: this.gameOver, winner: this.winner,
      lastResult: this.lastResult, turns: this.turns });
  }

  reset({ mode = this.mode, level, seed = this.seed } = {}) {
    const prior = this.players;
    this.mode = mode === 'duel' ? 'duel' : 'practice';
    this.seed = seed;
    this._id = 0;
    this.active = 0;
    this.pendingAttack = null;
    this.gameOver = false;
    this.winner = null;
    this.turns = 0;
    this.players = [0, 1].map((index) => {
      const startingLevel = level === undefined ? (prior?.[index]?.level ?? this._initialLevel) : Math.min(4, Math.max(0, Math.trunc(Number(level) || 0)));
      return { name: `Player ${index + 1}`, grid: emptyGrid(), current: null, next: null,
        score: 0, highScore: prior?.[index]?.highScore ?? 0, level: startingLevel, lines: 0,
        gameOver: false, blind: false, heavy: false, dropsWithoutClear: 0, placed: 0,
        blocks: {}, sequenceIndex: 0, customSequence: null, customIndex: 0,
        rng: seedNumber(`${seed}:${index}`), lastClear: 0 };
    });
    for (let index = 0; index < this.players.length; index += 1) {
      const player = this.players[index];
      player.current = this._spawn(this._generate(index));
      player.next = this._generate(index);
    }
    return this._result(true, 'New game. No timer: move, rotate, then drop when ready.', { action: 'restart' });
  }

  ghost(index = this.active) {
    const player = this.players[index];
    if (!player?.current || player.gameOver) return [];
    let cells = player.current.cells.map(([x, y]) => [x, y]);
    while (this._valid(player, cells.map(([x, y]) => [x, y + 1]))) cells = cells.map(([x, y]) => [x, y + 1]);
    return cells;
  }

  /** Blind coordinates use playable rows 3–12, below the three reserve rows. */
  isBlindCell(index, x, y) {
    return Boolean(this.players[index]?.blind && x >= 2 && x <= 8 && y >= 5 && y <= 14);
  }

  act(action) { return this.execute(action); }

  execute(input) {
    const parsed = parseCommand(input);
    if (parsed.error) return this._result(false, parsed.error);
    const { action, count, argument, type } = parsed;
    if (action === 'help') return this._result(true, 'Move: left/right/down. Rotate: cw/ccw. Lock: drop. Repeat: 3right. Difficulty: levelup/leveldown. Reset: restart.', { action, help: COMMANDS });
    if (action === 'restart') {
      if (count !== 1 || argument) return this._result(false, 'restart takes no multiplier or arguments.');
      return this.reset();
    }
    if (this.gameOver) return this._result(false, `${this._gameOverMessage()} Type restart to play again.`);
    if (['blind', 'heavy', 'force'].includes(action)) {
      if (count !== 1) return this._result(false, 'An attack takes no multiplier.');
      return this._attack(action, argument);
    }
    if (this.pendingAttack) return this._result(false, `Player ${this.pendingAttack.from + 1} earned an attack. Choose blind, heavy or force I/J/L/O/S/Z/T first.`);
    if (action === 'sequence') {
      if (count !== 1) return this._result(false, 'sequence takes no multiplier.');
      return this._sequence(argument);
    }
    if (action === 'norandom' || action === 'random') {
      if (count !== 1) return this._result(false, 'random and norandom take no multiplier.');
      return this._randomMode(action, argument);
    }
    if (argument) return this._result(false, `${action} takes no arguments. Try 3${action} to repeat it.`);
    if (count === 0) return this._result(true, 'Multiplier 0: no action performed.', { action, repetitions: 0 });
    const index = this.active;
    const player = this.players[index];
    let moved = 0;
    let locks = 0;
    let cleared = 0;
    let attackRows = 0;
    let obstacle = false;
    const beforeScore = player.score;
    for (let step = 0; step < count; step += 1) {
      if (this.gameOver) break;
      if (action === 'levelup' || action === 'leveldown') {
        player.level = Math.min(4, Math.max(0, player.level + (action === 'levelup' ? 1 : -1)));
        continue;
      }
      if (action === 'replace') {
        const replacement = this._spawn({ type, level: player.level });
        if (!this._valid(player, replacement.cells)) return this._result(false, `${type} cannot spawn here. Your current piece is unchanged.`, { action });
        player.current = replacement;
        moved += 1;
        continue;
      }
      if (action === 'drop') {
        player.current.cells = this.ghost(index);
        const locked = this._lock(index);
        locks += 1;
        cleared += locked.lines;
        attackRows = Math.max(attackRows, locked.lines);
        obstacle ||= locked.obstacle;
        continue;
      }
      const movement = this._move(index, action);
      moved += movement.moved ? 1 : 0;
    }
    // A multiplier repeats the requested action. Native level-3/4 weight is
    // applied once after the whole command, rather than once per repetition.
    if (!locks && !this.gameOver && player.level >= 3 && ['left', 'right', 'down', 'clockwise', 'counterclockwise'].includes(action)) this._translate(player, 0, 1);
    // The brief does not specify multiplied attack-heavy movement separately.
    // This adaptation consistently treats it as two extra cells per issued
    // horizontal command, after native level weight, including a blocked move.
    if (!locks && !this.gameOver && player.heavy && ['left', 'right'].includes(action)) {
      for (let extra = 0; extra < 2; extra += 1) {
        if (!this._translate(player, 0, 1)) {
          const locked = this._lock(index);
          locks += 1;
          cleared += locked.lines;
          attackRows = Math.max(attackRows, locked.lines);
          obstacle ||= locked.obstacle;
          break;
        }
      }
    }
    if (locks && !this.gameOver) this._finishTurn(index, attackRows);
    const scoreDelta = player.score - beforeScore;
    let message;
    if (action === 'levelup' || action === 'leveldown') message = `Player ${index + 1}: level ${player.level}. New pieces use this level; existing pieces keep their creation level.`;
    else if (locks) {
      message = `${locks > 1 ? `${locks} pieces` : 'Piece'} locked. ${cleared ? `${cleared} row${cleared === 1 ? '' : 's'} cleared, +${scoreDelta} points.` : 'No rows cleared.'}`;
      if (obstacle) message += ' Level 4: five drops without a clear added a center obstacle.';
      if (this.pendingAttack) message += ' Choose blind, heavy or force <piece>.';
      else if (this.mode === 'duel' && !this.gameOver) message += ` Player ${this.active + 1}’s turn.`;
    } else if (action === 'replace') message = `Current piece replaced with ${type} at its spawn point.`;
    else message = moved ? `${action}: ${moved} of ${count} action${count === 1 ? '' : 's'} moved the piece${player.level >= 3 ? '; level 3/4 also attempts one cell down after the command' : ''}.` : `${action} blocked by the board edge or settled cells${player.level >= 3 ? '; level 3/4 still attempts one cell down' : ''}.`;
    if (this.gameOver) message += ` ${this._gameOverMessage()}`;
    return this._result(true, message, { action, repetitions: count, moved, locked: locks > 0, locks, lines: cleared, scoreDelta, obstacle });
  }

  _generate(index) {
    const player = this.players[index];
    let type;
    if (player.level === 0) {
      const sequence = this.sequences[index] || DEFAULT_SEQUENCES[index];
      type = sequence[player.sequenceIndex++ % sequence.length];
    } else if (player.level >= 3 && player.customSequence) {
      type = player.customSequence[player.customIndex++ % player.customSequence.length];
    } else {
      player.rng = (Math.imul(player.rng, 1664525) + 1013904223) >>> 0;
      const weights = WEIGHTS[player.level];
      type = weights[Math.floor((player.rng / 4294967296) * weights.length)];
    }
    return { type, level: player.level };
  }

  _spawn(piece) {
    const bottom = Math.max(...SHAPES[piece.type].map(([, y]) => y));
    return { ...piece, id: ++this._id, cells: SHAPES[piece.type].map(([x, y]) => [x, y + RESERVE_ROWS - bottom]) };
  }

  _valid(player, cells) {
    return cells.length > 0 && cells.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < COLS && y >= 0 && y < ROWS && !player.grid[y][x]);
  }

  _translate(player, dx, dy) {
    const cells = player.current.cells.map(([x, y]) => [x + dx, y + dy]);
    if (!this._valid(player, cells)) return false;
    player.current.cells = cells;
    return true;
  }

  _rotate(player, clockwise) {
    const cells = player.current.cells;
    const left = Math.min(...cells.map(([x]) => x));
    const top = Math.min(...cells.map(([, y]) => y));
    const bottom = Math.max(...cells.map(([, y]) => y));
    const width = Math.max(...cells.map(([x]) => x)) - left + 1;
    const height = bottom - top + 1;
    const rotated = cells.map(([x, y]) => {
      const relativeX = x - left;
      const relativeY = y - top;
      const newX = clockwise ? height - 1 - relativeY : relativeY;
      const newY = clockwise ? relativeX : width - 1 - relativeX;
      return [left + newX, bottom - width + 1 + newY];
    });
    if (!this._valid(player, rotated)) return false;
    player.current.cells = rotated;
    return true;
  }

  _move(index, action) {
    const player = this.players[index];
    let moved;
    if (action === 'left') moved = this._translate(player, -1, 0);
    else if (action === 'right') moved = this._translate(player, 1, 0);
    else if (action === 'down') moved = this._translate(player, 0, 1);
    else if (action === 'clockwise' || action === 'counterclockwise') moved = this._rotate(player, action === 'clockwise');
    else return { moved: false };
    return { moved, locked: false };
  }

  _clearRows(player) {
    const remaining = player.grid.filter((row) => !row.every(Boolean));
    const lines = ROWS - remaining.length;
    if (!lines) return 0;
    player.grid = [...Array.from({ length: lines }, () => Array(COLS).fill(null)), ...remaining];
    player.lines += lines;
    player.score += (player.level + lines) ** 2;
    const present = new Set(player.grid.flat().filter(Boolean).map((cell) => cell.id));
    for (const [id, block] of Object.entries(player.blocks)) {
      if (!present.has(Number(id))) {
        player.score += (block.level + 1) ** 2;
        delete player.blocks[id];
      }
    }
    player.highScore = Math.max(player.highScore, player.score);
    return lines;
  }

  _lock(index) {
    const player = this.players[index];
    const piece = player.current;
    if (!piece || !this._valid(player, piece.cells)) {
      this._lose(index);
      return { lines: 0, obstacle: false };
    }
    for (const [x, y] of piece.cells) player.grid[y][x] = { type: piece.type, id: piece.id, level: piece.level };
    player.blocks[piece.id] = { level: piece.level, type: piece.type };
    player.placed += 1;
    let lines = this._clearRows(player);
    player.dropsWithoutClear = lines ? 0 : player.dropsWithoutClear + 1;
    let obstacle = false;
    if (player.level === 4 && player.dropsWithoutClear > 0 && player.dropsWithoutClear % 5 === 0) {
      obstacle = true;
      const x = Math.floor(COLS / 2);
      // The obstacle falls from above: it cannot pass through a settled cell.
      let y = 0;
      if (player.grid[y][x]) this._lose(index);
      else {
        while (y + 1 < ROWS && !player.grid[y + 1][x]) y += 1;
        const id = ++this._id;
        player.grid[y][x] = { type: '*', id, level: 4 };
        player.blocks[id] = { level: 4, type: '*' };
        const obstacleLines = this._clearRows(player);
        lines += obstacleLines;
        if (obstacleLines) player.dropsWithoutClear = 0;
      }
    }
    player.lastClear = lines;
    player.blind = false;
    player.heavy = false;
    player.current = this._spawn(player.next);
    player.next = this._generate(index);
    if (!this._valid(player, player.current.cells)) this._lose(index);
    return { lines, obstacle };
  }

  _finishTurn(index, attackRows) {
    this.turns += 1;
    if (this.mode === 'practice') return;
    if (attackRows >= 2) this.pendingAttack = { from: index, to: 1 - index, rows: attackRows };
    else this.active = 1 - index;
  }

  _attack(action, argument) {
    if (!this.pendingAttack) return this._result(false, 'Attacks require clearing at least 2 rows in one lock during a duel.');
    const { from, to } = this.pendingAttack;
    const target = this.players[to];
    if (action !== 'force' && argument) return this._result(false, `${action} takes no arguments.`);
    if (action === 'force') {
      const type = argument.trim().toUpperCase();
      if (!SHAPES[type]) return this._result(false, 'Choose one piece: force I, J, L, O, S, Z or T.');
      target.current = this._spawn({ type, level: target.level });
      if (!this._valid(target, target.current.cells)) this._lose(to);
    } else target[action] = true;
    this.pendingAttack = null;
    this.active = to;
    const description = action === 'blind' ? 'Columns 3–9 / playable rows 3–12 are hidden until their next lock.' : action === 'heavy' ? 'Each horizontal command now attempts 2 extra cells down; blocking either cell locks the piece.' : `Their current piece is now ${target.current.type} at its spawn point.`;
    return this._result(true, `Player ${from + 1} used ${action} on Player ${to + 1}. ${description}${this.gameOver ? ` ${this._gameOverMessage()}` : ` Player ${to + 1}’s turn.`}`, { action, target: to });
  }

  _randomMode(action, argument) {
    const player = this.players[this.active];
    if (player.level < 3) return this._result(false, 'random and norandom are available at level 3 or 4.');
    if (action === 'norandom') {
      const sequence = argument.toUpperCase().replace(/\s/g, '');
      if (!/^[IJLOSTZ]+$/.test(sequence)) return this._result(false, 'Browser sequence: enter piece letters, for example norandom I O T. Local filenames are not supported.');
      player.customSequence = sequence;
      player.customIndex = 0;
    } else {
      if (argument) return this._result(false, 'random takes no arguments.');
      player.customSequence = null;
    }
    return this._result(true, action === 'random' ? 'Weighted random generation restored. The preview stays unchanged; later generated pieces use randomness.' : `Future generated pieces loop ${player.customSequence}. The current piece and preview stay unchanged.`, { action });
  }

  _sequence(argument) {
    const commands = argument.split(';').map((command) => command.trim()).filter(Boolean);
    if (!commands.length || commands.length > 100) return this._result(false, 'Enter 1–100 inline commands separated by semicolons: sequence 3right; cw; drop.');
    const parsed = commands.map(parseCommand);
    const invalid = parsed.find((command) => command.error || ['sequence', 'restart'].includes(command.action));
    if (invalid) return this._result(false, invalid.error || 'A sequence cannot contain restart or another sequence.');
    const index = this.active;
    const player = this.players[index];
    const beforeScore = player.score;
    const beforeLines = player.lines;
    const beforePlaced = player.placed;
    let performed = 0;
    let last;
    for (const command of commands) {
      if (this.gameOver || this.active !== index || this.pendingAttack) break;
      last = this.execute(command);
      performed += 1;
      if (!last.ok || last.locked) break;
    }
    return this._result(last?.ok ?? true, `Ran ${performed}/${commands.length} commands. ${last?.message ?? ''}`, {
      action: 'sequence', performed, lines: player.lines - beforeLines,
      scoreDelta: player.score - beforeScore, locks: player.placed - beforePlaced,
      locked: player.placed > beforePlaced, obstacle: Boolean(last?.obstacle),
    });
  }

  _lose(index) {
    this.players[index].gameOver = true;
    this.gameOver = true;
    this.winner = this.mode === 'duel' ? 1 - index : null;
    this.pendingAttack = null;
  }

  _gameOverMessage() {
    return this.mode === 'duel' ? `Player ${this.winner + 1} wins: the opponent cannot spawn a piece.` : 'Game over: the next piece cannot spawn.';
  }

  _result(ok, message, details = {}) {
    const result = { ok, message, ...details };
    this.lastResult = result;
    return result;
  }
}
