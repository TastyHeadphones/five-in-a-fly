import { SIZE, EMPTY, P1, P2, idx } from './board.js';

const WOOD = '#c4a574';
const LINE = '#3a2a18';
const HEAT = [255, 122, 24];

export function createBoardView(canvas) {
  const ctx = canvas.getContext('2d');
  let hover = null;
  let heat = new Float32Array(SIZE * SIZE);
  let heatMax = 1;
  let last = { board: null, lastMove: -1 };

  function layout() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const css = Math.min(canvas.parentElement.clientWidth, 560);
    canvas.style.width = css + 'px';
    canvas.style.height = css + 'px';
    canvas.width = Math.round(css * dpr);
    canvas.height = Math.round(css * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return css;
  }

  function cellAt(px, py) {
    const w = canvas.clientWidth;
    const pad = w * 0.06;
    const span = w - pad * 2;
    const step = span / (SIZE - 1);
    const c = Math.round((px - pad) / step);
    const r = Math.round((py - pad) / step);
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
    return { r, c, i: idx(r, c) };
  }

  function setHeat(cells) {
    heat.fill(0);
    heatMax = 1e-6;
    for (let k = 0; k < cells.length; k++) {
      const cell = cells[k];
      const glow = cell.pred === 3 ? 0 : (3 - cell.pred) + Math.min(1, cell.score / 1e4);
      heat[cell.i] = glow;
      if (glow > heatMax) heatMax = glow;
    }
  }

  function draw(board, lastMove) {
    last = { board, lastMove };
    const w = layout();
    const pad = w * 0.06;
    const span = w - pad * 2;
    const step = span / (SIZE - 1);
    ctx.fillStyle = WOOD;
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = Math.max(1, w / 420);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (let i = 0; i < SIZE; i++) {
      const p = pad + i * step;
      ctx.moveTo(pad, p);
      ctx.lineTo(pad + span, p);
      ctx.moveTo(p, pad);
      ctx.lineTo(p, pad + span);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    const stars = [
      [3, 3],
      [3, 11],
      [11, 3],
      [11, 11],
      [7, 7],
    ];
    ctx.fillStyle = LINE;
    for (let s = 0; s < stars.length; s++) {
      ctx.beginPath();
      ctx.arc(pad + stars[s][1] * step, pad + stars[s][0] * step, Math.max(2, step * 0.08), 0, Math.PI * 2);
      ctx.fill();
    }
    const hr = step * 0.46;
    for (let i = 0; i < heat.length; i++) {
      const g = heat[i] / heatMax;
      if (g < 0.04) continue;
      if (board[i] !== EMPTY) continue;
      const r = (i / SIZE) | 0;
      const c = i - r * SIZE;
      ctx.fillStyle = 'rgba(' + HEAT[0] + ',' + HEAT[1] + ',' + HEAT[2] + ',' + (0.12 + 0.55 * g) + ')';
      ctx.beginPath();
      ctx.arc(pad + c * step, pad + r * step, hr, 0, Math.PI * 2);
      ctx.fill();
    }
    const rad = step * 0.38;
    for (let i = 0; i < board.length; i++) {
      if (board[i] === EMPTY) continue;
      const r = (i / SIZE) | 0;
      const c = i - r * SIZE;
      const x = pad + c * step;
      const y = pad + r * step;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = board[i] === P1 ? '#111111' : '#f3efe6';
      ctx.fill();
      ctx.strokeStyle = board[i] === P1 ? '#000' : '#6a5a48';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (i === lastMove) {
        ctx.strokeStyle = '#e8892d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, rad * 0.45, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (hover && board[hover.i] === EMPTY) {
      ctx.strokeStyle = 'rgba(80, 220, 230, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pad + hover.c * step, pad + hover.r * step, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function stoneXY(r, c) {
    const w = canvas.clientWidth;
    const pad = w * 0.06;
    const span = w - pad * 2;
    const step = span / (SIZE - 1);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + pad + c * step, y: rect.top + pad + r * step, step };
  }

  return {
    draw,
    setHeat,
    cellAt,
    stoneXY,
    setHover(h) {
      hover = h;
      if (last.board) draw(last.board, last.lastMove);
    },
    getHover() {
      return hover;
    },
    redraw() {
      if (last.board) draw(last.board, last.lastMove);
    },
  };
}
