'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');

const THEME_KEY = 'tetris-theme';
const themeColors = { grid: '', highlight: '' };

function readThemeColors() {
  const style = getComputedStyle(document.documentElement);
  themeColors.grid = style.getPropertyValue('--grid').trim();
  themeColors.highlight = style.getPropertyValue('--block-highlight').trim();
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === 'light' ? 'Modo oscuro' : 'Modo claro';
  themeToggle.setAttribute('aria-pressed', String(theme === 'light'));
  readThemeColors();
  // loop está detenido en pausa/game over: repintar a mano
  if (current && next) {
    draw();
    drawNext();
  }
}

function loadTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // localStorage no disponible (p. ej. modo privado)
  }
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo = 0, maxCombo = 0, started = false;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  trackCombo(cleared);
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = themeColors.highlight;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = themeColors.grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  showGameOverRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  combo = 0;
  maxCombo = 0;
  gameoverRecords.classList.add('hidden');
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Records (top 5 + mejores marcas) ----
const RECORDS_KEY = 'tetris-records';
const BESTS_KEY = 'tetris-bests';
const MAX_RECORDS = 5;
const NAME_MAX = 12;
const DEFAULT_NAME = 'Jugador';

const startScreen = document.getElementById('start-screen');
const startRecordsEl = document.getElementById('start-records');
const playBtn = document.getElementById('play-btn');
const clearRecordsBtn = document.getElementById('clear-records-btn');
const gameoverRecords = document.getElementById('gameover-records');
const overlayRecordsEl = document.getElementById('overlay-records');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const saveNameBtn = document.getElementById('save-name-btn');
const newRecordMsg = document.getElementById('new-record-msg');

let pendingRecord = null;   // partida que entra en el top 5, aún sin nombre
let lastName = '';

