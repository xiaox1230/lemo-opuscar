// scenes.js — 场景零件（中景物件）
// 每个零件只吃整数坐标；随机一律走 h1()，保证确定性重渲。
//
// 画法约定：先暗后亮、先轮廓后实体。
// 每个物件都先铺一圈 C.ink 再画本体，像素画面才有"贴纸"感，不会和背景糊在一起。

import { C } from '../core/palette.js';
import { bayer } from '../core/render.js';
import { h1 } from './sky.js';

// —— 教学楼：多层，亮窗比例可控（傍晚/深夜只差一个 lit）——
export function building(fb, x, y, w, h, t = 0, o = {}) {
  const { lit = 1, floors = 3, wall = C.deep, trim = C.plum, base = C.night } = o;
  fb.rect(x - 1, y - 1, w + 2, h + 2, C.ink);
  fb.rect(x, y, w, h, wall);
  fb.rect(x, y, w, 3, trim);                    // 檐口
  fb.rect(x, y + h - 4, w, 4, base);            // 基座
  const fh = (h - 8) / floors;
  for (let f = 0; f < floors; f++) {
    const fy = y + 4 + f * fh;
    fb.rect(x, fy + fh - 4, w, 1, trim);        // 走廊栏杆
    for (let i = 2; i < w - 2; i += 4) fb.px(x + i, fy + fh - 3, trim);
    for (let i = 6; i < w - 6; i += 9) {
      const on = h1(i * 3 + f * 17) < .55 * lit;
      fb.rect(x + i, fy + 2, 5, fh - 8, on ? C.warm : C.night);
      if (on) { fb.rect(x + i, fy + 2, 5, 1, C.gold); fb.px(x + i + 2, fy + 4, C.paper); }
      fb.vline(x + i + 5, fy + 2, fy + fh - 7, C.ink);
    }
  }
  // 楼顶：水塔 + 旗杆
  fb.rect(x + w * .55, y - 6, 8, 6, C.woodDark);
  fb.rect(x + w * .55 - 1, y - 7, 10, 1, C.wood);
  fb.vline(x + 6, y - 14, y - 1, C.silver);
  fb.rect(x + 7, y - 14, 5, 3, C.wine);
}

// —— 校门：两根砖柱 + 铁艺门 + 校牌 ——
export function gate(fb, x, y, h = 40, gap = 40) {
  const pw = 6;
  for (const px of [x, x + gap]) {
    fb.rect(px - 1, y - h - 1, pw + 2, h + 2, C.ink);
    fb.rect(px, y - h, pw, h, C.rust);
    for (let j = 0; j < h; j += 3) fb.rect(px, y - h + j, pw, 1, C.wine);
    fb.rect(px - 2, y - h - 4, pw + 4, 4, C.plum);
    fb.rect(px - 1, y - h - 6, pw + 2, 2, C.ink);
  }
  for (let i = 0; i < 14; i++) fb.vline(x + pw + i * 2.6, y - h + 6, y - 2, C.night);
  fb.rect(x + pw, y - h + 4, gap - 6, 1, C.night);
  fb.rect(x + pw, y - h + 16, gap - 6, 1, C.night);
  fb.rect(x + 12, y - h - 2, 16, 4, C.paper);
  fb.rect(x + 13, y - h - 1, 14, 2, C.blue);
}

