import { Biquadris, COLS, ROWS, SHAPES, COMMANDS } from './engine.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const game = new Biquadris({ mode: 'practice', level: 0, seed: 2462024 });
const colors = { I: '#9ae0cd', J: '#8eabd8', L: '#e2b681', O: '#d9da85', S: '#a2cd91', Z: '#d99c9b', T: '#b7a4d7', '*': '#b28b69' };
let localBest = 0;
try { localBest = Number(localStorage.getItem('biquadris-best') || 0) || 0; } catch {}
let lesson = false;
let selectedLevel = 0;
let lastDialogFocus;

const contexts = [0, 1].map((index) => {
  const canvas = $(`#board-${index}`);
  canvas.width = 660;
  canvas.height = 1080;
  const context = canvas.getContext('2d');
  context.scale(2, 2);
  const next = $(`#next-${index}`);
  next.width = 180;
  next.height = 100;
  const nextContext = next.getContext('2d');
  nextContext.scale(2, 2);
  return { context, nextContext };
});

function tile(ctx, x, y, type, size = 30, ghost = false) {
  const px = x * size;
  const py = y * size;
  const color = colors[type] || '#a5c398';
  if (ghost) {
    ctx.strokeStyle = `${color}95`;
    ctx.fillStyle = `${color}0c`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(px + 2.5, py + 2.5, size - 5, size - 5);
    ctx.fillRect(px + 2, py + 2, size - 4, size - 4);
    ctx.setLineDash([]);
    return;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(px + 1.5, py + 1.5, size - 3, size - 3, 3);
  ctx.fill();
  ctx.fillStyle = '#ffffff25';
  ctx.fillRect(px + 3, py + 3, size - 6, 3);
  ctx.fillStyle = '#0b251824';
  ctx.fillRect(px + 3, py + size - 6, size - 6, 3);
  if (size >= 25) {
    ctx.font = '8px ui-monospace, monospace';
    ctx.fillStyle = '#18302085';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(type, px + size / 2, py + size / 2 + 1);
  }
}

function drawBoard(index) {
  const p = game.players[index];
  const { context: ctx, nextContext: next } = contexts[index];
  ctx.clearRect(0, 0, 330, 540);
  ctx.fillStyle = '#0b1610';
  ctx.fillRect(0, 0, 330, 540);
  ctx.fillStyle = '#14251a';
  ctx.fillRect(0, 0, 330, 90);
  ctx.strokeStyle = '#243a2b';
  ctx.lineWidth = .5;
  for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * 30, 0); ctx.lineTo(x * 30, 540); ctx.stroke(); }
  for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * 30); ctx.lineTo(330, y * 30); ctx.stroke(); }
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#627c4b';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 90); ctx.lineTo(330, 90); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#73905c';
  ctx.textAlign = 'right';
  ctx.font = '7px ui-monospace, monospace';
  ctx.fillText('SPAWN BUFFER', 321, 11);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const cell = p.grid[y][x];
    if (cell && !game.isBlindCell(index, x, y)) tile(ctx, x, y, cell.type);
  }
  if (!p.gameOver && p.current) {
    for (const [x, y] of game.ghost(index)) if (!game.isBlindCell(index, x, y)) tile(ctx, x, y, p.current.type, 30, true);
    for (const [x, y] of p.current.cells) if (!game.isBlindCell(index, x, y)) tile(ctx, x, y, p.current.type);
  }
  if (p.blind) {
    ctx.fillStyle = '#283529';
    ctx.fillRect(60, 150, 210, 300);
    ctx.fillStyle = '#8da17b';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('BLIND', 165, 290);
    ctx.font = '7px ui-monospace, monospace';
    ctx.fillText('CLEARS AFTER YOUR DROP', 165, 308);
  }
  next.clearRect(0, 0, 90, 50);
  if (p.next) {
    const shape = SHAPES[p.next.type];
    const w = Math.max(...shape.map(([x]) => x)) + 1;
    const h = Math.max(...shape.map(([, y]) => y)) + 1;
    next.save();
    next.translate(90 - w * 17, (50 - h * 17) / 2);
    for (const [x, y] of shape) tile(next, x, y, p.next.type, 17);
    next.restore();
    $(`#next-${index}`).setAttribute('aria-label', `Next piece: ${p.next.type}`);
  }
  $(`#board-${index}`).setAttribute('aria-label', `${game.mode === 'practice' ? 'Your' : `Player ${index + 1}`} board. Score ${p.score}, level ${p.level}, ${p.lines} lines. Current ${p.current.type}, next ${p.next.type}.${p.blind ? ' Blind effect active.' : ''} Arrow keys move or rotate, Space drops, Z rotates counterclockwise.`);
}

