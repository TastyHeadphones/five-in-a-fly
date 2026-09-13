import {
  SIZE,
  EMPTY,
  P1,
  P2,
  emptyBoard,
  applyMove,
  wouldMakeFive,
  idx,
  listEmpty,
} from './board.js';
import { createBoardView } from './view-board.js';
import { createBrainView } from './view-brain.js';
import { createFlyView } from './view-fly.js';

const boardCanvas = document.getElementById('board');
const flyCanvas = document.getElementById('fly');
const statusEl = document.getElementById('status');
const hoverBars = document.getElementById('hover-bars');
const brainRoot = document.getElementById('brain-panel');
const newBtn = document.getElementById('new-game');
const toggleBrain = document.getElementById('toggle-brain');

const view = createBoardView(boardCanvas);
const brainView = createBrainView(brainRoot);
const fly = createFlyView(flyCanvas);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
fly.setReduced(reduced);

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
  view.setHeat([]);
  view.draw(board, lastMove);
  fly.resetPose();
  hoverBars.innerHTML = '';
  setStatus('Your move. Black stones. The fly answers.');
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
  hoverBars.innerHTML = names
    .map((n, i) => {
      const v = hit.drive[i];
      const max = Math.max(...hit.drive);
      const min = Math.min(...hit.drive);
      const w = ((max - v) / Math.max(1e-6, max - min)) * 100;
      return (
        '<div class="bar-row"><span class="bar-lab">' +
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
  fly.celebrate(flyWon);
}

function place(i, player) {
  applyMove(board, i, player);
  lastMove = i;
  view.draw(board, lastMove);
  if (winnerAfter(i, player)) return player;
  if (listEmpty(board).length === 0) return 0;
  return null;
}

function flyTurn() {
  busy = true;
  fly.setThink(true);
  setStatus('Fly is sniffing every empty square…');
  worker.postMessage({ type: 'score', board: board.slice(), player: P2 });
}

worker.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.type === 'ready') {
    setStatus('Your move. Black stones. The fly answers.');
    return;
  }
  if (msg.type === 'error') {
    setStatus('Brain failed: ' + msg.message);
    busy = false;
    return;
  }
  if (msg.type !== 'scored') return;
  cells = msg.cells;
  lastState = msg.state;
  view.setHeat(cells);
  view.draw(board, lastMove);
  brainView.render(msg.state, cells.find((c) => c.i === msg.move));
  fly.setThink(false);
  const i = msg.move;
  if (i == null || board[i] !== EMPTY) {
    setStatus('Fly passed. Your move.');
    busy = false;
    turn = P1;
    return;
  }
  const r = (i / SIZE) | 0;
  const c = i - r * SIZE;
  const xy = view.stoneXY(r, c);
  const frac = fly.toFrac(xy.x, xy.y);
  const finish = () => {
    const w = place(i, P2);
    if (w === P2) endGame('The fly made five. New game when you like.', true);
    else if (w === 0) endGame('Draw. The board is full.', false);
    else {
      turn = P1;
      busy = false;
      setStatus('Your move.');
    }
  };
  fly.goTo(frac.x, frac.y, finish);
};

boardCanvas.addEventListener('pointermove', (e) => {
  const rect = boardCanvas.getBoundingClientRect();
  const cell = view.cellAt(e.clientX - rect.left, e.clientY - rect.top);
  view.setHover(cell);
  showHover(cell);
});

boardCanvas.addEventListener('pointerdown', (e) => {
  if (busy || over || turn !== P1) return;
  const rect = boardCanvas.getBoundingClientRect();
  const cell = view.cellAt(e.clientX - rect.left, e.clientY - rect.top);
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
toggleBrain.addEventListener('click', () => {
  brainRoot.classList.toggle('open');
  toggleBrain.setAttribute('aria-expanded', brainRoot.classList.contains('open') ? 'true' : 'false');
});

window.addEventListener('resize', () => view.redraw());

setStatus('Loading the mushroom body…');
view.draw(board, lastMove);
worker.postMessage({ type: 'load' });
