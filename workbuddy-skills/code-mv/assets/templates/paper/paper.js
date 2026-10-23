// paper.js — 纸艺拼贴绘本：牛皮纸/旧报纸底纹 + 剪纸白边 + 撕纸毛边 + 层叠投影
// 1920×1080 原生 Canvas 2D 直绘（不走索引帧缓冲），10fps 步进 + 每层抖 1–2px。
//
// 为什么用 10fps 步进：手作质感靠"定格感"成立。24fps 全帧平滑反而像塑料动画。
// 抖动必须是"每层各抖各的"，整帧一起抖就成了画面在晃。

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const W = 1920, H = 1080;

// —— 确定性随机 ——
// 绝不能用 Math.random：渲染器是多进程分段抓帧的，
// 每个进程重新加载页面时纹理就会长得不一样，接缝处能直接看出来。
const rnd = s => { const x = Math.sin(s * 12.9898) * 43758.5453; return x - Math.floor(x); };
const R = (s, a, b) => a + (b - a) * rnd(s);

// —— 纸纹理（模块加载时生成一次，之后只做位移）——
// 句柄用临时 RGBA 调色，别写成 'rgba(90,70,44,.05)' 这样每颗粒都要拼字符串。
function paperTex(w, h, base, fiber, dust) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h / 90; i++) {              // 纸浆颗粒
    const x = rnd(i * 3.7) * w, y = rnd(i * 7.1 + 1) * h, r = .6 + rnd(i * 2.3) * 1.6;
    g.fillStyle = `rgba(${dust},${.03 + rnd(i * 5.9) * .07})`;
    g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
  }
  for (let i = 0; i < 260; i++) {                     // 纤维
    const x = rnd(i * 1.9 + 3) * w, y = rnd(i * 4.3 + 7) * h;
    const l = 20 + rnd(i * 6.1) * 90, a = (rnd(i * 8.7) - .5) * .5;
    g.strokeStyle = `rgba(${fiber},${.05 + rnd(i * 9.3) * .1})`;
    g.lineWidth = .7 + rnd(i * 1.3);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  return c;
}
const kraft = paperTex(W, H, '#cbb083', '90,70,44', '60,44,26');
const news = paperTex(W, H, '#e6dcc6', '120,110,96', '90,84,70');

// 旧报纸底纹：横排"文字" + 竖分栏线
(function newsprint() {
  const g = news.getContext('2d');
  g.globalAlpha = .1; g.fillStyle = '#3a3226';
  for (let col = 0; col < 5; col++) {
    let y = 40 + col * 30;
    for (let line = 0; line < 46; line++) {
      const w = 120 + rnd(col * 31 + line * 3.1) * 240;
      const x = 30 + col * 380 + rnd(col * 17 + line * 5.3) * 30;
      g.fillRect(x, y, w, 2.4);
      y += 7;
      if (y > H - 40) break;
    }
  }
  g.globalAlpha = .18; g.strokeStyle = '#2f2a20'; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const x = 60 + i * 210;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
  }
  g.globalAlpha = 1;
})();

// —— 撕纸边：沿每条边按 26px 采样，顶点做随机位移 ——
function torn(pts, amp, seed) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const segs = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 26));
    for (let k = 0; k < segs; k++) {
      const u = k / segs;
      const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
      const n = (rnd(seed + i * 7.7 + k * 3.3) - .5) * 2 * amp;
      out.push([x + n, y + n]);
    }
  }
  return out;
}
function path(pts) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

