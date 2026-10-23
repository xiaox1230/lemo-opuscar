// props.js — 道具注册表
// 角色身上挂的所有东西都走这里，不在 draw() 里写 switch。
// 加一个新道具 = defineProp('名字', 画法, {anchor})，不用改角色代码。
//
// 尺寸一律按身高 h 的比例算，这样同一个人物放大到 120px 也不会变成"拿着巨伞"。

import { C } from '../core/palette.js';

/** kind -> { fn, anchor, layer } */
export const PROPS = {};

/**
 * @param {string} kind
 * @param {(fb, o:{hx:number,hy:number,h:number,dir:number,t:number}) => void} fn
 * @param {{anchor?:'hand'|'handB'|'shoulder', layer?:'under'|'over'}} opt
 *   layer='over' 的道具画在头之后（伞、气球这类会挡住脸的东西必须用 over）
 */
export function defineProp(kind, fn, opt = {}) {
  PROPS[kind] = { fn, anchor: opt.anchor || 'hand', layer: opt.layer || 'over' };
  return PROPS[kind];
}

export function drawProp(fb, kind, o) {
  const p = PROPS[kind];
  if (!p) return false;
  p.fn(fb, o);
  return true;
}

// ——————————————————— 内置道具 ———————————————————
// 提示：像素风里道具不要超过 2 种颜色 + 1 条描边，否则在 320×180 里会糊。

// 对折信纸
defineProp('letter', (fb, { hx, hy, h, dir: s }) => {
  const w = Math.max(3, Math.round(h * 0.06)), hh = Math.max(2, Math.round(h * 0.045));
  const x0 = hx - (s > 0 ? 0 : w);
  fb.rect(x0, hy - hh / 2, w, hh, C.paper);
  fb.frame(x0, hy - hh / 2, w, hh, C.silver);
  fb.px(hx + (s > 0 ? w - 1 : 0), hy - hh / 2, C.silver);
});

// 书包：肩带 + 包体（挂在肩上，不是手上）。画在身体之前，肩带才在衣服下面
defineProp('bag', (fb, { hx, hy, h, dir: s }) => {
  const y0 = hy, y1 = hy + h * 0.16;
  fb.line(hx, y0, hx - s * h * 0.07, y1, C.wood, 2);
  fb.rect(hx - s * h * 0.06 - 2, y1, 5, 3, C.woodDark);
}, { anchor: 'shoulder', layer: 'under' });

// 伞：杆 + 面。
// 伞必须 layer:'over'（画在头之后），否则伞杆会被头盖住，只剩一个浮在空中的红椭圆。
// 伞面往持伞手的**外侧**偏，才不会压在脸上。
defineProp('umbrella', (fb, { hx, hy, h, dir: s }) => {
  const top = hy - h * 0.55;
  const cx = hx + s * (h * 0.10), r = h * 0.30;
  fb.line(hx, hy, cx, top, C.ink, 1);
  fb.ellipse(cx, top, r, r * 0.42, C.wine);
  fb.ellipse(cx, top + 1, r, r * 0.35, C.rust);
  for (let i = -2; i <= 2; i++) fb.px(cx + i * (r / 2), top, C.maroon);
  fb.px(cx, top + r * 0.45, C.ink);
}, { layer: 'over' });

// 摊开的书 / 练习本
defineProp('book', (fb, { hx, hy, h }) => {
  const w = Math.max(4, Math.round(h * 0.085)), hh = Math.max(3, Math.round(h * 0.06));
  fb.rect(hx, hy - hh / 2, w, hh, C.white);
  fb.frame(hx, hy - hh / 2, w, hh, C.blueLt);
  fb.vline(hx + (w >> 1), hy - hh / 2, hy + hh / 2, C.silver);
});

// 手机（屏幕亮着 —— 夜戏里这是唯一的高光）
defineProp('phone', (fb, { hx, hy }) => {
  fb.rect(hx, hy - 3, 2, 4, C.ink);
  fb.px(hx, hy - 2, C.blueLt);
});

// 奶茶 / 咖啡杯
defineProp('cup', (fb, { hx, hy }) => {
  fb.rect(hx, hy - 3, 3, 4, C.paper);
  fb.rect(hx, hy - 3, 3, 1, C.blueLt);
});

// 铅笔
defineProp('pencil', (fb, { hx, hy, dir: s }) => {
  fb.line(hx, hy, hx + s * 4, hy - 3, C.gold, 1);
});

// 花束
defineProp('flower', (fb, { hx, hy, h, dir: s }) => {
  const len = h * 0.09;
  for (let i = -1; i <= 1; i++) {
    fb.line(hx, hy, hx + s * (len + i), hy - h * 0.10 - Math.abs(i) * 2, C.leaf, 1);
    fb.ellipse(hx + s * (len + i), hy - h * 0.11 - Math.abs(i) * 2, 1.6, 1.6, i === 0 ? C.pink : C.blush);
  }
});

// 耳机（挂在脖子上）
defineProp('headphone', (fb, { hx, hy, h }) => {
  fb.ellipse(hx, hy + h * 0.10, h * 0.055, h * 0.045, C.ink, false);
  fb.rect(hx - h * 0.06, hy + h * 0.09, 2, 2, C.ink);
  fb.rect(hx + h * 0.045, hy + h * 0.09, 2, 2, C.ink);
}, { anchor: 'shoulder' });
