// render.js — 索引帧缓冲 + 整数像素绘制原语
// 所有坐标进函数即取整；放大用整数倍 nearest，保证每个像素是干净方格。
//
// 为什么用帧缓冲而不是直接 canvas 画：
//   1) 51200 个 Uint8 的整屏重绘只要零点几毫秒，6480 帧不心疼；
//   2) 每个像素的颜色是 0..31 的索引，抖动/溶解/剪影都是查表，不需要混色；
//   3) 缩放交给 present() 的最近邻，绝不会出现半透明边。

import { DEFAULT_PAL } from './palette.js';

export const W = 320, H = 180;
const R = Math.round;

const warned = new Set();
export function warnOnce(key, msg) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn('[code-mv] ' + msg);
}
// Bayer 4×4：抖动阈值表（0..1）
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => BAYER[((y & 3) << 2) | (x & 3)] / 16;

export class FB {
  /**
   * @param {number} w  逻辑宽（像素风一般 320）
   * @param {number} h  逻辑高（一般 180）
   * @param {object} pal makePalette() 的返回值
   */
  constructor(w = W, h = H, pal = DEFAULT_PAL) {
    this.w = w; this.h = h;
    this.d = new Uint8Array(w * h);
    this.pal = pal;
    this.ovr = -1;              // >=0 时整屏强制成这个索引 —— 剪影/单色期靠它
  }

  // —— 整屏 ——
  clear(c = 0) { this.d.fill(c); return this; }

