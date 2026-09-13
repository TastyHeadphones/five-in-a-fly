import { N_KC, kcSeedPositions } from './brain.js';

const NAMES = ['WIN', 'BLOCK', 'GOOD', 'NEUTRAL'];
const xy = kcSeedPositions(7);

export function createBrainView(root) {
  const bars = root.querySelector('[data-bars]');
  const sparse = root.querySelector('[data-sparse]');
  const winner = root.querySelector('[data-winner]');
  const units = root.querySelector('[data-units]');
  const kc = root.querySelector('#kcmini');
  const kctx = kc ? kc.getContext('2d') : null;

  function drawKc(state) {
    if (!kctx || !kc) return;
    const w = kc.width;
    const h = kc.height;
    kctx.fillStyle = '#070a0d';
    kctx.fillRect(0, 0, w, h);
    const fire = new Uint8Array(N_KC);
    if (state && state.firing) {
      const arr = state.firing;
      const n = state.nFire || arr.length;
      for (let i = 0; i < n; i++) fire[arr[i]] = 1;
    }
    for (let k = 0; k < N_KC; k++) {
      const px = ((xy[k * 2] + 32000) / 64000) * w;
      const py = ((xy[k * 2 + 1] + 20000) / 40000) * h;
      if (fire[k]) {
        kctx.fillStyle = '#59b7ff';
        kctx.fillRect(px, py, 1.6, 1.6);
      } else {
        kctx.fillStyle = '#2a323b';
        kctx.fillRect(px, py, 1, 1);
      }
    }
  }

  function render(state, cell, mode) {
    if (sparse) {
      const n = state && state.nFire != null ? state.nFire : 0;
      sparse.textContent = n.toLocaleString('en-US') + ' of 5,177 firing';
    }
    drawKc(state);
    const drive = cell && cell.drive ? cell.drive : state && state.drive;
    if (!drive || !bars) return;
    let minC = 0;
    let minV = drive[0];
    let maxV = drive[0];
    for (let c = 1; c < 4; c++) {
      if (drive[c] < minV) {
        minV = drive[c];
        minC = c;
      }
      if (drive[c] > maxV) maxV = drive[c];
    }
    const span = Math.max(1e-6, maxV - minV);
    const html = [];
    for (let c = 0; c < 4; c++) {
      const less = maxV - drive[c];
      const pct = (less / span) * 100;
      html.push(
        '<div class="bar-row' +
          (c === minC ? ' win' : '') +
          '"><span class="bar-lab">' +
          NAMES[c] +
          '</span><span class="bar-track"><span class="bar-fill" style="width:' +
          pct.toFixed(1) +
          '%"></span></span><span class="bar-n">' +
          drive[c].toFixed(2) +
          '</span></div>'
      );
    }
    bars.innerHTML = html.join('');
    if (winner) winner.textContent = 'lowest drive: ' + NAMES[minC];
    if (units && state && state.mbonDrive) {
      let u = '';
      for (let c = 0; c < 4; c++) {
        u += '<div class="unit-col">';
        for (let j = 0; j < 24; j++) {
          const v = state.mbonDrive[c * 24 + j];
          const t = (v - minV) / span;
          const a = 0.15 + 0.85 * Math.max(0, 1 - t);
          u += '<i style="background:rgba(89,183,255,' + a.toFixed(2) + ')"></i>';
        }
        u += '</div>';
      }
      units.innerHTML = u;
    }
    const modeEl = document.getElementById('bwmode');
    if (modeEl && mode) {
      modeEl.textContent = mode;
      modeEl.classList.toggle('ask', mode === 'sniffing' || mode === 'walking');
    }
  }

  return { render };
}

export function enableDrag(win, handle) {
  let ox = 0;
  let oy = 0;
  let dragging = false;
  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    dragging = true;
    const r = win.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    win.style.left = clampPx(e.clientX - ox, innerWidth - 40) + 'px';
    win.style.top = clampPx(e.clientY - oy, innerHeight - 40) + 'px';
    win.style.right = 'auto';
  });
  handle.addEventListener('pointerup', () => {
    dragging = false;
  });
}

function clampPx(v, max) {
  return Math.max(8, Math.min(v, max));
}
