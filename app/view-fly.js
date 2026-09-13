export function createFlyView(overlay) {
  const canvas = overlay;
  const ctx = canvas.getContext('2d');
  let x = 0.5;
  let y = 0.5;
  let tx = 0.5;
  let ty = 0.5;
  let heading = 0;
  let phase = 0;
  let mode = 'idle';
  let reduced = false;
  let onArrive = null;
  let last = 0;

  function resize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setReduced(v) {
    reduced = v;
  }

  function goTo(nx, ny, cb) {
    tx = nx;
    ty = ny;
    mode = 'walk';
    onArrive = cb || null;
    if (reduced) {
      x = tx;
      y = ty;
      mode = 'idle';
      if (onArrive) {
        const fn = onArrive;
        onArrive = null;
        fn();
      }
    }
  }

  function celebrate(ok) {
    mode = ok ? 'feed' : 'sulk';
    phase = 0;
  }

  function resetPose() {
    x = 0.5;
    y = 0.5;
    tx = 0.5;
    ty = 0.5;
    mode = 'idle';
  }

  function drawFly(px, py, scale) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(heading);
    ctx.scale(scale, scale);
    const flick = mode === 'think' ? Math.sin(phase * 18) * 0.25 : Math.sin(phase * 6) * 0.08;
    ctx.fillStyle = '#2a241c';
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(8, 0, 4.2, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1612';
    ctx.beginPath();
    ctx.ellipse(-8, 0, 5.5, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,220,230,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, -1);
    ctx.quadraticCurveTo(16, -8 + flick * 6, 18, -10);
    ctx.moveTo(10, 1);
    ctx.quadraticCurveTo(16, 8 - flick * 6, 18, 10);
    ctx.stroke();
    ctx.fillStyle = 'rgba(244, 232, 210, 0.35)';
    ctx.beginPath();
    ctx.ellipse(-2, -6, 7, 3, -0.5 + flick, 0, Math.PI * 2);
    ctx.ellipse(-2, 6, 7, 3, 0.5 - flick, 0, Math.PI * 2);
    ctx.fill();
    const leg = mode === 'place' ? 0.9 : 0.35 + Math.sin(phase * 10) * 0.15;
    ctx.strokeStyle = '#c9b59a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(4, 2);
    ctx.lineTo(10, 8 + leg * 4);
    ctx.moveTo(4, -2);
    ctx.lineTo(10, -8 - (mode === 'idle' ? Math.sin(phase * 3) * 2 : 0));
    ctx.stroke();
    if (mode === 'feed') {
      ctx.fillStyle = 'rgba(232, 137, 45, 0.85)';
      ctx.beginPath();
      ctx.arc(14, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function frame(ts) {
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    phase += dt;
    const dx = tx - x;
    const dy = ty - y;
    const dist = Math.hypot(dx, dy);
    if (mode === 'walk' && dist > 0.004) {
      heading = Math.atan2(dy, dx);
      const sp = 1.6;
      x += (dx / dist) * sp * dt;
      y += (dy / dist) * sp * dt;
    } else if (mode === 'walk') {
      x = tx;
      y = ty;
      mode = 'place';
      const fn = onArrive;
      onArrive = null;
      if (fn) fn();
      mode = 'idle';
    } else if (mode === 'idle') {
      heading += Math.sin(phase * 0.7) * 0.002;
    }
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    drawFly(x * r.width, y * r.height, Math.max(1.1, r.width / 280));
    requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);

  return {
    goTo,
    celebrate,
    resetPose,
    setReduced,
    setThink(on) {
      if (on) mode = 'think';
      else if (mode === 'think') mode = 'idle';
    },
    toFrac(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height };
    },
  };
}
