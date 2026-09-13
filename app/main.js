import { SIZE, EMPTY, P1, P2, emptyBoard, applyMove, wouldMakeFive, listEmpty } from './board.js';
import { createScene } from './view-scene.js';
import { createBrainView, enableDrag } from './view-brain.js';
import { Sound } from './audio.js';

const canvas = document.getElementById('stage');
const statusEl = document.getElementById('status');
const hoverBars = document.getElementById('hover-bars');
const newBtn = document.getElementById('new-game');
const brainBtn = document.getElementById('brainbtn');
const brainWin = document.getElementById('brainwin');
const loadbar = document.getElementById('loadbar');
const soundBtn = document.getElementById('soundbtn');

const scene = createScene(canvas);
const brainView = createBrainView(brainWin);
enableDrag(brainWin, document.getElementById('bwhead'));
const sound = new Sound();
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
scene.setReduced(reduced);

const worker = new Worker('app/worker.js', { type: 'module' });

let board = emptyBoard();
let lastMove = -1;
let turn = P1;
let busy = false;
let over = false;
let cells = [];
let lastState = null;
function setStatus(t) {
  statusEl.textContent = t;
}

function winnerAfter(i, player) {
  const r = (i / SIZE) | 0;
  const c = i - r * SIZE;
  return wouldMakeFive(board, r, c, player);
}

function reset() {
  board = emptyBoard();
  lastMove = -1;
  turn = P1;
  busy = false;
  over = false;
  cells = [];
  scene.setHeat([]);
  scene.setBoard(board, lastMove);
  scene.resetPose();
  hoverBars.innerHTML = '';
  setStatus('Your move. Black stones. The fly answers.');
  brainView.render(null, null, 'idle');
}

function showHover(cell) {
  if (!cell) {
    hoverBars.innerHTML = '';
    return;
  }
  const hit = cells.find((c) => c.i === cell.i);
  if (!hit) {
    hoverBars.innerHTML = '';
    return;
  }
  const names = ['WIN', 'BLOCK', 'GOOD', 'NEUTRAL'];
  const max = Math.max.apply(null, hit.drive);
  const min = Math.min.apply(null, hit.drive);
  hoverBars.innerHTML = names
    .map((n, i) => {
      const v = hit.drive[i];
      const w = ((max - v) / Math.max(1e-6, max - min)) * 100;
      return (
        '<div class="bar-row' +
        (v === min ? ' win' : '') +
        '"><span class="bar-lab">' +
        n +
        '</span><span class="bar-track"><span class="bar-fill" style="width:' +
        w.toFixed(0) +
        '%"></span></span></div>'
      );
    })
    .join('');
}

function endGame(msg, flyWon) {
  over = true;
  busy = false;
  setStatus(msg);
  scene.celebrate(flyWon);
  if (flyWon) {
    sound.drop();
    sound.ok();
  } else sound.ng();
  brainView.render(lastState, null, flyWon ? 'feeding' : 'sulk');
}

function place(i, player) {
  applyMove(board, i, player);
  lastMove = i;
  scene.setBoard(board, lastMove);
  sound.click();
  if (winnerAfter(i, player)) return player;
  if (listEmpty(board).length === 0) return 0;
  return null;
}

function flyTurn() {
  busy = true;
  scene.setThink(true);
  sound.sniff();
  setStatus('Fly is sniffing every empty square…');
  brainView.render(lastState, null, 'sniffing');
  worker.postMessage({ type: 'score', board: board.slice(), player: P2 });
}

function drawSound() {
  soundBtn.textContent = sound.on ? '🔊' : '🔇';
  soundBtn.setAttribute('aria-pressed', String(sound.on));
}

worker.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.type === 'ready') {
    loadbar.hidden = true;
    setStatus('Your move. Black stones. The fly answers.');
    return;
  }
  if (msg.type === 'error') {
    loadbar.hidden = true;
    setStatus('Brain failed: ' + msg.message);
    busy = false;
    return;
  }
  if (msg.type !== 'scored') return;
  cells = msg.cells;
  lastState = msg.state;
  scene.setHeat(cells);
  scene.setThink(false);
  brainView.render(msg.state, cells.find((c) => c.i === msg.move), 'walking');
  const i = msg.move;
  if (i == null || board[i] !== EMPTY) {
    setStatus('Fly passed. Your move.');
    busy = false;
    turn = P1;
    return;
  }
  const r = (i / SIZE) | 0;
  const c = i - r * SIZE;
  const finish = () => {
    const w = place(i, P2);
    if (w === P2) endGame('The fly made five. New game when you like.', true);
    else if (w === 0) endGame('Draw. The board is full.', false);
    else {
      turn = P1;
      busy = false;
      setStatus('Your move.');
      brainView.render(msg.state, cells.find((x) => x.i === i), 'idle');
    }
  };
  scene.goTo(r, c, finish);
};

canvas.addEventListener('pointermove', (e) => {
  const cell = scene.cellAt(e.clientX, e.clientY);
  scene.setHover(cell);
  showHover(cell);
});

canvas.addEventListener('pointerdown', (e) => {
  if (busy || over || turn !== P1) return;
  const cell = scene.cellAt(e.clientX, e.clientY);
  if (!cell || board[cell.i] !== EMPTY) return;
  const w = place(cell.i, P1);
  if (w === P1) {
    endGame('You made five. The fly sulks, then waits.', false);
    return;
  }
  if (w === 0) {
    endGame('Draw. The board is full.', false);
    return;
  }
  turn = P2;
  flyTurn();
});

newBtn.addEventListener('click', reset);
soundBtn.addEventListener('click', () => {
  sound.setOn(!sound.on);
  drawSound();
});
drawSound();

brainBtn.addEventListener('click', () => {
  const open = brainWin.hidden;
  brainWin.hidden = !open;
  brainBtn.setAttribute('aria-pressed', String(open));
});
document.getElementById('bwclose').addEventListener('click', () => {
  brainWin.hidden = true;
  brainBtn.setAttribute('aria-pressed', 'false');
});

function buzzLoop() {
  sound.buzz(scene.getFlap(), 0);
  if (busy && Math.random() < 0.08) sound.thinkTick();
  requestAnimationFrame(buzzLoop);
}
requestAnimationFrame(buzzLoop);

setStatus('Loading the mushroom body…');
scene.setBoard(board, lastMove);
worker.postMessage({ type: 'load' });
