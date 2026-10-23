// text.js — 1bit 像素中文
// 把 Canvas 文字栅格化后做阈值二值化，再逐像素写进索引帧缓冲。
// 这样中文在 320×180 里也是真正的"方格像素"，不是缩小的抗锯齿字。
//
// 带缓存：同一句只栅格化一次（6480 帧只换 47 次字幕，缓存命中率 99%）。

import { warnOnce } from './render.js';

const DEFAULTS = {
  // 字体栈按平台排：Windows 先 YaHei，mac 先 PingFang，Linux 先 Noto
  font: '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
  threshold: 120,   // alpha 超过它算"有墨"。调低字变粗，调高变细
  tracking: 0,      // 字间距（像素）。中文一般 0，标题可以 1
  minPx: 8,         // 小于它直接抛错：这个尺寸下中文笔画会糊成一块
  warnPx: 10,       // 小于它警告一次：能读，但不保证每个字都认得出
};

let OPT = { ...DEFAULTS };
const cache = new Map();
let _cv = null, _ctx = null;

/** 改全局文字参数。可多次调用（会清缓存）。 */
export function initText(opts = {}) {
  OPT = { ...OPT, ...opts };
  cache.clear();
  return OPT;
}
export const textOpts = () => ({ ...OPT });

const CJK = /[\u3400-\u9fff\u3000-\u303f\uff01-\uff60]/;

// 中文和 ASCII 的可用下限完全不同：8px 的英文在像素风里清清楚楚，
// 8px 的中文是一团墨。所以只对含中文的字符串做严格限制。
function checkSize(size, s = '') {
  const cjk = CJK.test(s);
  if (cjk && size < OPT.minPx) {
    throw new Error(
      `[code-mv] 字号 ${size}px 太小：中文在 ${OPT.minPx}px 以下会糊成一团墨点。` +
      `请用 >= 10px（推荐 11–12px），或改用更短的文案。当前文本："${s}"`);
  }
  if (cjk && size < OPT.warnPx) {
    warnOnce('size:' + size,
      `字号 ${size}px 偏小，中文勉强可读。标题建议 11–14px，字幕 11–12px。当前文本："${s}"`);
  } else if (!cjk && size < 7) {
    warnOnce('size-latin:' + size,
      `字号 ${size}px 太小，拉丁字母在 320×180 里也不到 7 个像素高，基本认不出。`);
  }
}

// 单字栅格化。返回 {w,h,rows}，w 含左右各 1px 留白
function glyph(ch, size, weight) {
  const key = size + '|' + weight + '|' + ch;
  let m = cache.get(key);
  if (m) return m;

  if (!_cv) {
    _cv = document.createElement('canvas');
    _ctx = _cv.getContext('2d', { willReadFrequently: true });
  }
  const font = `${weight} ${size}px ${OPT.font}`;
  _ctx.font = font;
  const adv = Math.ceil(_ctx.measureText(ch).width) || Math.ceil(size * 0.5);
  const w = adv + 2;
  const h = Math.ceil(size * 1.45);

  _cv.width = Math.max(2, w);
  _cv.height = h;
  _ctx.font = font;
  _ctx.textBaseline = 'top';
  _ctx.fillStyle = '#fff';
  _ctx.clearRect(0, 0, _cv.width, h);
  _ctx.fillText(ch, 1, 1);

  const d = _ctx.getImageData(0, 0, _cv.width, h).data;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = new Uint8Array(_cv.width);
    for (let x = 0; x < _cv.width; x++) row[x] = d[(y * _cv.width + x) * 4 + 3] > OPT.threshold ? 1 : 0;
    rows.push(row);
  }
  m = { w: _cv.width, h, rows, adv };
  cache.set(key, m);
  return m;
}

/** 一行字的像素宽度（含字间距） */
export function cnTextW(s, size = 12, weight = 500) {
  if (!s) return 0;
  checkSize(size, s);
  let w = 0;
  for (const ch of s) w += glyph(ch, size, weight).adv + OPT.tracking;
  return Math.max(0, w - OPT.tracking);
}
export const cnTextH = (size = 12) => Math.ceil(size * 1.2);

/**
 * 画到帧缓冲。x,y 是左上角（整数）。返回实际宽度。
 *
 * shadow 传颜色索引时，每个墨点四周各补 1px —— 这是 1bit 文字唯一的可读性保障：
 * 只要字有描边，压在任何背景上（亮地面、星空、窗光）都认得出来。
 * 只做"右下 1px 投影"是不够的，深色背景上投影等于没画。
 */
export function cnText(fb, s, x, y, col, size = 12, weight = 500, shadow = null) {
  if (!s) return 0;
  checkSize(size, s);
  x = Math.round(x); y = Math.round(y);
  let pen = x;
  for (const ch of s) {
    const m = glyph(ch, size, weight);
    const ink = (dx, dy, c) => {
      for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++)
        if (m.rows[j][i]) fb.px(pen + i + dx, y + j + dy, c);
    };
    if (shadow !== null) {
      ink(-1, 0, shadow); ink(1, 0, shadow); ink(0, -1, shadow); ink(0, 1, shadow);
      ink(1, 1, shadow);
    }
    ink(0, 0, col);
    pen += m.adv + OPT.tracking;
  }
  return Math.max(0, pen - x - OPT.tracking);
}

/** 以 cx 为中点居中 */
export function cnTextCenter(fb, s, cx, y, col, size = 12, weight = 500, shadow = null) {
  const w = cnTextW(s, size, weight);
  return cnText(fb, s, Math.round(cx - w / 2), y, col, size, weight, shadow);
}

/** 以 right 为右边界右对齐 */
export function cnTextRight(fb, s, right, y, col, size = 12, weight = 500, shadow = null) {
  const w = cnTextW(s, size, weight);
  return cnText(fb, s, Math.round(right - w), y, col, size, weight, shadow);
}

/** 逐字换行（中文按字断行）。maxW 是像素宽 */
export function wrapCJK(s, maxW, size = 12, weight = 500) {
  const out = [];
  let line = '';
  for (const ch of s) {
    if (ch === '\n') { out.push(line); line = ''; continue; }
    const t = line + ch;
    if (cnTextW(t, size, weight) > maxW && line) { out.push(line); line = ch; }
    else line = t;
  }
  if (line) out.push(line);
  return out;
}