function render() {
  const duel = game.mode === 'duel';
  $('.game-shell').classList.toggle('duel', duel);
  $('#player-1').hidden = !duel;
  $('#player-label-0').textContent = duel ? 'Player 01' : 'Your board';
  for (let index = 0; index < 2; index++) {
    const p = game.players[index];
    $(`#player-${index}`).classList.toggle('active', index === game.active && !game.gameOver);
    $(`#score-${index}`).textContent = String(p.score).padStart(3, '0');
    $(`#lines-${index}`).textContent = p.lines;
    $(`#level-${index}`).textContent = p.level;
    $(`#badge-${index}`).textContent = p.gameOver ? 'TOPPED OUT' : index === game.active ? 'PLAYING' : 'WAITING';
    const effects = [];
    if (p.blind) effects.push('BLIND');
    if (p.heavy) effects.push('HEAVY');
    $(`#effect-${index}`).textContent = effects.length ? effects.join(' + ') + ' · UNTIL DROP' : `LEVEL ${p.level} · ${['REPEATING SEQUENCE', 'WEIGHTED RANDOM', 'EQUAL CHANCE', 'HEAVY MOVEMENT', 'CENTER OBSTACLES'][p.level]}`;
    const overlay = $(`#overlay-${index}`);
    overlay.hidden = !game.gameOver;
    if (game.gameOver) {
      const won = duel && index === game.winner;
      overlay.replaceChildren();
      const title = document.createElement('strong'); title.textContent = won ? 'You win.' : 'Nice game.';
      const summary = document.createElement('p'); summary.textContent = duel ? `Player ${game.winner + 1} wins the match.` : `${p.score} points · ${p.lines} lines cleared`;
      const tip = document.createElement('span'); tip.textContent = 'Press Restart for another round.';
      overlay.append(title, summary, tip);
    }
    drawBoard(index);
    localBest = Math.max(localBest, p.score, p.highScore);
  }
  $('#best-score').textContent = localBest;
  try { localStorage.setItem('biquadris-best', String(localBest)); } catch {}
  $('#attack-panel').hidden = !game.pendingAttack;
  $('#turn-label').textContent = game.gameOver ? 'ROUND COMPLETE' : game.pendingAttack ? `PLAYER ${game.pendingAttack.from + 1} · CHOOSE AN ATTACK` : duel ? `PLAYER ${game.active + 1} · YOUR MOVE` : 'YOUR MOVE';
  $('#turn-hint').textContent = game.gameOver ? 'Use Restart to start a fresh game.' : game.pendingAttack ? 'Choose blind, heavy, or force below the boards.' : lesson ? 'Guided board: type 9right, then drop. Fill the two gaps at the bottom right.' : 'Take your time. Pieces only move when you tell them to.';
  $$('[data-command]').forEach(button => { button.disabled = game.gameOver || Boolean(game.pendingAttack) !== ['blind', 'heavy'].includes(button.dataset.command); });
  $('#force-attack').disabled = !game.pendingAttack;
  $$('[data-mode]').forEach(button => { const selected = button.dataset.mode === game.mode; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); });
}

function feedback(message, kind = '') {
  $('#feedback-text').textContent = message;
  $('#game-feedback').className = `game-feedback ${kind}`;
}

function run(command) {
  if (String(command).trim().toLowerCase() === 'help') return openDialog('Command reference', commandMarkup());
  const hadHeavy = game.players[game.active].heavy;
  const result = game.execute(command);
  if (hadHeavy && ['left','right'].includes(result.action) && !result.locked && result.ok) result.message += ' Heavy also attempts two extra rows down.';
  if (result.action === 'restart') lesson = false;
  const solvedLesson = lesson && result.lines > 0;
  if (solvedLesson) lesson = false;
  render();
  if (result.lines) {
    feedback(solvedLesson ? `Nice! ${result.lines} rows cleared. ${result.scoreDelta} points: line-clear points plus the removed piece bonus.${game.pendingAttack ? ' Now choose an attack.' : ' Keep building!'}` : result.message, 'success');
    const board = $(`#player-${game.pendingAttack?.from ?? (game.mode === 'duel' ? 1 - game.active : 0)} .board-surface`);
    board.classList.remove('board-flash');
    requestAnimationFrame(() => board.classList.add('board-flash'));
    lesson = false;
  } else feedback(result.message, result.ok ? '' : 'error');
  if (game.pendingAttack) {
    $('#attack-panel').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    $('[data-command="blind"]').focus({ preventScroll: true });
  } else if (['blind', 'heavy', 'force'].includes(result.action) && result.ok) {
    $(`#board-${game.active}`).focus({ preventScroll: true });
  }
  updateCommandPreview();
  return result;
}

