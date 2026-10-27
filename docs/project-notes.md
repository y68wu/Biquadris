# Biquadris — project and engineering notes

These notes explain the original C++ project and the decisions behind the [browser playground](https://y68wu.github.io/Biquadris/). They synthesize the supplied Fall 2024 CS 246 brief, team design report, and final C++ source. The historical materials were reviewed locally; the private PDFs and coursework solution files are not redistributed in this repository.

Original team: **Chris Wu and Yan Cui**. Chris contributed across all core modules. The scope described here is shared project work, without an invented division of exclusive ownership between teammates.

## The original problem

Biquadris combines familiar tetromino placement with a two-player turn structure. Each player has an independent board, current piece, preview, score, and difficulty level. A player can plan without a timer, then commit by dropping a piece. A clear of at least two rows in one lock earns an action against the opponent.

The engineering challenge is the interaction between rules: a command may move a piece, movement may trigger extra descent, extra descent may lock, a lock may clear rows and finish old pieces, and the resulting clear may require an attack before the opponent can act. Keeping these transitions coherent matters as much as drawing the blocks.

The original delivery targets **C++20** with a command interface and either text or X11 presentation. Its Makefile uses `-std=c++20` and links X11. This repository presents that work through a separate browser implementation.

## Responsibility map of the original source

The following filenames identify locally reviewed source modules. The files themselves are not part of this public repository.

| Responsibility | Original source | Role in the system |
| --- | --- | --- |
| Program entry | `main.cc` | Read startup options and initialize the game |
| Session coordination | `Game.h`, `Game.cc` | Create players and display, process turns, restart, and request rendering |
| Command interpretation | `CommandInterpreter.h`, `CommandInterpreter.cc` | Dispatch movement, rotation, drop, level, sequence, and special-action commands; handle supported aliases and repetitions |
| Player state and opponent interaction | `Player.h`, `Player.cc` | Own the board and level, connect the opponent, and hold blind/heavy and game-over state |
| Board rules | `Board.h`, `Board.cc` | Hold the grid, current and next blocks, collision checks, row removal, scores, and obstacle placement |
| Shape abstraction | `Block.h`, `Block.cc` | Share position, movement, rotation, type, and creation-level behavior |
| Concrete geometry | `IBlock` through `ZBlock` headers and implementations | Define the seven tetromino shapes |
| Construction | `BlockFactory.h`, `BlockFactory.cc` | Centralize block creation from a shape identifier |
| Grid support | `Cell`, `Position`, `Direction` | Represent cell occupancy, coordinates, and movement directions |
| Difficulty | `Level.h`, `Level.cc`, `Level0.h`, `Level0.cc` | Encapsulate sequence or weighted random generation; specialize higher-level rules |
| Single-cell obstacle | `OneCellBlock.h`, `OneCellBlock.cc` | Represent the additional level-4 block type |
| Presentation interface | `GameDisplay.h` | Expose a common `render` operation |
| Presentation implementations | `TextDisplay`, `GraphicDisplay` headers and implementations | Display the board state through text or X11 |

The main interaction is:

```text
CommandInterpreter → Game / Player → Board → Block and Level
                                  ↓
                         GameDisplay.render
                         ↙                ↘
                    TextDisplay      GraphicDisplay
```

This is a responsibility map rather than a complete call graph. Commands operate on the active player and board, while `Game` coordinates the session and explicitly asks the selected display to render.

## What the final source actually implements

The design report is useful evidence of the team's thinking, but it is an earlier design rather than an exact map of the delivered classes. It discusses Observer, Decorator, separate Score, and PlayerProcessor structures. Those structures are absent from the supplied final source.

The implementation uses:

- **Polymorphic shape and difficulty abstractions.** `Block` provides shared behavior, concrete shapes supply geometry, and the `Level` hierarchy varies generation.
- **A block factory.** `createBlock` centralizes construction from shape letters.
- **A display interface.** `GameDisplay` has text and graphical implementations. Rendering is triggered through direct calls, without an implemented Observer subscription mechanism.
- **Player effect flags.** Blind and heavy are tracked as state flags and checked by the game and command paths, without a Decorator object chain.
- **Board-owned score logic.** The board updates scores and high scores; the reviewed source does not have the report's separate Score class.

The portfolio describes those concrete mechanisms. Naming a pattern is less useful than explaining where the responsibility lives and how state crosses the boundary.

## Personal scope

Chris's contribution spanned the core implementation, including the board and shape model, command handling and turn flow, difficulty generation, effects, and text/X11 presentation. The page groups that work into four connected areas:

1. **Model the board and pieces.** Represent occupied cells, retain current and next pieces, validate movement and rotation, and connect clearing with scoring.
2. **Build the game loop.** Translate commands into state changes, hand over turns, preserve restart behavior, and coordinate attacks.
3. **Make difficulty extensible.** Support fixed sequences and weighted generation while keeping the board's responsibilities understandable.
4. **Bring state to the screen.** Expose the same game through text and graphical rendering behind a shared interface.

This reflects the user's confirmed contribution across all modules and preserves team credit for Yan Cui.

## Browser architecture

The browser playground is an independent JavaScript model of the brief's rules. It is not a C++ executable, WebAssembly build, or wrapper around the original process.

| Browser file | Responsibility |
| --- | --- |
| `engine.js` | Board dimensions, shape geometry, player state, deterministic generation, command parsing, movement, scoring, turns, attacks, and end conditions |
| `app.js` | Canvas rendering, keyboard and touch input, command previews, feedback, lesson setup, dialogs, and local best-score persistence |
| `index.html` | Project narrative, game controls, board canvases, rules, architecture explanation, and resource dialogs |
| `styles.css` | Responsive layout, typography, board presentation, focus treatment, and visual effects |
| `tests/engine.test.mjs` | Regression tests that exercise the model without a browser or DOM |

### A command is a state transition

`Biquadris.execute` parses a command, validates whether it is allowed, applies the rule, and returns a result with a human-readable message and structured details such as cleared rows, score delta, and lock count. The UI renders the resulting state and explains the action.

There is no animation-loop gravity or timer-driven update. Waiting never advances the board. A blocked movement or invalid rotation leaves the piece geometry unchanged; higher-level downward weight can still run after a movement command.

The model exposes cloned snapshots so readers cannot accidentally mutate live state through a returned snapshot. Tests interact directly with the model, including prepared board states that would be slow or awkward to reach through normal play.

### Identity survives row clearing

Every locked piece has a unique identity and its creation level. Each settled cell records that identity. When complete rows are removed, the surviving cell records move with their rows. The model checks which identities still exist and awards a completed-piece bonus exactly once when the last cell disappears.

That distinction matters because a partly erased tetromino can survive across multiple clears. Testing old coordinates or matching only its shape letter cannot reliably answer whether the original piece is gone.

### Reproducibility makes rules inspectable

Each player has a seeded random stream. Level 0 loops a fixed piece sequence; higher levels draw from weighted shape lists. Restart restores the stream from the original seed while retaining each player's current level and session high score. The browser best score is also saved locally when storage is available.

Level changes affect later generated pieces. The current piece and next preview retain their stored creation levels, so their eventual removal bonuses remain stable.

## Rule decisions and differences

The goal is a playable, understandable adaptation faithful to the brief. Source review identified places where the final C++ behavior differs from the written requirements. The browser resolves those differences explicitly rather than reproducing every historical edge case.

| Area | Browser decision and reason |
| --- | --- |
| Board and spawn | Use 11 columns, 18 total rows, and three reserve rows. Spawn each piece left-aligned with the bottom of its bounding box at the reserve boundary. This gives shapes consistent alignment under the brief's rule. |
| Rotation | Preserve the lower-left corner of the piece's bounding box and reject invalid cells without wall kicks. The original `Block.cc` rotates around its first stored position, so it is not the same rule. |
| Piece bonuses | Track stable piece identities through row shifts. The original removal check examines stored block positions against occupied cells, which can misidentify surviving or removed blocks after the grid changes. |
| Duel ending | End immediately when one player cannot spawn, awarding the other player the win. The original session loop can continue until both players are out and then compare high scores. |
| Native level-3/4 weight | After the whole movement or rotation command, attempt one additional row down, including after `down` and blocked moves. A multiplier repeats the requested action first; it does not multiply the extra weight. Blocking that extra step does not lock. |
| Attack-heavy | After each issued horizontal command, attempt two extra downward steps. If either is blocked, lock immediately. When native and attack weight coexist, native weight runs first. The brief does not separately define multiplied attack-heavy commands; this adaptation consistently applies the two extra steps once per issued horizontal command. |
| Attack lifetime | Blind and heavy expire when the affected player's piece locks. A qualifying clear opens a mandatory attack choice before the opponent's turn. |
| Blind coordinates | Hide columns 3–9 and playable rows 3–12, using one-based playable coordinates below the reserve rows. The renderer also masks current and ghost cells in that region. |
| Level-4 obstacle | Count consecutive locks without a clear. At each fifth no-clear lock, drop a 1×1 obstacle down the center from above, stopping on the stack. The original helper searches from the bottom for an empty cell, which could choose a covered gap. |
| Repeated drops | `3drop` places up to three pieces for the active player, then passes the turn once. Any single lock clearing two or more rows can earn the one attack choice; separate one-row clears do not combine into an attack. |
| Script input | Replace local filenames with inline text: `sequence 3right; cw; drop` and `norandom I O T`. A sequence stops after a lock, error, attack, or turn change, so it cannot accidentally play the opponent's turn. |
| Invalid shape replacement | A self-testing replacement that cannot spawn leaves the current piece unchanged. A forced opponent replacement that cannot spawn immediately loses the duel. |

The preserved level probabilities are:

| Level | I / J / L / O / T | S / Z |
| --- | --- | --- |
| 0 | Fixed repeating sequence | Fixed repeating sequence |
| 1 | 1/6 per shape | 1/12 per shape |
| 2 | 1/7 per shape | 1/7 per shape |
| 3 and 4 | 1/9 per shape | 2/9 per shape |

Line-clear score is `(current level + rows cleared)²`; no row clear means no line points. When all cells of a piece disappear, it additionally earns `(creation level + 1)²`. These are separate events and can both contribute to one command's score delta.

## Teaching the game through interaction

The page gives visitors three ways to move the same model: familiar keys, touch buttons, and the command interface. Command previews explain likely effects before submission, while status messages explain the actual result afterward. Board focus limits when movement keys are captured.

The guided lesson is a deliberately prepared board. Two bottom rows each have a two-column opening on the far right. An O-piece fills it with `9right`, then `drop`. At level 0, the clear scores **4 line points plus 1 completed-piece point, totaling 5**. Lesson scenery uses separate identifiers and is excluded from completed-piece bonuses. This lets the lesson explain the real scoring rule with a repeatable result.

Solo practice, landing ghosts, the guided board, responsive controls, and persistent browser best score are web additions. They make the project easier to try without changing the original project's authorship or claiming those features were part of the 2024 C++ delivery.

## Validation

Run the model tests from the repository root:

```sh
node --test tests/engine.test.mjs
```

The current suite has **22 passing tests**. It covers dimensions and sequences, no timed gravity, immutable snapshots, seeded generation, parsing and multipliers, both rotation directions, blocked rotations, ghost collision, adjacent row clearing, identity-based bonuses across row shifts, level changes, native and attack weight, duel turns, repeated drops, all three attacks, obstacles, game-over and restart behavior, inline sequences, and the guided five-point clear.

These tests validate the JavaScript model. The original C++ binary is not bundled or executed by the site. Visual layout and browser interaction require browser-level inspection in addition to model tests.

## Lessons and future improvements

- **Document the implementation that ships.** An early design report can be directionally useful while its class map becomes stale. Keep diagrams and pattern claims aligned with final code.
- **Make ownership explicit.** The C++ source uses raw owning pointers for players, boards, levels, pieces, and displays. A future refactor could use clear RAII ownership and narrower interfaces to make lifetime behavior easier to review.
- **Treat rules as observable transitions.** Rotation, scoring, locking, and effects should have explicit preconditions and outcomes. A small independent model makes those boundaries testable.
- **Retain identity where rules require history.** Geometry explains where a piece is; identity explains which original piece a surviving cell belongs to.
- **Resolve ambiguity in writing.** Repeated commands and interacting weights need a documented convention and regression tests. Consistency is part of the interface.
- **Teach the first successful action.** A guided clear and immediate feedback give visitors a concrete way into a system with more rules than a typical falling-block game.

## Assets, dependencies, and data

The hero image is decorative AI-generated artwork. The live board is drawn from game state rather than composited into the image. [Image provenance and the final prompt](../assets/image-provenance.txt) accompany the asset.

Runtime game code has no external library dependencies. Google Fonts are optional and fall back to local system fonts. There is no backend, account system, or analytics service. The only saved gameplay value is a local browser best score; the site does not load or upload the private source documents or coursework folder.