  // —— 单像素 ——
  px(x, y, c) {
    x = R(x); y = R(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = this.ovr >= 0 ? this.ovr : c;
  }
  get(x, y) {
    x = R(x); y = R(y);
    return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? -1 : this.d[y * this.w + x];
  }

  // —— 矩形 / 线 ——
  rect(x, y, w, h, c) {
    x = R(x); y = R(y); w = R(w); h = R(h);
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
    const cc = this.ovr >= 0 ? this.ovr : c;
    for (let j = y0; j < y1; j++) {
      const o = j * this.w;
      for (let i = x0; i < x1; i++) this.d[o + i] = cc;
    }
    return this;
  }
  frame(x, y, w, h, c) {
    this.rect(x, y, w, 1, c); this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c); this.rect(x + w - 1, y, 1, h, c);
    return this;
  }
  hline(x0, x1, y, c) {
    const a = R(Math.min(x0, x1)), b = R(Math.max(x0, x1));
    this.rect(a, y, b - a + 1, 1, c); return this;
  }
  vline(x, y0, y1, c) {
    const a = R(Math.min(y0, y1)), b = R(Math.max(y0, y1));
    this.rect(x, a, 1, b - a + 1, c); return this;
  }
  // 带粗细的线段（Bresenham + 方形笔尖），用于四肢
  line(x0, y0, x1, y1, c, th = 1) {
    x0 = R(x0); y0 = R(y0); x1 = R(x1); y1 = R(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0, guard = 0;
    for (;;) {
      if (th <= 1) this.px(x, y, c);
      else this.rect(x - (th >> 1), y - (th >> 1), th, th, c);
      if ((x === x1 && y === y1) || guard++ > 4000) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return this;
  }

  // —— 面 ——
  // 椭圆填充（整数栅格）：头、太阳、树冠
  ellipse(cx, cy, rx, ry, c, fill = true) {
    cx = R(cx); cy = R(cy); rx = Math.max(1, R(rx)); ry = Math.max(1, R(ry));
    for (let j = -ry; j <= ry; j++) {
      const t = 1 - (j * j) / (ry * ry);
      if (t < 0) continue;
      const w = Math.floor(rx * Math.sqrt(t));
      if (fill) this.hline(cx - w, cx + w, cy + j, c);
      else { this.px(cx - w, cy + j, c); this.px(cx + w, cy + j, c); }
    }
    return this;
  }
  // 扫描线多边形填充
  poly(pts, c) {
    const n = pts.length;
    if (n < 3) return this;
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    y0 = Math.max(0, R(y0)); y1 = Math.min(this.h - 1, R(y1));
    const xs = [];
    for (let y = y0; y <= y1; y++) {
      xs.length = 0;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const ay = R(a[1]), by = R(b[1]);
        if ((ay <= y && by > y) || (by <= y && ay > y))
          xs.push(R(a[0]) + (y - ay) / (by - ay) * (R(b[0]) - R(a[0])));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) this.hline(xs[i], xs[i + 1], y, c);
    }
    return this;
  }
  outline(pts, c) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      this.line(a[0], a[1], b[0], b[1], c);
    }
    return this;
  }
  // 1px 粗的矩形描边（多用于木箱、窗框）
  stroke(x, y, w, h, c) { return this.frame(x, y, w, h, c); }

  // —— 过渡 ——
  // 两色抖动：ratio=0 全 a，1 全 b
  mix(x, y, w, h, a, b, ratio) {
    for (let j = 0; j < R(h); j++) for (let i = 0; i < R(w); i++)
      this.px(R(x) + i, R(y) + j, bayer(R(x) + i, R(y) + j) < ratio ? b : a);
    return this;
  }
  // 竖向抖动渐变（天空、水面）
  vgrad(x, y, w, h, cTop, cBot, ease = 0) {
    for (let j = 0; j < R(h); j++) {
      const r = ease ? Math.pow(j / Math.max(1, R(h)), ease) : j / Math.max(1, R(h));
      for (let i = 0; i < R(w); i++) {
        const X = R(x) + i, Y = R(y) + j;
        this.px(X, Y, bayer(X, Y) < r ? cBot : cTop);
      }
    }
    return this;
  }
  // 3 段竖向渐变（暮色天空：紫 -> 橙 -> 深）
  vgrad3(x, y, w, h, a, b, c, s1 = 0.5, s2 = 0.85) {
    const hh = R(h);
    for (let j = 0; j < hh; j++) {
      const r = j / Math.max(1, hh);
      for (let i = 0; i < R(w); i++) {
        const X = R(x) + i, Y = R(y) + j, bt = bayer(X, Y);
        const col = r < s1
          ? (bt < r / s1 ? b : a)
          : (bt < (r - s1) / Math.max(1e-6, s2 - s1) ? c : b);
        this.px(X, Y, col);
      }
    }
    return this;
  }
  // 有序溶解压暗：ratio=0 不变，1 全暗一档。
  // 灯亮/灯灭必须用它 —— 直接切换整屏颜色会硬跳一帧，观众看得出"闪"。
  dissolveDark(ratio) {
    if (ratio <= 0) return this;
    const DK = this.pal.DARKEN;
    if (ratio >= 1) {
      for (let i = 0; i < this.d.length; i++) this.d[i] = DK[this.d[i]];
      return this;
    }
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (bayer(x, y) < ratio) {
        const i = y * this.w + x;
        this.d[i] = DK[this.d[i]];
      }
    }
    return this;
  }

  // —— 输出 ——
  /**
   * 按整数倍最近邻放大到输出 canvas。
   * 断言：fb.w * scale 必须等于 canvas 宽，否则画面会被拉伸或在边上留白。
   */
  present(ctx, scale = 6) {
    const cvW = ctx.canvas.width, cvH = ctx.canvas.height;
    if (cvW !== this.w * scale || cvH !== this.h * scale) {
      warnOnce('present:' + this.w + 'x' + this.h + ':' + cvW + 'x' + cvH,
        `present() 尺寸不匹配：帧缓冲 ${this.w}×${this.h} × scale ${scale} = ${this.w * scale}×${this.h * scale}，` +
        `但画布是 ${cvW}×${cvH}。放大倍数请用整数，或把 canvas 宽高改成 ${this.w * scale}×${this.h * scale}。`);
    }
    if (!this._img || this._img.width !== this.w || this._lut !== this.pal.LUT32) {
      this._cv = document.createElement('canvas');
      this._cv.width = this.w; this._cv.height = this.h;
      this._ctx = this._cv.getContext('2d');
      this._img = this._ctx.createImageData(this.w, this.h);
      this._buf = new Uint32Array(this._img.data.buffer);
      this._lut = this.pal.LUT32;
    }
    const n = this.w * this.h, lut = this._lut, buf = this._buf, d = this.d;
    for (let i = 0; i < n; i++) buf[i] = lut[d[i]];
    this._ctx.putImageData(this._img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this._cv, 0, 0, this.w * scale, this.h * scale);
  }

  // 把另一张缓冲按整数偏移贴进来（分层合成 / 缩略图 / 叠化）
  blit(src, dx, dy) {
    for (let j = 0; j < src.h; j++) {
      const ty = R(dy) + j;
      if (ty < 0 || ty >= this.h) continue;
      for (let i = 0; i < src.w; i++) {
        const tx = R(dx) + i;
        if (tx < 0 || tx >= this.w) continue;
        this.d[ty * this.w + tx] = src.d[j * src.w + i];
      }
    }
    return this;
  }
}

