const NAMES = ['WIN', 'BLOCK', 'GOOD', 'NEUTRAL'];

export function createBrainView(root) {
  const bars = root.querySelector('[data-bars]');
  const sparse = root.querySelector('[data-sparse]');
  const winner = root.querySelector('[data-winner]');
  const units = root.querySelector('[data-units]');

  function render(state, cell) {
    if (sparse) {
      const n = state && state.nFire != null ? state.nFire : 0;
      sparse.textContent = n.toLocaleString('en-US') + ' of 5,177 firing';
    }
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
          u +=
            '<i style="background:rgba(255,122,24,' +
            a.toFixed(2) +
            ')"></i>';
        }
        u += '</div>';
      }
      units.innerHTML = u;
    }
  }

  return { render };
}