function newGame(mode = game.mode, level = Number($('#start-level').value)) {
  game.reset({ mode, level });
  lesson = false;
  render();
  feedback(mode === 'duel' ? 'Two players, one keyboard. Player 1 starts. Drop a piece to pass the turn.' : `New practice game at level ${level}. Move, rotate, and drop when ready.`);
}

$$('[data-mode]').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.mode !== game.mode) newGame(button.dataset.mode);
}));
$('#start-level').addEventListener('change', () => newGame());
$('#restart').addEventListener('click', () => { run('restart'); $('#start-level').value = game.players[game.active].level; });
$$('[data-command]').forEach(button => button.addEventListener('click', () => run(button.dataset.command)));
$('#force-attack').addEventListener('click', () => run(`force ${$('#force-type').value}`));
$('#command-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#command-input');
  const value = input.value.trim();
  const result = run(value);
  if (result?.ok) input.value = '';
  updateCommandPreview();
});
$$('[data-fill]').forEach(button => button.addEventListener('click', () => {
  $('#command-input').value = button.dataset.fill;
  updateCommandPreview();
  $('#command-input').focus({ preventScroll: true });
}));

function updateCommandPreview() {
  const raw = $('#command-input').value.trim();
  if (!raw) { $('#command-preview').textContent = '3right → move the current piece three cells to the right.'; return; }
  const match = /^(\d*)\s*(\w+)(?:\s+(.*))?$/.exec(raw);
  if (!match) { $('#command-preview').textContent = 'Try a numeric prefix and command, such as 3right. Press Enter to run.'; return; }
  const n = match[1] ? Number(match[1]) : 1;
  const token = match[2].toLowerCase();
  let description;
  if (SHAPES[match[2]]) description = `replace your current piece with ${match[2]} at the spawn point (testing command)`;
  else if (/^(ri|right|r)$/.test(token)) description = `move up to ${n} cell${n === 1 ? '' : 's'} right`;
  else if (/^(lef|left|l)$/.test(token)) description = `move up to ${n} cell${n === 1 ? '' : 's'} left`;
  else if (/^(do|down)$/.test(token)) description = `move up to ${n} row${n === 1 ? '' : 's'} down`;
  else if (/^(dro|dr|drop)$/.test(token)) description = `land and lock ${n} piece${n === 1 ? '' : 's'}, clear rows, then end the turn`;
  else if (['clockwise','cw','rotate'].includes(token)) description = `rotate clockwise ${n} time${n === 1 ? '' : 's'} if there is room`;
  else if (['counterclockwise','cc','ccw'].includes(token)) description = `rotate counterclockwise ${n} time${n === 1 ? '' : 's'} if there is room`;
  else if (token.startsWith('levelu')) description = `increase this player's level by ${n}, up to 4; preview stays unchanged`;
  else if (token.startsWith('leveld')) description = `decrease this player's level by ${n}, down to 0; preview stays unchanged`;
  else if (token === 'restart') description = 'start a new round and preserve your best score';
  else if (token === 'blind') description = 'after a 2+ row clear in a duel, hide the opponent’s center until their drop';
  else if (token === 'heavy') description = 'after a 2+ row clear in a duel, add two-row descent to opponent horizontal commands';
  else if (token === 'force') description = `after a 2+ row clear, replace the opponent’s piece with ${match[3] || 'your chosen letter'}`;
  else description = 'press Enter to run. Use “All commands” for full syntax and examples';
  if (n === 0) description = 'do nothing (zero repetitions)';
  const p = game.players[game.active];
  if (n > 0 && !SHAPES[match[2]] && p.level >= 3 && ['left','right','down','do','l','r','ri','lef','cw','cc','ccw','clockwise','counterclockwise'].includes(token)) description += '; then attempt one extra row down at this level';
  if (n > 0 && p.heavy && ['left','right','l','r','ri','lef'].includes(token) && !SHAPES[match[2]]) description += '; heavy then attempts two rows down (and locks if blocked)';
  $('#command-preview').textContent = `${raw} → ${description}.`;
}
$('#command-input').addEventListener('input', updateCommandPreview);