// —— 一个纸片：投影 → 白边 → 纸色 → 纸纹 ——
// 顺序不能换。先画颜色再描白边，白边会被纸色盖掉一半，剪纸感就没了。
function piece(pts, fill, o = {}) {
  const { edge = 12, shadow = 26, alpha = 1, tex = null, texOff = [0, 0] } = o;
  ctx.save(); ctx.globalAlpha = alpha;
  if (shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,20,.38)'; ctx.shadowBlur = shadow;
    ctx.shadowOffsetX = 10; ctx.shadowOffsetY = 14;
    path(pts); ctx.fillStyle = fill; ctx.fill();
    ctx.restore();
  }
  ctx.lineJoin = 'round'; ctx.lineWidth = edge; ctx.strokeStyle = '#f7f1e2';
  path(pts); ctx.stroke();
  ctx.fillStyle = fill; path(pts); ctx.fill();
  if (tex) {
    ctx.save();
    path(pts); ctx.clip();
    ctx.globalAlpha = .85;
    ctx.drawImage(tex, -texOff[0], -texOff[1], W * 1.4, H * 1.4);
    ctx.restore();
  }
  ctx.restore();
}

function leafShape(cx, cy, r, seed) {
  const pts = [];
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * 6.283;
    pts.push([
      cx + Math.cos(a) * r * R(seed + i, .82, 1.12),
      cy + Math.sin(a) * r * R(seed + i + 9, .82, 1.12),
    ]);
  }
  return pts;
}

// —— 剪纸关节人 ——
// 和像素版的区别：这里的四肢是"纸片 + 圆头"，不用关节角度，
// 只要腿/身/臂三个纸片各抖 1px 就有手作的呼吸感。
function doll(x, y, h, who, dir, act, ph, ex) {
  const s = dir, hr = h * .13;
  const lean = act === 'lean' ? -6 * s : 0;
  const hipY = y - h * .44, shY = y - h * .72, neck = shY - hr * .8;
  const bob = act === 'walk' ? Math.sin(ph * 6.28) * h * .012 : Math.sin(ph * 6.28) * h * .006;
  const sw = act === 'walk' ? Math.sin(ph * 6.28) : 0;

  ctx.save(); ctx.lineCap = 'round';
  const legs = [];
  for (const k of [-1, 1]) {
    const lx = x + k * h * .05;
    const fx = lx + sw * h * .10 * k, fy = hipY + h * .42;
    piece(torn([[lx - 11, hipY], [lx + 11, hipY], [fx + 10, fy], [fx - 10, fy]], 2, 200 + k + x),
      who === 'boy' ? '#4a4f63' : '#8f3f4a', { edge: 5, shadow: 12, tex: kraft });
    piece(torn([[fx - 12, fy - 4], [fx + 14 * s, fy - 4], [fx + 16 * s, fy + 12], [fx - 14, fy + 12]], 2, 210 + k + x),
      '#3a2f2a', { edge: 6, shadow: 8 });
    legs.push([lx, fx, fy]);
  }

  const bodyPts = [
    [x - h * .115, shY + bob], [x + h * .115, shY + bob],
    [x + h * .095 + lean, hipY], [x - h * .095 + lean, hipY],
  ];
  piece(torn(bodyPts, 3, 220 + x), who === 'boy' ? '#3f5a8c' : '#f2ece0',
    { edge: 10, shadow: 16, tex: who === 'boy' ? kraft : news });
  if (who === 'girl') {
    piece(torn([[x - h * .10, hipY], [x + h * .10, hipY], [x + h * .16, hipY + h * .16], [x - h * .16, hipY + h * .16]], 3, 230 + x),
      '#9c3f47', { edge: 9, shadow: 14, tex: kraft });
  }

  // 手臂：先画白边（粗），再画纸色（细），两层叠出剪纸白边
  const aa = act === 'lean' ? 12 : act === 'walk' ? sw * .8 : 6;
  for (const k of [-1, 1]) {
    const sx2 = x + k * h * .09, ex = sx2 + k * h * .05 + aa * .4 * s, ey = shY + h * .26;
    ctx.save(); ctx.strokeStyle = '#f7f1e2'; ctx.lineWidth = 15;
    ctx.beginPath(); ctx.moveTo(sx2, shY + 6 + bob); ctx.lineTo(ex, ey); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.strokeStyle = who === 'boy' ? '#3f5a8c' : '#f2ece0'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(sx2, shY + 6 + bob); ctx.lineTo(ex, ey); ctx.stroke(); ctx.restore();
    ctx.fillStyle = '#f0c9a8'; ctx.beginPath(); ctx.arc(ex, ey, 7, 0, 6.3); ctx.fill();
  }

  // 头
  const hx2 = x + lean * .5, hy2 = neck - hr * .2 + bob;
  ctx.save();
  ctx.shadowColor = 'rgba(60,40,20,.35)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#f7f1e2'; ctx.beginPath(); ctx.arc(hx2, hy2, hr + 7, 0, 6.3); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#f5d3b0'; ctx.beginPath(); ctx.arc(hx2, hy2, hr, 0, 6.3); ctx.fill();

  // 头发：先画在脸上，再把脸补回来 —— 反过来就会糊眼睛
  ctx.fillStyle = '#2f2620';
  if (who === 'boy') {
    ctx.beginPath(); ctx.arc(hx2, hy2 - hr * .18, hr * 1.02, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(hx2, hy2, hr * 1.06, Math.PI * .95, Math.PI * 2.05); ctx.fill();
    ctx.fillRect(hx2 - hr * 1.06, hy2 - hr * .1, hr * .42, hr * 1.9);
    ctx.fillRect(hx2 + hr * .64, hy2 - hr * .1, hr * .42, hr * 1.9);
  }

  // 五官
  const fx2 = hx2 + s * hr * .16;
  ctx.fillStyle = '#2b2118';
  if (ex === 'happy') { ctx.fillRect(fx2 - 8, hy2, 7, 3); ctx.fillRect(fx2 + 5, hy2, 7, 3); }
  else {
    ctx.beginPath();
    ctx.arc(fx2 - 5, hy2 + 2, 3.2, 0, 6.3);
    ctx.arc(fx2 + 7, hy2 + 2, 3.2, 0, 6.3);
    ctx.fill();
  }
  ctx.strokeStyle = '#b96a5a'; ctx.lineWidth = 2.4; ctx.beginPath();
  if (ex === 'sad') ctx.arc(fx2 + 1, hy2 + hr * .62, 6, Math.PI * 1.15, Math.PI * 1.85);
  else ctx.arc(fx2 + 1, hy2 + hr * .48, 6, .15, Math.PI - .15);
  ctx.stroke();
  if (ex === 'shy') {
    ctx.fillStyle = 'rgba(226,140,130,.55)'; ctx.beginPath();
    ctx.arc(hx2 - hr * .55, hy2 + hr * .35, 7, 0, 6.3);
    ctx.arc(hx2 + hr * .45, hy2 + hr * .35, 7, 0, 6.3);
    ctx.fill();
  }
  if (who === 'boy') {
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,20,.3)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
    ctx.fillStyle = '#8a6a45'; ctx.beginPath();
    ctx.ellipse(x - s * h * .13, shY + h * .16, h * .09, h * .12, 0, 0, 6.3); ctx.fill();
    ctx.restore();
  }
}

