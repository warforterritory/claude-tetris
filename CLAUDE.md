# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No dependencies, no `package.json`, no build, no linter, no tests. The README and UI are in Spanish.

## Running

Open `index.html` directly, or serve statically (e.g. `python -m http.server 8000`) and visit `http://localhost:8000`. Verification is manual in the browser.

## Architecture

All logic lives in `game.js` (loaded as a classic script by `index.html`; there are no modules). It binds to DOM ids defined in `index.html` (`board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`, `theme-toggle`, `pause-menu`, `resume-btn`, `pause-restart-btn`, `controls-btn`, `pause-controls`, `start-level`), so renaming an id requires updating both files.

- State is a set of module-level `let` globals (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`, ...), reset by `init()`. `init()` is also the restart handler.
- Piece lifecycle: `spawn()` promotes `next` to `current`; `lockPiece()` = `merge()` → `clearLines()` → `spawn()`. Game over is detected in `spawn()` (new piece collides) and calls `endGame()`.
- Board cells hold `0` or a piece type 1–7, which indexes both `PIECES` and `COLORS`. Piece shape matrices embed their own type number as the filled value.
- Gravity runs in the `requestAnimationFrame` `loop`; pause/game-over stop it via `cancelAnimationFrame(animId)` and `resumeGame()` resumes by resetting `dropAccum`/`lastTime` and calling `loop` manually. `loop` re-schedules itself, so avoid starting a second loop without cancelling `animId`.
- Rotation is `rotateCW` plus a horizontal-only kick list `[0,-1,1,-2,2]` in `tryRotate` (no floor kicks, no SRS).
- Canvas size is coupled to constants: `#board` must be `COLS*BLOCK` × `ROWS*BLOCK` (300×600) in `index.html`; `#next-canvas` is 120×120 with a 4×4 grid of 30px blocks (`drawNext`).
- Pause menu: `P`/`Escape` call `togglePause()` → `openPauseMenu()` / `resumeGame()` (ignored during game over and on key auto-repeat). `#pause-menu` is a separate overlay from the game-over `#overlay`; `init()` hides both, so the menu's Reiniciar just calls `init()`. Game keys are ignored while `paused`; `pressedKeys` tracks held keys and on closing the menu (`closePauseMenu()` → `blockInputsHeldFromMenu()`) they are copied into `blockedKeys`, which the keydown handler ignores until each key's `keyup`. Menu buttons `blur()` on click so `Space` doesn't retrigger them.
- Start level: `selectedStartLevel` (menu `<select id="start-level">`, options 1–10 built in JS, persisted in `localStorage` key `tetris-start-level`, try/catch) is copied to `startLevel` by `init()`, so changing it only affects the next game.
- Scoring: `LINE_SCORES[cleared] * level`; soft drop +1/row, hard drop +2/row; level = `startLevel + floor(lines/10)`; `dropInterval = intervalForLevel(level)` = `max(100, 1000 - (level-1)*90)` ms (used by both `init()` and `clearLines()`).
- Theming: all colors in `style.css` are CSS variables (`:root` = dark default, `[data-theme="light"]` on `<html>` = light). `game.js` reads `--grid` and `--block-highlight` into `themeColors` via `readThemeColors()` (called by `applyTheme()`), which also repaints with `draw()`/`drawNext()` because `loop` is stopped when paused/game over. The choice persists in `localStorage` key `tetris-theme` (wrapped in try/catch). The toggle button calls `blur()` so `Space` doesn't re-trigger it.