// —— 树：树干 + 几团树冠 + 叶隙光点。wind 让树冠轻轻摆 ——
export function tree(fb, x, baseY, s = 1, t = 0, o = {}) {
  const { sway = 1, leaves = 1, trunk = C.wood, crown = C.leaf, crownDark = C.pine } = o;
  const th = 46 * s, tr = 2.2 * s;
  const wind = Math.sin(t * .7) * sway;
  fb.rect(x - tr - 1, baseY - th - 1, tr * 2 + 2, th + 2, C.ink);
  fb.rect(x - tr, baseY - th, tr * 2, th, trunk);
  fb.rect(x - tr, baseY - th, 1, th, C.woodDark);
  fb.line(x, baseY - th * .55, x - 9 * s + wind, baseY - th - 8 * s, trunk, Math.max(1, tr * .8));
  fb.line(x + tr * .6, baseY - th * .62, x + 10 * s + wind, baseY - th - 10 * s, trunk, Math.max(1, tr * .7));

  const cy = baseY - th - 10 * s;
  const blobs = [[0, 0, 16], [-13, 4, 11], [13, 3, 12], [-6, -8, 10], [8, -9, 9]];
  for (const [dx, dy, r] of blobs) {
    const RR = r * s;
    fb.ellipse(x + dx * s + wind * 1.4, cy + dy * s, RR + 1, RR * .85 + 1, crownDark);
    fb.ellipse(x + dx * s + wind * 1.4, cy + dy * s, RR, RR * .85, crown);
    fb.ellipse(x + dx * s + wind * 1.4 - RR * .3, cy + dy * s - RR * .3, RR * .55, RR * .45, C.grass);
  }
  for (let k = 0; k < 14 * leaves; k++) {
    const a = h1(k * 7.3) * 6.28, rr = h1(k * 3.1) * 14 * s;
    fb.px(x + Math.cos(a) * rr + wind * 1.4, cy + Math.sin(a) * rr * .8, k % 3 ? C.young : C.straw);
  }
}

// —— 地面：砖地 + 长影 ——
export function ground(fb, y0, y1, o = {}) {
  const { base = C.bark, line = C.wood, shadow = 1, away = C.woodDark, x0 = 0, x1 = fb.w } = o;
  fb.rect(x0, y0, x1 - x0, y1 - y0, base);
  for (let j = y0; j < y1; j += 6) {
    fb.hline(x0, x1 - 1, j, line);
    for (let x = x0 + ((j / 6) % 2) * 7; x < x1; x += 14) fb.vline(x, j, j + 5, line);
  }
  fb.rect(x0, y1 - 6, x1 - x0, 6, away);
  if (shadow) for (let i = x0; i < x1; i += 2) fb.px(i, y0 + 1 + (i % 4) * .5, away);
}

// —— 台阶
// 三条不同颜色的线（踏面 / 棱线 / 立面）是必须的：
// 只用一条色块画台阶，在 320×180 里会变成一排钢琴键。
export function steps(fb, x, y, w, n = 4, dir = 1) {
  for (let i = 0; i < n; i++) {
    const yy = y + i * 3;
    fb.rect(x - i * 2 * dir, yy, w + i * 4 * dir, 3, C.silver);        // 踏面
    fb.hline(x - i * 2 * dir, x + w + i * 3 * dir, yy, C.haze);        // 棱线
    fb.hline(x - i * 2 * dir, x + w + i * 3 * dir, yy + 2, C.dusk);    // 立面阴影
  }
}

// —— 自行车（静态，斜靠）——
export function bike(fb, x, y, s = 1, dir = 1) {
  const r = 5 * s;
  fb.ellipse(x, y - r, r, r, C.night, false);
  fb.ellipse(x, y - r, r - 1, r - 1, C.night, false);
  fb.ellipse(x + 13 * s * dir, y - r, r, r, C.night, false);
  fb.ellipse(x + 13 * s * dir, y - r, r - 1, r - 1, C.night, false);
  fb.line(x, y - r, x + 5 * s * dir, y - r * 2.4, C.silver, 1);
  fb.line(x + 5 * s * dir, y - r * 2.4, x + 10 * s * dir, y - r * 2.4, C.silver, 1);
  fb.line(x + 10 * s * dir, y - r * 2.4, x + 13 * s * dir, y - r, C.silver, 1);
  fb.line(x, y - r, x + 7 * s * dir, y - r, C.silver, 1);
  fb.px(x + 9 * s * dir, y - r * 2.6, C.ink);
}