// ——————————————————— 字幕 ———————————————————
// 纸艺风的字幕不要用黑条（会破坏纸面），用一条撕纸白条 + 深棕字。
const SUBS = [
  [0.0, 4.2, '放学后的操场 只剩下风'],
  [4.2, 8.0, '我把想说的话 折成一张纸'],
];
const SUBY = 940;

function drawSubtitle(t) {
  const line = SUBS.find(([a, b]) => t >= a && t < b);
  if (!line) return null;
  const s = line[2];
  const k = Math.min(1, (t - line[0]) / .3) * Math.min(1, (line[1] - t) / .3);
  ctx.save();
  ctx.globalAlpha = Math.max(0, k);
  ctx.font = '500 46px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
  const tw = ctx.measureText(s).width;
  const pad = 54, bh = 84;
  piece(torn([[W / 2 - tw / 2 - pad, SUBY], [W / 2 + tw / 2 + pad, SUBY - 6],
              [W / 2 + tw / 2 + pad, SUBY + bh], [W / 2 - tw / 2 - pad, SUBY + bh + 4]], 5, 900),
    '#f4ecd8', { edge: 8, shadow: 22, tex: news });
  ctx.fillStyle = '#3a2e20';
  ctx.textBaseline = 'top';
  ctx.fillText(s, W / 2 - tw / 2, SUBY + 16);
  ctx.restore();
  return { s, x: Math.round(W / 2 - tw / 2), y: SUBY + 16, w: Math.round(tw), h: 52 };
}

