// crayon.js — 蜡笔手绘绘本：暖白纸 + 蜡笔块面（蜡只挂在纸纹凸起上）+ 抖动勾线 + 一道水彩罩染
// 1920×1080 原生 Canvas 2D，12fps 沸腾（boiling line）。
//
// 三个关键，缺一个就不像蜡笔：
//   1) 每个色块单独画在离屏 canvas 上，再用 destination-out 打掉颗粒 —— 蜡笔的"透"来自纸纹；
//   2) 轮廓必须手抖（wobble），且每 1/12 秒换一次种子 —— 线条才会"活"；
//   3) 所有随机都必须是确定性随机：多进程分段渲染，Math.random 会让接缝处换一种纸。

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const W = 1920, H = 1080;

const rnd = s => { const x = Math.sin(s * 78.233) * 43758.5453; return x - Math.floor(x); };
const R = (s, a, b) => a + (b - a) * rnd(s);

// —— 纸：暖白 + 纸纹 ——
const paper = document.createElement('canvas'); paper.width = W; paper.height = H;
(function () {
  const g = paper.getContext('2d');
  g.fillStyle = '#f5efe2'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90000; i++) {
    const x = rnd(i * 1.7) * W, y = rnd(i * 3.1) * H;
    g.fillStyle = `rgba(120,105,80,${rnd(i * 5.3) * .07})`;
    g.fillRect(x, y, 1 + rnd(i * 7.9) * 2, 1);
  }
  for (let i = 0; i < 400; i++) {   // 纸纤维
    const x = rnd(i * 2.3 + 11) * W, y = rnd(i * 4.7 + 13) * H, l = 10 + rnd(i * 6.1) * 50;
    g.strokeStyle = `rgba(150,135,105,${rnd(i * 8.3) * .12})`; g.lineWidth = .8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (rnd(i * 9.7) - .5) * 6); g.stroke();
  }
})();

// 蜡笔颗粒遮罩：同一张反复用，位置按 seed 偏移 —— 这就是"沸腾感"的来源
const grain = document.createElement('canvas'); grain.width = 256; grain.height = 256;
(function () {
  const g = grain.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x += 2) {
    const v = rnd(x * .37 + y * 1.31);
    if (v > .34) { g.fillStyle = `rgba(255,255,255,${.25 + v * .75})`; g.fillRect(x, y, 2, 1); }
  }
})();

// —— 一块蜡笔色 ——
// 块面填色 → 斜向笔触 → 压力不匀的短笔划 → 纸纹镂空 → 重描轮廓
function crayon(pts, col, o = {}) {
  const { wobble = 2.2, hatch = .22, grainAmt = .46, seed = 1, stroke = null } = o;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const pad = 14, w = Math.ceil(x1 - x0 + pad * 2), h = Math.ceil(y1 - y0 + pad * 2);
  const c = document.createElement('canvas'); c.width = Math.max(2, w); c.height = Math.max(2, h);
  const g = c.getContext('2d');
  g.translate(-x0 + pad, -y0 + pad);

  // 轮廓（手抖）
  const wob = () => (rnd(seed + pts.length * 3.7) - .5) * 2 * wobble;
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (i === 0) g.moveTo(a[0] + wob(), a[1] + wob());
    const mx = (a[0] + b[0]) / 2 + wob() * 1.6, my = (a[1] + b[1]) / 2 + wob() * 1.6;
    g.quadraticCurveTo(mx, my, b[0] + wob(), b[1] + wob());
  }
  g.closePath();
  g.fillStyle = col; g.globalAlpha = .93; g.fill();

  // 斜向笔触：同一支蜡笔来回涂，留缝
  g.save(); g.clip();
  g.globalAlpha = hatch;
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3;
  for (let i = -h; i < w + h; i += 9) {
    g.beginPath(); g.moveTo(i, -pad); g.lineTo(i + h * .55, h + pad); g.stroke();
  }
  g.globalAlpha = .1; g.strokeStyle = '#fff'; g.lineWidth = 2;
  for (let i = -h; i < w + h; i += 13) {
    g.beginPath(); g.moveTo(i + 4, -pad); g.lineTo(i + h * .55 + 4, h + pad); g.stroke();
  }
  g.restore();

  // 压力不匀的短笔划
  g.save(); g.clip();
  for (let i = 0; i < Math.min(160, w * h / 900); i++) {
    const px = rnd(seed * 11.1 + i * 2.3) * w, py = rnd(seed * 13.7 + i * 3.1) * h;
    const l = 16 + rnd(seed + i) * 46, a = -0.9 + (rnd(seed * 3 + i) - .5) * .5;
    g.strokeStyle = i % 3 ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.16)';
    g.lineWidth = 2 + rnd(seed + i * 5) * 4;
    g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke();
  }
  g.restore();

  // 纸纹镂空：蜡只挂在纸的凸起上
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = grainAmt;
  const ox = Math.floor(rnd(seed * 2.1) * 256), oy = Math.floor(rnd(seed * 3.3) * 256);
  g.fillStyle = g.createPattern(grain, 'repeat');
  g.translate(-ox, -oy); g.fillRect(0, 0, w + 256, h + 256); g.translate(ox, oy);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;

  // 重描轮廓：深色蜡笔线，不闭合，两头出线
  if (stroke) {
    g.beginPath();
    let started = false;
    for (let i = 0; i <= pts.length; i++) {
      const a = pts[i % pts.length];
      const jx = (rnd(seed * 5.1 + i * 1.7) - .5) * 5, jy = (rnd(seed * 7.3 + i * 2.9) - .5) * 5;
      if (!started) { g.moveTo(a[0] + jx, a[1] + jy); started = true; } else g.lineTo(a[0] + jx, a[1] + jy);
    }
    g.strokeStyle = stroke; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round';
    g.globalAlpha = .9; g.stroke();
  }
  ctx.drawImage(c, x0 - pad, y0 - pad);
}