for (const index of [0, 1]) {
  const board = $(`#board-${index}`);
  board.addEventListener('focus', () => { $('#focus-note').textContent = 'Keyboard active. Arrow keys move / rotate; Space drops; Z rotates back.'; $('#focus-note').classList.add('enabled'); });
  board.addEventListener('blur', () => { $('#focus-note').textContent = 'Click a board to enable keyboard controls. Press Tab to leave.'; $('#focus-note').classList.remove('enabled'); });
  board.addEventListener('pointerdown', () => board.focus({ preventScroll: true }));
  board.addEventListener('keydown', event => {
    const command = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'clockwise', ' ': 'drop', z: 'counterclockwise', Z: 'counterclockwise', x: 'clockwise', X: 'clockwise' }[event.key];
    if (command) { event.preventDefault(); if (event.repeat && command === 'drop') return; run(command); }
  });
}

$('#load-lesson').addEventListener('click', () => {
  game.reset({ mode: game.mode, level: 0 });
  $('#start-level').value = '0';
  game.execute('O');
  const p = game.players[0];
  // These are a clearly labeled prepared scenario. Negative IDs are fixed lesson
  // scenery, so they never award artificial completed-block bonuses.
  for (let y = 16; y < 18; y++) for (let x = 0; x < 9; x++) p.grid[y][x] = { type: ['J','S','T'][Math.floor(x / 3)], id: -1 - x - y * 11, level: 0 };
  p.blocks = {};
  lesson = true;
  render();
  $('#command-input').value = '9right';
  updateCommandPreview();
  feedback('Guided board loaded: two rows are missing a 2 × 2 square on the right. Run 9right, then drop. The O-piece will clear both rows for 5 points (4 + 1 piece bonus).');
  $('#command-input').focus({ preventScroll: true });
});

const levelNotes = [
  ['↺','Practice with a predictable sequence.','Each player loops a fixed sequence of pieces. A calm place to learn movement, rotation, and planning.'],
  ['◇','A gentler mix of random pieces.','I, J, L, O, and T each have a 1/6 chance; S and Z each have a 1/12 chance. Fewer awkward pieces, more room to experiment.'],
  ['▦','Every shape gets an equal chance.','All seven tetrominoes have a 1/7 probability. No extra movement weight, just a balanced mix and your next decision.'],
  ['⇣','The pieces start to feel heavier.','S and Z each appear with probability 2/9; the others each have 1/9. Moving or rotating also attempts one row down after the command.'],
  ['✦','Watch the center column.','Level 3 rules, plus a 1 × 1 obstacle dropped down the center after every five pieces without a clear. Clear a row to reset the counter.'],
];
function showLevel(level) {
  selectedLevel = level;
  $$('[data-level]').forEach(button => { const active = Number(button.dataset.level) === level; button.setAttribute('aria-selected', active); button.tabIndex = active ? 0 : -1; });
  const [symbol,title,description] = levelNotes[level];
  $('#level-description').setAttribute('aria-labelledby', `level-tab-${level}`);
  $('#level-description .level-symbol').textContent = symbol;
  $('#level-description h4').textContent = title;
  $('#level-description p').textContent = description;
  $('#try-level').textContent = `Play level ${level} ↗`;
}
$$('[data-level]').forEach(button => {
  button.addEventListener('click', () => showLevel(Number(button.dataset.level)));
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const level = event.key === 'Home' ? 0 : event.key === 'End' ? 4 : (Number(button.dataset.level) + (event.key === 'ArrowRight' ? 1 : 4)) % 5;
    showLevel(level); $(`#level-tab-${level}`).focus();
  });
});
$('#try-level').addEventListener('click', () => {
  $('#start-level').value = selectedLevel;
  newGame(game.mode, selectedLevel);
  $('#play').scrollIntoView({ behavior: 'smooth' });
});

function commandMarkup() {
  return `<p>Commands apply to the active player. Use a full word, a unique prefix, or <code>cw / ccw</code>. A number repeats an action: <code>3ri</code> moves up to three cells right. A blocked action keeps the piece where it is. In levels 3–4, movement/rotation also attempts one downward step after the whole command.</p><table><thead><tr><th>COMMAND</th><th>TRY THIS</th><th>RESULT</th></tr></thead><tbody>${COMMANDS.map(c => `<tr><td><code>${c.command.replaceAll('<','&lt;').replaceAll('>','&gt;')}</code></td><td><code>${c.example}</code></td><td>${c.effect}</td></tr>`).join('')}</tbody></table><p><code>0right</code> does nothing. <code>3drop</code> places three of your own pieces before passing the turn. Counts are limited to 100 per command. File-based commands use inline text in the browser; your computer’s files are never read. Movement keys are active only when a board has focus.</p>`;
}