// —— 路灯：杆 + 罩 + 抖动光晕 ——
export function lamp(fb, x, baseY, h = 40) {
  fb.rect(x - 1, baseY - h, 2, h, C.ink);
  fb.rect(x - 3, baseY - 3, 6, 3, C.woodDark);
  fb.rect(x - 1, baseY - h - 5, 2, 5, C.ink);
  fb.rect(x - 4, baseY - h - 9, 8, 4, C.night);
  fb.rect(x - 1, baseY - h - 8, 3, 2, C.gold);
  for (let r = 3; r <= 7; r++) for (let a = 0; a < 14; a++) {
    const ang = a / 14 * 6.28;
    const X = x + Math.cos(ang) * r, Y = baseY - h - 7 + Math.sin(ang) * r * .75;
    if (bayer(Math.round(X), Math.round(Y)) < .55 - r * .06) fb.px(X, Y, r < 5 ? C.warm : C.fire);
  }
}

// —— 教室（宽景版：黑板 + 后窗 + 课桌）——
export function classroom(fb, t = 0, o = {}) {
  const { dusk = 1 } = o;
  fb.rect(0, 0, fb.w, 112, C.silver);
  fb.rect(0, 0, fb.w, 4, C.haze);
  for (const wx of [10, 96, 182]) {
    fb.rect(wx, 14, 46, 34, C.deep);
    fb.rect(wx + 1, 15, 44, 32, C.dusk);
    fb.vline(wx + 23, 15, 46, C.deep);
    fb.hline(wx + 1, wx + 44, 31, C.deep);
    fb.rect(wx + 2, 16, 43, 30, dusk > .5 ? C.plum : C.deep);
    fb.hline(wx + 2, wx + 44, 40, C.warm);
  }
  fb.rect(206, 10, 100, 44, C.wood);
  fb.rect(208, 12, 96, 40, C.pine);
  fb.rect(208, 52, 96, 2, C.woodDark);
  for (let i = 0; i < 6; i++) fb.hline(214, 214 + 20 + (i % 3) * 18, 18 + i * 5, C.silver);
  fb.rect(0, 112, fb.w, fb.h - 112, C.wood);
  for (let j = 112; j < fb.h; j += 5) fb.hline(0, fb.w - 1, j, C.woodDark);
  // 近景课桌（只在画面下缘露一条，别抢主体）
  fb.rect(40, 128, 70, 4, C.woodDark);
  fb.rect(40, 132, 70, 3, C.wood);
  fb.rect(44, 135, 3, 20, C.woodDark); fb.rect(103, 135, 3, 20, C.woodDark);
  fb.rect(150, 120, 60, 4, C.woodDark);
  fb.rect(150, 124, 60, 3, C.wood);
  fb.rect(154, 127, 3, 18, C.woodDark); fb.rect(203, 127, 3, 18, C.woodDark);
}

// —— 街：路面 + 远处楼群 + 电线杆 ——
export function street(fb, t = 0, o = {}) {
  const { night = 0, horizon = 100 } = o;
  fb.vgrad3(0, 0, fb.w, horizon, night ? C.ink : C.dusk, night ? C.night : C.plum, night ? C.deep : C.warm, .45, .9);
  for (let i = 0; i < 9; i++) {
    const bw = 22 + h1(i) * 26, bx = -10 + i * 38, bh = 30 + h1(i + 3) * 46;
    fb.rect(bx, horizon - bh, bw, bh, night ? C.night : C.deep);
    for (let wy = horizon - bh + 4; wy < horizon - 4; wy += 7)
      for (let wx = bx + 3; wx < bx + bw - 3; wx += 6)
        if (h1(wx * 1.7 + wy) < .5) fb.rect(wx, wy, 3, 3, night ? C.warm : C.haze);
  }
  fb.rect(0, horizon, fb.w, fb.h - horizon, night ? C.deep : C.bark);
  fb.rect(0, horizon, fb.w, 2, night ? C.plum : C.woodDark);
  for (let x = 0; x < fb.w; x += 40) fb.rect(x, horizon + 30, 20, 1, night ? C.plum : C.silver);
  for (const px of [60, 220]) {
    fb.vline(px, 44, horizon, C.ink);
    fb.rect(px - 5, 54, 11, 1, C.ink);
    fb.rect(px - 4, 62, 9, 1, C.ink);
  }
  fb.px(0, 54, C.ink);
}