function toCount(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function cleanName(v) {
  const name = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return name || DEFAULT_NAME;
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!Array.isArray(data)) return [];
    return data
      .filter(r => r && typeof r === 'object' && Number.isFinite(Number(r.score)))
      .map(r => ({
        name: cleanName(r.name),
        score: toCount(r.score),
        lines: toCount(r.lines),
        combo: toCount(r.combo),
        date: typeof r.date === 'string' ? r.date.slice(0, 10) : '',
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
  } catch {
    return [];
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // localStorage no disponible
  }
}

function loadBests() {
  const bests = { combo: 0, lines: 0 };
  try {
    const data = JSON.parse(localStorage.getItem(BESTS_KEY));
    if (data && typeof data === 'object') {
      bests.combo = toCount(data.combo);
      bests.lines = toCount(data.lines);
    }
  } catch {
    // datos corruptos o localStorage no disponible
  }
  return bests;
}

function saveBests(bests) {
  try {
    localStorage.setItem(BESTS_KEY, JSON.stringify(bests));
  } catch {
    // localStorage no disponible
  }
}

function clearRecords() {
  try {
    localStorage.removeItem(RECORDS_KEY);
    localStorage.removeItem(BESTS_KEY);
  } catch {
    // localStorage no disponible
  }
}

// combo = piezas fijadas consecutivas que limpian al menos una línea
function trackCombo(cleared) {
  if (cleared) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
  } else {
    combo = 0;
  }
}

function qualifies(records, value) {
  return value > 0 && (records.length < MAX_RECORDS || value > records[records.length - 1].score);
}

// posición donde entraría la puntuación (los empates quedan detrás)
function insertPosition(records, value) {
  const i = records.findIndex(r => value > r.score);
  return i === -1 ? records.length : i;
}

function insertRecord(entry) {
  const records = loadRecords();
  if (!qualifies(records, entry.score)) return -1;
  const pos = insertPosition(records, entry.score);
  records.splice(pos, 0, entry);
  saveRecords(records.slice(0, MAX_RECORDS));
  return pos;
}

// construye la tabla con textContent (los nombres nunca se interpretan como HTML)
function renderRecords(container, highlight) {
  const records = loadRecords();
  const bests = loadBests();
  container.replaceChildren();

  if (records.length) {
    const table = document.createElement('table');
    table.className = 'records-table';
    const head = table.createTHead().insertRow();
    for (const label of ['#', 'NOMBRE', 'PUNTOS', 'LÍNEAS', 'COMBO']) {
      const th = document.createElement('th');
      th.textContent = label;
      head.appendChild(th);
    }
    const body = table.createTBody();
    records.forEach((r, i) => {
      const row = body.insertRow();
      if (i === highlight) row.className = 'highlight';
      if (r.date) row.title = r.date;
      const cells = [
        [String(i + 1), 'num'],
        [r.name, 'name'],
        [r.score.toLocaleString(), 'num'],
        [String(r.lines), 'num'],
        [String(r.combo), 'num'],
      ];
      for (const [text, cls] of cells) {
        const td = row.insertCell();
        td.className = cls;
        td.textContent = text;
      }
    });
    container.appendChild(table);
  } else {
    const empty = document.createElement('p');
    empty.className = 'records-empty';
    empty.textContent = 'Aún no hay records';
    container.appendChild(empty);
  }

  const bestsEl = document.createElement('p');
  bestsEl.className = 'records-bests';
  const comboStrong = document.createElement('strong');
  comboStrong.textContent = String(bests.combo);
  const linesStrong = document.createElement('strong');
  linesStrong.textContent = String(bests.lines);
  bestsEl.append('Mejor combo: ', comboStrong, ' · Líneas máx.: ', linesStrong);
  container.appendChild(bestsEl);
}

function showGameOverRecords() {
  // las mejores marcas se guardan aunque la partida no entre en el top 5
  const bests = loadBests();
  if (maxCombo > bests.combo || lines > bests.lines) {
    saveBests({ combo: Math.max(bests.combo, maxCombo), lines: Math.max(bests.lines, lines) });
  }

  pendingRecord = null;
  const records = loadRecords();
  if (qualifies(records, score)) {
    pendingRecord = {
      score,
      lines,
      combo: maxCombo,
      date: new Date().toISOString().slice(0, 10),
    };
    newRecordMsg.textContent = `¡Nuevo récord! Puesto #${insertPosition(records, score) + 1}. Escribe tu nombre:`;
    nameInput.value = lastName;
    nameForm.classList.remove('hidden');
  } else {
    nameForm.classList.add('hidden');
  }
  renderRecords(overlayRecordsEl, -1);
  gameoverRecords.classList.remove('hidden');
  if (pendingRecord) nameInput.focus();
}

function commitPendingRecord() {
  if (!pendingRecord) return -1;
  const name = cleanName(nameInput.value);
  lastName = name;
  const pos = insertRecord({ name, ...pendingRecord });
  pendingRecord = null;
  return pos;
}

function showStartScreen() {
  started = false;
  renderRecords(startRecordsEl, -1);
  startScreen.classList.remove('hidden');
  overlay.classList.add('hidden');
}

function startGame() {
  // reiniciar sin pulsar Guardar no pierde el récord: se guarda con el nombre escrito o el por defecto
  commitPendingRecord();
  nameForm.classList.add('hidden');
  started = true;
  startScreen.classList.add('hidden');
  init();
}

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  const pos = commitPendingRecord();
  nameForm.classList.add('hidden');
  nameInput.blur();
  saveNameBtn.blur();
  renderRecords(overlayRecordsEl, pos);
});

playBtn.addEventListener('click', () => {
  startGame();
  playBtn.blur();
});

clearRecordsBtn.addEventListener('click', () => {
  clearRecordsBtn.blur();
  if (!confirm('¿Borrar todos los records y mejores marcas?')) return;
  clearRecords();
  renderRecords(startRecordsEl, -1);
  renderRecords(overlayRecordsEl, -1);
});

document.addEventListener('keydown', e => {
  // escribir el nombre del récord no debe mover piezas ni pausar
  if (e.target instanceof HTMLInputElement) return;
  if (!started) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); startGame(); }
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => {
  startGame();
  restartBtn.blur();
});

themeToggle.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(theme);
  saveTheme(theme);
  themeToggle.blur(); // evita que Space (caída) vuelva a activar el botón
});

applyTheme(loadTheme());
showStartScreen();