// —— 缓动 ——
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const ss = t => { t = clamp(t); return t * t * (3 - 2 * t); };
export const eio = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const eo = t => 1 - Math.pow(1 - clamp(t), 3);
export const ei = t => Math.pow(clamp(t), 3);

// —— 相机 ——
// 相机 = 一张会平移的"画布代理"。所有绘制方法把坐标加上整数偏移再转发给帧缓冲，
// 这样画板可以照常写绝对坐标，镜头推拉只改 ox/oy。
//
// 整数偏移是关键：像素风里 0.4px 的平移等于"这一帧不动，下一帧跳 1px"，
// 慢速平移（<12px/s）会变成肉眼可见的顿挫。宁可不动，也不要慢摇。
export class Pan {
  constructor(fb, ox = 0, oy = 0) { this.fb = fb; this.ox = Math.round(ox); this.oy = Math.round(oy); }
  get w() { return this.fb.w; }
  get h() { return this.fb.h; }
  get x() { return Math.round(this.ox); }
  get y() { return Math.round(this.oy); }
  moveTo(ox, oy) { this.ox = ox; this.oy = oy; return this; }
  // 世界坐标 -> 屏幕坐标
  p(x, y) { return [x - this.x, y - this.y]; }
  get ovr() { return this.fb.ovr; }
  set ovr(v) { this.fb.ovr = v; }

  px(x, y, c) { this.fb.px(x + this.ox, y + this.oy, c); return this; }
  get(x, y) { return this.fb.get(x + this.ox, y + this.oy); }
  rect(x, y, w, h, c) { this.fb.rect(x + this.ox, y + this.oy, w, h, c); return this; }
  frame(x, y, w, h, c) { this.fb.frame(x + this.ox, y + this.oy, w, h, c); return this; }
  stroke(x, y, w, h, c) { return this.frame(x, y, w, h, c); }
  hline(x0, x1, y, c) { this.fb.hline(x0 + this.ox, x1 + this.ox, y + this.oy, c); return this; }
  vline(x, y0, y1, c) { this.fb.vline(x + this.ox, y0 + this.oy, y1 + this.oy, c); return this; }
  line(x0, y0, x1, y1, c, th = 1) { this.fb.line(x0 + this.ox, y0 + this.oy, x1 + this.ox, y1 + this.oy, c, th); return this; }
  ellipse(cx, cy, rx, ry, c, fill = true) { this.fb.ellipse(cx + this.ox, cy + this.oy, rx, ry, c, fill); return this; }
  poly(pts, c) { this.fb.poly(pts.map(([x, y]) => [x + this.ox, y + this.oy]), c); return this; }
  outline(pts, c) { this.fb.outline(pts.map(([x, y]) => [x + this.ox, y + this.oy]), c); return this; }
  mix(x, y, w, h, a, b, r) { this.fb.mix(x + this.ox, y + this.oy, w, h, a, b, r); return this; }
  vgrad(x, y, w, h, a, b, e) { this.fb.vgrad(x + this.ox, y + this.oy, w, h, a, b, e); return this; }
  vgrad3(x, y, w, h, a, b, c, s1, s2) { this.fb.vgrad3(x + this.ox, y + this.oy, w, h, a, b, c, s1, s2); return this; }
  // 整屏操作不吃偏移，直接转发
  clear(c) { this.fb.clear(c); return this; }
  dissolveDark(r) { this.fb.dissolveDark(r); return this; }
  present(ctx, scale) { this.fb.present(ctx, scale); }
}