function ellipsePts(cx, cy, rx, ry, n = 14, seed = 1) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * 6.283, k = R(seed + i, .78, 1.18);
    p.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return p;
}

// 水彩罩染：一道就够，多了就脏
let wash = null;
function makeWash() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 640);
  grd.addColorStop(0, 'rgba(198,110,96,.34)');
  grd.addColorStop(.62, 'rgba(226,150,110,.20)');
  grd.addColorStop(1, 'rgba(226,180,140,0)');
  g.fillStyle = grd; g.fillRect(0, 0, W, 640);
  for (let i = 0; i < 24; i++) {   // 水痕
    g.strokeStyle = `rgba(190,100,90,${.05 + rnd(i * 3.7) * .07})`;
    g.lineWidth = 6 + rnd(i * 5.1) * 16;
    g.beginPath();
    g.moveTo(rnd(i * 7.3) * W, 0);
    g.bezierCurveTo(rnd(i * 9.1) * W, 200, rnd(i * 11.3) * W, 420, rnd(i * 13.7) * W, 620);
    g.stroke();
  }
  return c;
}

// ——————————————————— 字幕 ———————————————————
// 蜡笔风的字幕：一条手撕形状的暖白纸 + 深棕字，不用黑条
const SUBS = [
  [0.0, 4.2, '放学后的操场 只剩下风'],
  [4.2, 8.0, '我把想说的话 折成一张纸'],
];

function drawSubtitle(t, S) {
  const line = SUBS.find(([a, b]) => t >= a && t < b);
  if (!line) return null;
  const s = line[2];
  const k = Math.min(1, (t - line[0]) / .3) * Math.min(1, (line[1] - t) / .3);
  ctx.save();
  ctx.globalAlpha = Math.max(0, k);
  ctx.font = '500 46px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
  const tw = ctx.measureText(s).width, pad = 56, y = 930, bh = 86;
  crayon([
    [W / 2 - tw / 2 - pad, y], [W / 2 + tw / 2 + pad, y - 5],
    [W / 2 + tw / 2 + pad - 4, y + bh], [W / 2 - tw / 2 - pad + 3, y + bh + 3],
  ], '#fdf8ec', { seed: S + 700, grainAmt: .34, wobble: 1.8, stroke: '#a2937c' });
  ctx.fillStyle = '#3a2e20';
  ctx.textBaseline = 'top';
  ctx.fillText(s, W / 2 - tw / 2, y + 16);
  ctx.restore();
  return { s, x: Math.round(W / 2 - tw / 2), y: y + 16, w: Math.round(tw), h: 52 };
}