const resources = {
  brief: ['The project brief', `<p>Biquadris is a two-player, turn-based falling-block puzzle developed for CS 246 at the University of Waterloo in Fall 2024. Each player has an independent board and controls one tetromino at a time.</p><h3>The core rules</h3><ul><li>11 columns, 15 playable rows, and 3 reserve rows for spawning.</li><li>Seven shapes: I, J, L, O, S, Z, and T. A next-piece preview supports planning.</li><li>No real-time gravity. Commands move, rotate, or drop the current piece. Higher-level and attack weight can add downward movement.</li><li>Five levels determine piece distributions and extra constraints.</li><li>Clear at least two rows in one drop to attack the other player.</li><li>Score line clears and completely removed pieces separately.</li></ul><h3>Original delivery</h3><p>The supplied C++ source includes command parsing, text and X11 graphic displays, scripted level-0 sequences, seeded randomness, restart, and special actions. This page explains the project and provides an independent web version for visitors.</p><p>Source basis: the supplied CS246 Fall 2024 Biquadris brief (7 pages), the team design report (10 pages), and the final C++ folder. The summaries are checked against the supplied final code.</p>`],
  design: ['Implementation notes', `<p>The original C++ implementation separates session coordination, player state, board rules, piece generation, and presentation.</p><h3>Where each responsibility lives</h3><table><thead><tr><th>MODULE</th><th>RESPONSIBILITY</th></tr></thead><tbody><tr><td><code>Game</code></td><td>Initialize a match, coordinate turns, and call rendering.</td></tr><tr><td><code>CommandInterpreter</code></td><td>Interpret commands, selected aliases, and repetitions.</td></tr><tr><td><code>Player</code></td><td>Own a board and track opponent effects.</td></tr><tr><td><code>Board</code></td><td>Track cells, current/next pieces, collisions, line removal, and score.</td></tr><tr><td><code>Block / createBlock</code></td><td>Represent shape geometry and centralize block construction.</td></tr><tr><td><code>Level / Level0…4</code></td><td>Generate blocks with sequences or weighted randomness.</td></tr><tr><td><code>GameDisplay</code></td><td>Common rendering interface for text and X11.</td></tr></tbody></table><h3>Design versus implementation</h3><p>The historical report describes Observer, Decorator, separate Score, and PlayerProcessor classes. Those structures are absent from the supplied final source. The implemented rendering path uses direct calls; blind and heavy use player flags. This page follows the final code rather than treating the report as an exact class map.</p><h3>What I took from the project</h3><p>My involvement spanned all core modules. The project made the relationships between state, ownership, and behavior concrete. A future C++ refactor would make ownership explicit, align documentation with the implementation, and strengthen isolated tests for scoring, rotation, and parsing.</p><p>Team credit: Chris Wu and Yan Cui.</p>`],
  web: ['About this playground', `<p>The original project was written in C++ with text and X11 interfaces. The playground is a separate, dependency-free JavaScript implementation created for this portfolio page. It runs locally in the visitor’s browser.</p><h3>Rules preserved</h3><p>Turn-based play, board dimensions, the seven shapes, next previews, five levels, line and piece scoring, and blind/heavy/force attacks follow the course brief.</p><h3>Browser additions</h3><p>Solo practice, keyboard and touch buttons, ghost projection, instant command explanations, a prepared lesson board, and a local best score make the project easy to explore. The best score is saved only on this browser. No account or analytics service is used.</p><h3>Deliberate corrections</h3><p>The adaptation follows the brief’s lower-left rotation rule, spawn alignment, piece-identity scoring, and first-top-out duel ending. The supplied C++ contains edge-case discrepancies in these areas. Movement weight applies once after a multiplied command. For attack-heavy movement, the browser consistently applies two downward steps per issued horizontal command; the brief does not separately define the multiplied case.</p><h3>Assets and data</h3><p>The hero image is AI-generated decorative artwork. It is not a game screenshot. Boards and pieces in the playground are rendered live from actual game state. The original private PDFs and C++ coursework folder are not uploaded by this page.</p>`],
};

function openDialog(title, markup) {
  lastDialogFocus = document.activeElement;
  $('#dialog-title').textContent = title;
  $('#dialog-body').innerHTML = markup;
  $('#info-dialog').showModal();
  $('#info-dialog').scrollTop = 0;
  $('#dialog-close').focus();
}
$('#command-help').addEventListener('click', () => openDialog('Command reference', commandMarkup()));
$$('[data-resource]').forEach(button => button.addEventListener('click', () => openDialog(...resources[button.dataset.resource])));
$('#dialog-close').addEventListener('click', () => $('#info-dialog').close());
$('#info-dialog').addEventListener('close', () => lastDialogFocus?.focus({ preventScroll: true }));
$('#info-dialog').addEventListener('click', event => { if (event.target === $('#info-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } });

render();
