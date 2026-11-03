# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No dependencies, no `package.json`, no build, no linter, no tests. The README and UI are in Spanish.

## Running

Open `index.html` directly, or serve statically (e.g. `python -m http.server 8000`) and visit `http://localhost:8000`. Verification is manual in the browser.

## Architecture

All logic lives in `game.js` (loaded as a classic script by `index.html`; there are no modules). It binds to DOM ids defined in `index.html` (`board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`, `theme-toggle`, `skin-select`), so renaming an id requires updating both files.

- State is a set of module-level `let` globals (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`, ...), reset by `init()`. `init()` is also the restart handler.
- Piece lifecycle: `spawn()` promotes `next` to `current`; `lockPiece()` = `merge()` → `clearLines()` → `spawn()`. Game over is detected in `spawn()` (new piece collides) and calls `endGame()`.
- Board cells hold `0` or a piece type 1–7, which indexes both `PIECES` and `COLORS`. Piece shape matrices embed their own type number as the filled value.
- Gravity runs in the `requestAnimationFrame` `loop`; pause/game-over stop it via `cancelAnimationFrame(animId)` and pause resumes by calling `loop` manually. `loop` re-schedules itself, so avoid starting a second loop without cancelling `animId`.
- Rotation is `rotateCW` plus a horizontal-only kick list `[0,-1,1,-2,2]` in `tryRotate` (no floor kicks, no SRS).
- Canvas size is coupled to constants: `#board` must be `COLS*BLOCK` × `ROWS*BLOCK` (300×600) in `index.html`; `#next-canvas` is 120×120 with a 4×4 grid of 30px blocks (`drawNext`).
- Scoring: `LINE_SCORES[cleared] * level`; soft drop +1/row, hard drop +2/row; level = `floor(lines/10)+1`; `dropInterval = max(100, 1000 - (level-1)*90)` ms (the 1000 initial value is duplicated in `init()` and `clearLines()`).
- Theming: all colors in `style.css` are CSS variables (`:root` = dark default, `[data-theme="light"]` on `<html>` = light). `game.js` reads `--grid` and `--block-highlight` into `themeColors` via `readThemeColors()` (called by `applyTheme()`), which also repaints with `draw()`/`drawNext()` because `loop` is stopped when paused/game over. The choice persists in `localStorage` key `tetris-theme` (wrapped in try/catch). The toggle button calls `blur()` so `Space` doesn't re-trigger it.
- Skins: `SKINS` maps `retro`/`neon`/`pastel`/`pixel` to `{ name, colors[1..7], boardBg?, grid?, drawBlock(ctx, px, py, color, size, alpha) }` (pixel coords, not cells). The generic `drawBlock(context, x, y, colorIndex, size, alpha)` wraps the active skin's draw in `save()`/`restore()` (so `shadowBlur`/`shadowColor`/`globalAlpha` don't leak) after setting `globalAlpha`; skins may special-case the ghost (`alpha < 1`) for legibility. `retro` uses `COLORS` and is the original look. `paintBackground()` clears both canvases and fills `skin.boardBg` when set (Neon = black); `drawGrid` uses `skin.grid || themeColors.grid`. `applySkin()` sets `skin`, `<html data-skin>`, the select value and repaints (same guard as `applyTheme()`); persisted in `localStorage` key `tetris-skin` (unknown → `retro`). The `#skin-select` keydown handler cancels the native action for game keys (and always for `P`, to avoid type-ahead), blurs and lets the event bubble to the game; on `change` it also blurs.
