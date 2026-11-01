// Tiny canvas chart renderer (line and bar). No external libraries, works offline.
// datasets: [{label, data: [number|null], borderColor?, backgroundColor?, borderDash?}]
function chart(id, type, labels, datasets) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const bounds = canvas.getBoundingClientRect();
  const width = Math.max(260, Math.round(bounds.width || 320)), height = Math.max(170, Math.round(bounds.height || 210));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const left = 54, right = 14, top = 20, bottom = datasets.length > 1 ? 49 : 33;
  const plotW = width - left - right, plotH = height - top - bottom;
  const nums = datasets.flatMap((ds) => ds.data.filter((v) => typeof v === 'number' && Number.isFinite(v)));
  if (!nums.length) {
    ctx.fillStyle = '#84928b'; ctx.font = '12px system-ui';
    ctx.fillText('No recorded data yet', left, top + plotH / 2);
    return;
  }
  let min = Math.min(...nums), max = Math.max(...nums);
  if (type === 'bar') min = Math.min(0, min);
  if (max === min) { const pad = Math.max(1, Math.abs(max) * .025); min -= pad; max += pad; }
  else { const pad = (max - min) * .12; min -= pad; max += pad; }
  const y = (v) => top + plotH - (v - min) / (max - min) * plotH;

  // Grid and y axis
  ctx.font = '11px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  const step = (max - min) / 4, decimals = step >= 5 ? 0 : step >= .5 ? 1 : 2; // enough decimals that labels differ
  for (let i = 0; i <= 4; i++) {
    const val = min + step * i, yy = y(val);
    ctx.strokeStyle = '#e8eee9'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(width - right, yy); ctx.stroke();
    ctx.fillStyle = '#84928b';
    ctx.fillText(Number(val.toFixed(decimals)).toLocaleString('en-US', { maximumFractionDigits: decimals }), left - 8, yy);
  }

  // X axis: first, middle and last label
  const n = labels.length, x = (i) => left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  for (const i of new Set([0, Math.floor((n - 1) / 2), n - 1])) {
    ctx.fillStyle = '#84928b';
    ctx.fillText(String(labels[i] ?? ''), x(i), top + plotH + 9);
  }

  for (const ds of datasets) {
    const color = ds.borderColor || ds.backgroundColor || '#21855c';
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.5;
    if (type === 'bar') {
      const bw = Math.min(38, plotW / Math.max(n, 1) * .65);
      ds.data.forEach((v, i) => {
        if (v == null) return;
        ctx.fillStyle = ds.backgroundColor || color;
        ctx.fillRect(x(i) - bw / 2, Math.min(y(v), y(0)), bw, Math.max(2, Math.abs(y(0) - y(v))));
      });
      continue;
    }
    // Lines break across null values
    ctx.beginPath();
    let active = false;
    ds.data.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) { active = false; return; }
      if (!active) { ctx.moveTo(x(i), y(v)); active = true; } else ctx.lineTo(x(i), y(v));
    });
    if (ds.borderDash) ctx.setLineDash(ds.borderDash);
    ctx.stroke();
    ctx.setLineDash([]);
    if (ds.pointRadius === 0) continue;
    ds.data.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) return;
      ctx.beginPath(); ctx.arc(x(i), y(v), 3.5, 0, Math.PI * 2); ctx.fill();
    });
  }

  // Legend
  if (datasets.length > 1) {
    let offset = left;
    for (const ds of datasets) {
      ctx.fillStyle = ds.borderColor || '#21855c';
      ctx.fillRect(offset, height - 18, 10, 3);
      ctx.fillStyle = '#52645a'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '10px system-ui';
      ctx.fillText(ds.label, offset + 14, height - 16);
      offset += Math.min(155, ctx.measureText(ds.label).width + 31);
    }
  }
}
