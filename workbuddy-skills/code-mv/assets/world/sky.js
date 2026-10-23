// sky.js — 天空与大气：天色渐变、星、山、落叶、雨、暗角
// 这些都是"整屏级"元素，所以按 fb.w / fb.h 取尺寸，换分辨率不用改。

import { C } from '../core/palette.js';
import { bayer, clamp } from '../core/render.js';

// 确定性伪随机：同一帧重渲必须给出同一张图，绝不能用 Math.random
export const h1 = n => { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
export const R = (a, b, s) => a + (b - a) * h1(s);

// —— 黄昏：四段抖动渐变 + 云带 + 落日 ——
export function sky(fb, o = {}) {
  const {
    top = C.deep, mid = C.plum, low = C.warm, hor = C.fire,
    y0 = 0, y1 = 118, t = 0, sun = null, clouds = true,
    x0 = 0, x1 = fb.w,      // 画板要平移就把它铺得比画面宽，否则摇出去会露边
  } = o;
  const H = y1 - y0;
  for (let j = 0; j < H; j++) {
    const r = j / H, Y = y0 + j;
    for (let x = x0; x < x1; x++) {
      const bt = bayer(x, Y);
      let c;
      if (r < .45) c = bt < r / .45 * .9 ? mid : top;
      else if (r < .78) c = bt < (r - .45) / .33 ? low : mid;
      else c = bt < (r - .78) / .22 ? hor : low;
      fb.px(x, Y, c);
    }
  }
  if (clouds) {
    for (let k = 0; k < 5; k++) {
      const cy = y0 + 18 + k * 11 + h1(k) * 5;
      const cx = ((k * 71 + t * 1.2) % (fb.w + 60)) - 40;
      const w = 34 + h1(k + 9) * 50;
      fb.rect(cx, cy, w, 2, k % 2 ? C.plum : C.dusk);
      fb.rect(cx + 6, cy - 1, w * .55, 1, k % 2 ? C.dusk : C.plum);
      fb.rect(cx + 12, cy + 2, w * .4, 1, C.deep);
    }
  }
  if (sun) {
    const { x, y, r } = sun;
    fb.ellipse(x, y, r + 4, r + 4, C.fire);
    fb.ellipse(x, y, r + 2, r + 2, C.warm);
    fb.ellipse(x, y, r, r, C.gold);
    fb.ellipse(x - r * .3, y - r * .3, r * .45, r * .45, C.paper);
  }
}

// —— 夜：从深蓝到近黑，星按月相亮度分布 ——
export function nightSky(fb, o = {}) {
  const { y1 = fb.h, t = 0, stars = 1, moon = null, drift = 0 } = o;
  fb.vgrad3(0, 0, fb.w, y1, C.plum, C.deep, C.ink, .5, .92);

  const n = Math.round(90 * stars);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(h1(i * 3.1) * fb.w);
    const y = Math.floor((h1(i * 7.7) * y1 + drift * (.4 + h1(i * 2.2) * .5)) % y1);
    const tw = h1(i * 5.3 + Math.floor(t * 1.2) * .37);
    if (tw < .5) continue;
    const big = tw > .9;
    fb.px(x, y, big ? C.paper : tw > .72 ? C.silver : C.blueLt);
    if (big) { fb.px(x - 1, y, C.haze); fb.px(x + 1, y, C.haze); fb.px(x, y - 1, C.haze); fb.px(x, y + 1, C.haze); }
  }
  if (moon) {
    const { x, y, r = 11, crescent = true } = moon;
    if (crescent) {
      fb.ellipse(x, y, r, r, C.paper);
      fb.ellipse(x + r * .45, y - r * .27, r * .9, r * .9, C.plum);
      fb.ellipse(x, y, r * .92, r * .92, C.paper);
    } else {
      fb.ellipse(x, y, r, r, C.paper);
    }
    for (let rr = r + 2; rr < r * 2.4; rr++) for (let a = 0; a < 20; a++) {
      const ang = a / 20 * 6.283;
      const X = x + Math.cos(ang) * rr, Y = y + Math.sin(ang) * rr;
      if (bayer(Math.round(X), Math.round(Y)) < (1 - (rr - r) / (r * 1.4)) * .18) fb.px(X, Y, C.plum);
    }
  }
}

// —— 远山 / 楼群天际线剪影 ——
export function hills(fb, y = 120, o = {}) {
  const { col = C.night, near = C.ink, seed = 1, hMax = 26 } = o;
  for (let x = 0; x < fb.w; x++) {
    const hh = hMax * (.35 + .65 * (.5 + .5 * Math.sin(x * .017 + seed * 3.1 + Math.sin(x * .006) * 2)));
    fb.rect(x, y - hh, 1, hh, col);
  }
  fb.rect(0, y, fb.w, fb.h - y, near);
}

// —— 落叶：绕竖直轴摆动的椭圆叶片 ——
export function leaves(fb, lt, o = {}) {
  const { n = 26, col = [C.straw, C.young, C.grass], top = -6, seed = 0, speed = 14 } = o;
  for (let i = 0; i < n; i++) {
    const ph = (lt * (speed / 100) + h1(i * 3.3 + seed)) % 1;
    const y = top + ph * (fb.h + 20);
    const sway = Math.sin(ph * 8 + i) * 8;
    const x = h1(i * 5.1 + seed) * fb.w + sway;
    const sp = .6 + h1(i * 2.7) * .7;
    fb.ellipse(x, y, 1.6 * sp + .6, 1 * sp + .4, col[i % col.length]);
  }
}

// —— 雨：斜线，越近越长越亮 ——
export function rain(fb, lt, o = {}) {
  const { n = 90, seed = 0, slant = -1.6, col = C.silver } = o;
  for (let i = 0; i < n; i++) {
    const sp = 90 + h1(i * 2.1 + seed) * 120;
    const y = ((lt * sp + h1(i * 4.7 + seed) * fb.h * 2) % (fb.h + 16)) - 8;
    const x = (h1(i * 6.3 + seed) * (fb.w + 40) - 20 + y * .12) % (fb.w + 40);
    const len = 3 + h1(i * 8.1) * 5;
    fb.line(x, y, x + slant * len * .35, y + len, i % 3 ? col : C.haze, 1);
  }
}

// —— 暗角：四角压暗（抖动，不会出现灰雾）——
export function vignette(fb, o = {}) {
  const { strength = .5, col = C.ink, power = 2.4 } = o;
  const cx = fb.w / 2, cy = fb.h / 2;
  for (let y = 0; y < fb.h; y++) for (let x = 0; x < fb.w; x++) {
    const d = Math.hypot((x - cx) / cx, (y - cy) / cy) / 1.414;
    const k = clamp(Math.pow(clamp((d - .45) / .55), power)) * strength;
    if (k > 0 && bayer(x, y) < k) fb.px(x, y, col);
  }
}

// —— 光柱（逆光时从窗口/门缝斜进来）——
export function lightShaft(fb, o = {}) {
  const { x0 = 0, y0 = 0, x1 = 100, y1 = 180, w = 40, col = C.gold, strength = .5 } = o;
  for (let j = Math.min(y0, y1); j < Math.max(y0, y1); j++) {
    const u = (j - y0) / Math.max(1, y1 - y0);
    const cx = x0 + (x1 - x0) * u, half = w * (.5 + u * .8);
    for (let x = Math.floor(cx - half); x < cx + half; x++) {
      const e = 1 - Math.abs(x - cx) / half;
      if (e > 0 && bayer(x, j) < e * e * strength) fb.px(x, j, col);
    }
  }
}