// ——————————————————— 主渲染 ———————————————————
window.render = t => {
  const fr = Math.floor(t * 12);                 // 12fps 沸腾
  const S = 1 + fr * .0137;                      // 每帧换抖动种子
  ctx.drawImage(paper, 0, 0, W, H);
  if (!wash) wash = makeWash();

  // 天空
  crayon([[-40, -40], [W + 40, -40], [W + 40, 520], [-40, 520]], '#cfd9e2', { seed: S + 1, grainAmt: .42, hatch: .12 });
  crayon([[-40, 400], [W + 40, 360], [W + 40, 640], [-40, 660]], '#f0c398', { seed: S + 2, grainAmt: .38, hatch: .16 });
  crayon(ellipsePts(1420, 470, 120, 120, 13, S + 3), '#f2c25e', { seed: S + 3, grainAmt: .3, stroke: '#c8813a' });
  crayon(ellipsePts(1420, 470, 78, 78, 11, S + 4), '#f8e0a8', { seed: S + 4, grainAmt: .3 });
  for (let i = 0; i < 3; i++) {
    const cx = 340 + i * 520, cy = 190 + i * 40;
    crayon(ellipsePts(cx, cy, 110, 52, 18, S + 10 + i), '#fbf4e4', { seed: S + 10 + i, grainAmt: .5, stroke: '#b9c6cf' });
  }

  // 歪房子（儿童透视：一个正面 + 一个斜侧面，故意不对齐）
  crayon([[220, 300], [760, 274], [770, 700], [214, 716]], '#7d8ea6', { seed: S + 20, stroke: '#2f3a52', grainAmt: .3 });
  crayon([[760, 274], [900, 330], [906, 640], [770, 700]], '#63758c', { seed: S + 21, stroke: '#2f3a52', grainAmt: .32 });
  crayon([[200, 300], [780, 268], [790, 300], [212, 330]], '#8c5a4a', { seed: S + 22, stroke: '#3a221c', grainAmt: .28 });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    const x = 262 + c * 100, y = 340 + r * 118;
    crayon([[x, y], [x + 62, y - 3], [x + 64, y + 84], [x, y + 86]],
      (r + c) % 3 === 0 ? '#f7cd74' : '#4b5d78',
      { seed: S + 30 + r * 7 + c, stroke: '#2f3a52', grainAmt: .34, wobble: 1.6 });
  }
  crayon([[700, 270], [706, 60], [714, 270]], '#9aa3ad', { seed: S + 50, grainAmt: .3 });
  crayon([[714, 68], [830, 96], [714, 132]], '#c9524a', { seed: S + 51, stroke: '#6d2a24', grainAmt: .3 });

  // 地面 + 台阶
  crayon([[-40, 690], [W + 40, 660], [W + 40, 800], [-40, 810]], '#c9a271', { seed: S + 60, grainAmt: .26, hatch: .2 });
  crayon([[-40, 780], [W + 40, 756], [W + 40, H + 40], [-40, H + 40]], '#a87c50', { seed: S + 61, grainAmt: .24, hatch: .22 });
  for (let i = 0; i < 5; i++) {
    const y = 690 + i * 30, x0 = 420 - i * 22, x1 = 980 + i * 22;
    crayon([[x0, y], [x1, y - 5], [x1, y + 26], [x0, y + 30]],
      i % 2 ? '#ded3bb' : '#e8ddc7', { seed: S + 70 + i, stroke: '#8d7a5c', grainAmt: .36 });
  }

  // 梧桐
  crayon([[1600, 810], [1612, 380], [1668, 380], [1682, 810]], '#8a6242', { seed: S + 80, stroke: '#3f2a1a', grainAmt: .3 });
  [[1640, 320, 190, 150], [1500, 400, 130, 110], [1780, 390, 140, 120]].forEach(([cx, cy, rx, ry], i) =>
    crayon(ellipsePts(cx, cy, rx, ry, 22, S + 90 + i), i ? '#93b06a' : '#6f9450',
      { seed: S + 90 + i, stroke: '#38532c', grainAmt: .34 }));

  // 校门
  [[1080, 760, 54, 150], [1270, 760, 54, 150]].forEach(([x, y, w2, h2], i) => {
    crayon([[x, y], [x + w2, y - 3], [x + w2 - 2, y - h2], [x + 2, y - h2 + 3]],
      '#b4553f', { seed: S + 100 + i, stroke: '#5c2419', grainAmt: .3 });
  });
  ctx.save(); ctx.strokeStyle = 'rgba(47,58,82,.8)'; ctx.lineWidth = 4;
  for (let i = 0; i < 18; i++) {
    const x = 1136 + i * 8;
    ctx.beginPath(); ctx.moveTo(x, 640); ctx.lineTo(x, 750); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(1136, 646); ctx.lineTo(1270, 646); ctx.stroke(); ctx.restore();

  // 孩子：2.5 头身、点眼、粉颊
  const kid = (x, y, h, who, dir, act, ph, ex) => {
    const s = dir, hr = h * .19, hipY = y - h * .34, shY = y - h * .62;
    const step = act === 'walk' ? Math.sin(ph * 6.28) : 0;
    const bob = Math.sin(ph * 6.28) * h * .008;
    for (const k of [-1, 1]) {
      const lx = x + k * h * .055, fx = lx + step * k * h * .06;
      crayon([[lx - 9, hipY], [lx + 9, hipY], [fx + 8, hipY + h * .34], [fx - 8, hipY + h * .34]],
        who === 'boy' ? '#6b7280' : '#c07a72', { seed: S + 200 + k + x, stroke: '#3a3038', grainAmt: .34, wobble: 1.6 });
      crayon([[fx - 12, hipY + h * .32], [fx + 15, hipY + h * .32], [fx + 14, hipY + h * .38], [fx - 13, hipY + h * .38]],
        '#4a3a34', { seed: S + 210 + k + x, grainAmt: .3, wobble: 1.2 });
    }
    crayon([[x - h * .10, shY + bob], [x + h * .10, shY + bob], [x + h * .095, hipY], [x - h * .095, hipY]],
      who === 'boy' ? '#5b6f9e' : '#fdf8ec',
      { seed: S + 220 + x, stroke: who === 'boy' ? '#2d3a58' : '#8a7a6a', grainAmt: .3 });
    if (who === 'girl') {
      crayon([[x - h * .10, hipY - 4], [x + h * .10, hipY - 4], [x + h * .17, hipY + h * .16], [x - h * .17, hipY + h * .16]],
        '#b04a52', { seed: S + 230 + x, stroke: '#5e2026', grainAmt: .3 });
    }
    for (const k of [-1, 1]) {
      const sx2 = x + k * h * .10, ex2 = sx2 + k * h * .04, ey = shY + h * .26;
      ctx.save(); ctx.lineCap = 'round';
      ctx.strokeStyle = who === 'boy' ? '#5b6f9e' : '#fdf8ec'; ctx.lineWidth = 17;
      ctx.beginPath(); ctx.moveTo(sx2, shY + 8 + bob); ctx.quadraticCurveTo(sx2 + k * 10, shY + h * .16, ex2, ey); ctx.stroke();
      ctx.strokeStyle = who === 'boy' ? '#2d3a58' : '#8a7a6a'; ctx.lineWidth = 3; ctx.globalAlpha = .6;
      ctx.beginPath(); ctx.moveTo(sx2, shY + 8 + bob); ctx.quadraticCurveTo(sx2 + k * 10, shY + h * .16, ex2, ey); ctx.stroke();
      ctx.restore();
      crayon(ellipsePts(ex2, ey, 9, 9, 8, S + 240 + k + x), '#f6d3ae', { seed: S + 240 + k + x, grainAmt: .3, wobble: 1 });
    }
    // 头：先画整块，再画头发，最后把脸补回来 —— 顺序反了就是"头发糊住脸"
    const hx2 = x, hy2 = shY - hr * .62 + bob;
    crayon(ellipsePts(hx2, hy2, hr, hr * 1.02, 13, S + 250 + x), '#f9d9b6', { seed: S + 250 + x, stroke: '#8a5a3a', grainAmt: .22 });
    if (who === 'boy') {
      crayon([[hx2 - hr * 1.02, hy2 - hr * .1], [hx2 - hr * .8, hy2 - hr * .95], [hx2 + hr * .5, hy2 - hr * 1.1],
              [hx2 + hr * 1.0, hy2 - hr * .5], [hx2 + hr * 1.0, hy2 - hr * .08]],
        '#2e2823', { seed: S + 260 + x, stroke: '#1b1613', grainAmt: .22, wobble: 1.4 });
    } else {
      crayon(ellipsePts(hx2, hy2 - hr * .56, hr * 1.02, hr * .62, 14, S + 261 + x), '#2e2823', { seed: S + 261 + x, stroke: '#1b1613', grainAmt: .22, wobble: 1.2 });
      crayon([[hx2 - hr * 1.02, hy2 - hr * .42], [hx2 - hr * .62, hy2 - hr * .42], [hx2 - hr * .58, hy2 + hr * 1.75], [hx2 - hr * .98, hy2 + hr * 1.8]], '#2e2823', { seed: S + 262 + x, grainAmt: .22, wobble: .8 });
      crayon([[hx2 + hr * .58, hy2 - hr * .42], [hx2 + hr * 1.02, hy2 - hr * .42], [hx2 + hr * .98, hy2 + hr * 1.8], [hx2 + hr * .55, hy2 + hr * 1.78]], '#2e2823', { seed: S + 263 + x, grainAmt: .22, wobble: .8 });
      crayon([[hx2 - hr * .86, hy2 - hr * .46], [hx2 + hr * .86, hy2 - hr * .5], [hx2 + hr * .76, hy2 - hr * .3], [hx2 - hr * .78, hy2 - hr * .28]], '#2e2823', { seed: S + 264 + x, grainAmt: .22, wobble: .8 });
    }
    crayon(ellipsePts(hx2, hy2 + hr * .16, hr * .74, hr * .76, 12, S + 265 + x), '#f9d9b6', { seed: S + 265 + x, grainAmt: .2, wobble: 1 });
    // 五官
    const fx = hx2 + s * hr * .12;
    ctx.fillStyle = '#2b2118';
    if (ex === 'happy') { ctx.fillRect(fx - 9, hy2 + 2, 9, 3.4); ctx.fillRect(fx + 5, hy2 + 2, 9, 3.4); }
    else {
      ctx.beginPath();
      ctx.arc(fx - 6, hy2 + 4, 4, 0, 6.3);
      ctx.arc(fx + 7, hy2 + 4, 4, 0, 6.3);
      ctx.fill();
    }
    ctx.strokeStyle = '#b05a4a'; ctx.lineWidth = 3; ctx.beginPath();
    if (ex === 'sad') ctx.arc(fx + 1, hy2 + hr * .62, 8, Math.PI * 1.12, Math.PI * 1.88);
    else ctx.arc(fx + 1, hy2 + hr * .42, 8, .1, Math.PI - .1);
    ctx.stroke();
    ctx.fillStyle = 'rgba(232,140,130,.45)';
    ctx.beginPath();
    ctx.arc(hx2 - hr * .58, hy2 + hr * .38, 9, 0, 6.3);
    ctx.arc(hx2 + hr * .5, hy2 + hr * .38, 9, 0, 6.3);
    ctx.fill();
    if (who === 'boy') {
      ctx.save(); ctx.strokeStyle = '#8a6242'; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - s * h * .08, shY + 6); ctx.lineTo(x + s * h * .07, hipY + 2); ctx.stroke();
      ctx.restore();
    }
  };
  kid(1520, 812, 300, 'boy', -1, 'lean', t * .4, 'calm');
  kid(720 - (t % 4) * 6, 790, 286, 'girl', 1, 'walk', t * 1.2, 'calm');

  // 水彩罩染在最上层，轻
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .55; ctx.drawImage(wash, 0, 0); ctx.restore();
  ctx.save(); ctx.globalAlpha = .05; ctx.drawImage(paper, 0, 0); ctx.restore();

  const texts = [];
  const sub = drawSubtitle(t, S);
  if (sub) texts.push(sub);
  return texts;
};

window.TEXTS = t => {
  const out = [];
  const line = SUBS.find(([a, b]) => t >= a && t < b);
  if (line) out.push({ s: line[2], x: 0, y: 946, w: W, h: 52 });
  return out;
};

window.DUR = 8;
window.READY = true;