// ——————————————————— 主渲染 ———————————————————
window.render = t => {
  const fr = Math.floor(t * 10);                    // 10fps 步进
  const jx = k => (rnd(fr * 1.7 + k) - .5) * 3;     // 每层抖 1–2px
  const jy = k => (rnd(fr * 2.3 + k + 5) - .5) * 3;

  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(kraft, 0, 0, W, H);
  ctx.save(); ctx.globalAlpha = .25; ctx.drawImage(news, 0, 0, W, H); ctx.restore();

  // 天空：旧报纸剪的大块 + 暖色纸片条
  piece(torn([[-40, -40], [W + 40, -40], [W + 40, 620], [-40, 620]], 10, 11), '#d8c3a0', { edge: 0, shadow: 0, tex: news });
  piece(torn([[-40, 380], [W + 40, 330], [W + 40, 640], [-40, 660]], 14, 21), '#e8b98a', { edge: 9, tex: news, shadow: 18 });
  piece(torn([[-40, 520], [W + 40, 500], [W + 40, 700], [-40, 700]], 12, 31), '#e0a071', { edge: 8, tex: kraft, shadow: 16 });

  // 落日：三层纸圆，越里越亮
  const sx = 1450 + jx(1), sy = 520 + jy(1);
  [[170, '#f2c268'], [130, '#f6d894'], [92, '#fbeccb']].forEach(([r, c], i) =>
    piece(torn(leafShape(sx, sy, r, 40 + i), 6, 40 + i), c, { edge: 8, shadow: 20, tex: kraft }));

  for (let i = 0; i < 3; i++) {
    const cx = 300 + i * 520 + Math.sin(t * .2 + i) * 6, cy = 210 + i * 42;
    piece(torn(leafShape(cx, cy, 90 + i * 18, 60 + i), 9, 60 + i), '#f0e4cd', { edge: 10, shadow: 16, tex: news });
  }

  // 教学楼
  const bx = 250 + jx(2), by = 300 + jy(2);
  piece(torn([[bx, by], [bx + 720, by - 12], [bx + 730, by + 470], [bx - 8, by + 480]], 8, 70),
    '#5d6b80', { edge: 14, shadow: 30, tex: news });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) {
    const wx = bx + 40 + c * 86, wy = by + 46 + r * 140;
    piece(torn([[wx, wy], [wx + 52, wy], [wx + 52, wy + 84], [wx, wy + 84]], 3, 80 + r * 8 + c),
      c % 3 === 0 ? '#f7cf86' : '#33415a', { edge: 6, shadow: 10, tex: kraft });
    ctx.strokeStyle = 'rgba(247,241,226,.85)'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(wx + 26, wy); ctx.lineTo(wx + 26, wy + 84);
    ctx.moveTo(wx, wy + 42); ctx.lineTo(wx + 52, wy + 42);
    ctx.stroke();
  }
  piece([[bx + 560, by - 6], [bx + 570, by - 200], [bx + 580, by - 6]], '#8c8f96', { edge: 6, shadow: 10 });
  piece(torn([[bx + 570, by - 200], [bx + 660, by - 176], [bx + 570, by - 150]], 3, 91), '#c9524a', { edge: 7, shadow: 12, tex: kraft });

  // 地面：三层纸带
  piece(torn([[-40, 660], [W + 40, 640], [W + 40, 780], [-40, 790]], 10, 100), '#a98a5f', { edge: 12, tex: kraft, shadow: 26 });
  piece(torn([[-40, 760], [W + 40, 740], [W + 40, H + 40], [-40, H + 40]], 12, 110), '#8c6f4a', { edge: 10, tex: kraft, shadow: 22 });
  for (let i = 0; i < 5; i++) {
    const y = 640 + i * 34, x0 = 470 - i * 26, x1 = 980 + i * 26;
    piece(torn([[x0, y], [x1, y - 4], [x1, y + 30], [x0, y + 32]], 4, 120 + i),
      i % 2 ? '#cfc2a8' : '#ddd0b6', { edge: 8, shadow: 14, tex: news });
  }

  // 梧桐
  const tx = 1640 + jx(3), ty = 800 + jy(3);
  piece(torn([[tx - 26, ty], [tx - 16, ty - 420], [tx + 26, ty - 420], [tx + 34, ty]], 7, 130), '#7a5a38', { edge: 12, shadow: 26, tex: kraft });
  [[tx - 10, ty - 470, 150], [tx - 150, ty - 400, 110], [tx + 140, ty - 410, 120]].forEach(([cx, cy, r], i) =>
    piece(torn(leafShape(cx, cy, r, 140 + i), 10, 140 + i), i ? '#7d9c5c' : '#5f8149', { edge: 12, shadow: 24, tex: kraft }));
  for (let i = 0; i < 26; i++) {
    const a = rnd(i * 3.1) * 6.28, rr = rnd(i * 5.7) * 140;
    ctx.fillStyle = '#f4d78a';
    ctx.beginPath(); ctx.arc(tx + Math.cos(a) * rr, ty - 440 + Math.sin(a) * rr * .8, 3.2, 0, 6.3); ctx.fill();
  }

  // 校门
  for (const px of [1150, 1330]) {
    piece(torn([[px, 790], [px + 54, 790], [px + 54, 610], [px, 610]], 3, 150 + px), '#b4553f', { edge: 9, shadow: 18, tex: kraft });
    for (let i = 0; i < 5; i++) { ctx.fillStyle = 'rgba(90,40,30,.35)'; ctx.fillRect(px + 4, 620 + i * 32, 46, 3); }
    piece(torn([[px - 10, 606], [px + 64, 606], [px + 64, 590], [px - 10, 590]], 3, 160 + px), '#8f4232', { edge: 8, shadow: 14, tex: kraft });
  }
  ctx.save(); ctx.strokeStyle = '#3d4650'; ctx.lineWidth = 5;
  for (let i = 0; i < 22; i++) {
    const x = 1150 + 54 + i * 6;
    ctx.beginPath(); ctx.moveTo(x, 630); ctx.lineTo(x, 786); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(1204, 636); ctx.lineTo(1330, 636); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(1204, 710); ctx.lineTo(1330, 710); ctx.stroke(); ctx.restore();
  piece(torn([[1218, 560], [1300, 556], [1300, 596], [1218, 600]], 3, 170), '#f4ecd8', { edge: 7, shadow: 12, tex: news });

  // 人物
  doll(1545, 812, 330, 'boy', -1, 'lean', t * .4, 'calm');
  doll(760 - (t % 4) * 5, 792, 310, 'girl', 1, 'walk', t * 1.2, 'calm');

  // 前景贴纸叶
  [[90, 1000, 70], [150, 1060, 52]].forEach(([x, y, r], i) =>
    piece(torn(leafShape(x, y, r, 300 + i), 8, 300 + i), i ? '#6f8f4e' : '#55703a', { edge: 10, shadow: 26, tex: kraft }));

  // 光斑 + 暗角：纸张的"旧"
  ctx.globalAlpha = .07;
  for (let i = 0; i < 30; i++) {
    const x = R(i * 1.7, 0, W), y = R(i * 2.9, 0, H), r = R(i * 3.3, 40, 190);
    ctx.fillStyle = i % 2 ? '#fff3d0' : '#6b5233';
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(W / 2, H / 2, H * .45, W / 2, H / 2, H * 1.1);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(40,26,12,.42)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const texts = [];
  const sub = drawSubtitle(t);
  if (sub) texts.push(sub);
  return texts;
};

window.TEXTS = t => {
  const out = [];
  const line = SUBS.find(([a, b]) => t >= a && t < b);
  if (line) out.push({ s: line[2], x: 0, y: SUBY + 16, w: W, h: 52 });
  return out;
};

window.DUR = 8;
window.READY = true;
