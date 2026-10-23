// plates.js — 整幅画板（一个镜头一张）
// 和 scenes.js 的区别：scenes 是可摆放的零件，plates 是"已经构好图的一整场"，
// 通常带一点相机余量（画板比 320 宽），好让镜头平移时不露边。
//
// 每个 plate 的签名统一是 (fb, t, lt, o)：
//   t  = 全片时间（秒），用于需要跨镜头连续的东西（钟、闪）
//   lt = 本镜头内时间，用于"这一镜从 0 演到 1"的动效
//   o  = 覆盖参数

import { C } from '../core/palette.js';
import { bayer, clamp, seg } from '../core/render.js';
import { h1 } from './sky.js';
import { draw as drawChar } from '../lib/wardrobe.js';

// —— 巷子：一点透视，两侧墙向消失点收 ——
// 骑车的人从右往左穿过 —— 这类"有人经过"的空镜最能撑起前奏。
export function alley(fb, t, lt, o = {}) {
  const { rider = true, look = 'boy' } = o;
  const VP = [172, 104];
  for (let y = 0; y < 64; y++) {
    const r = y / 64;
    for (let x = 60; x < 262; x++)
      fb.px(x, y, bayer(x, y) < r * .9 ? C.warm : r * .5 > .4 ? C.plum : C.dusk);
  }
  fb.rect(150, 66, 46, 44, C.deep);
  fb.rect(156, 72, 8, 8, C.warm); fb.rect(172, 72, 8, 8, C.gold); fb.rect(186, 72, 6, 8, C.warm);
  fb.rect(150, 66, 46, 3, C.night);

  fb.poly([[150, 108], [196, 108], [320, 180], [0, 180]], C.woodDark);
  fb.poly([[150, 108], [196, 108], [280, 180], [40, 180]], C.bark);
  for (let i = 1; i <= 7; i++) {
    const u = i / 7, y = 108 + Math.pow(u, 1.7) * 72;
    const halfW = 23 + u * 200;
    fb.hline(VP[0] - halfW, VP[0] + halfW, y, C.woodDark);
  }
  fb.poly([[0, 0], [150, 66], [150, 108], [0, 180]], C.maroon);
  fb.poly([[320, 0], [196, 66], [196, 108], [320, 180]], C.wine);
  fb.line(0, 180, 150, 108, C.ink, 2);
  fb.line(320, 180, 196, 108, C.ink, 2);

  // 左墙：门洞
  for (let i = 0; i < 4; i++) {
    const u = i / 4, u2 = (i + .62) / 4;
    const xA = 150 * (1 - u), xB = 150 * (1 - u2);
    const q = [[xA, 66 + 42 * u], [xB, 66 + 42 * u2], [xB, 108 + 72 * u2], [xA, 108 + 72 * u]];
    fb.poly(q, i % 2 ? C.wine : C.deep);
    fb.outline(q, C.ink);
  }
  // 右墙：窗 + 空调外机
  for (let i = 0; i < 4; i++) {
    const u = i / 4, u2 = (i + .55) / 4;
    const xA = 196 + 124 * u, xB = 196 + 124 * u2;
    const q = [[xA, 60 + 48 * u], [xB, 60 + 48 * u2], [xB, 96 + 84 * u2], [xA, 96 + 84 * u]];
    fb.poly(q, C.woodDark);
    fb.outline(q, C.night);
    fb.poly([[xA + 2, 64 + 48 * u], [xB - 1, 64 + 48 * u2], [xB - 1, 90 + 84 * u2], [xA + 2, 90 + 84 * u]],
      h1(i * 3.3) > .45 ? C.warm : C.deep);
  }
  for (let i = 0; i < 2; i++) {
    const x = 268 + i * 18, y = 46 + i * 16;
    fb.rect(x, y, 22, 12, C.silver); fb.frame(x, y, 22, 12, C.night);
    fb.rect(x + 3, y + 3, 16, 6, C.haze);
  }
  fb.line(0, 34, 150, 60, C.night, 1);
  fb.line(320, 28, 196, 58, C.night, 1);
  fb.line(150, 60, 196, 58, C.night, 1);
  fb.line(10, 40, 74, 74, C.night, 1);
  for (let i = 0; i < 3; i++) {
    const x = 18 + i * 16, y = 46 + i * 9;
    fb.poly([[x, y], [x + 10, y + 5], [x + 9, y + 22], [x - 1, y + 17]], i % 2 ? C.blueLt : C.wine);
  }

  // 骑车的人：轮子与曲柄同相位转
  if (rider) {
    const bx = 316 - lt * 52;
    if (bx > -70) {
      const sp = Math.floor(lt * 14);
      const wheel = (cx, cy, r) => {
        fb.ellipse(cx, cy, r, r, C.night, false);
        fb.ellipse(cx, cy, r - 1, r - 1, C.ink, false);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6 + sp * .08) * 6.283;
          fb.line(cx, cy, cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1), C.silver, 1);
        }
        fb.px(cx, cy, C.silver);
      };
      // 车轮落在 y=142：再往下就会被字幕区吃掉，人看起来像悬在半空
      const wy = 142, rw = 12;
      const wR = [bx - 16, wy], wF = [bx + 18, wy];
      wheel(wR[0], wR[1], rw); wheel(wF[0], wF[1], rw);
      const sad = [bx - 7, wy - 23], bb = [bx + 2, wy - 2], hd = [bx + 12, wy - 25];
      fb.line(...wR, sad[0], sad[1], C.silver, 1);
      fb.line(sad[0], sad[1], bb[0], bb[1], C.silver, 1);
      fb.line(bb[0], bb[1], ...wF, C.silver, 1);
      fb.line(bb[0], bb[1], hd[0], hd[1], C.silver, 1);
      fb.line(hd[0], hd[1], ...wF, C.silver, 1);
      fb.line(sad[0], sad[1], hd[0], hd[1], C.haze, 1);
      fb.rect(sad[0] - 4, sad[1] - 2, 8, 2, C.woodInk);
      fb.rect(hd[0] + 1, hd[1] - 1, 7, 2, C.woodInk);
      const ca = sp * 1.5;
      const ped = [bb[0] + Math.cos(ca) * 5, bb[1] + Math.sin(ca) * 5];
      fb.line(bb[0], bb[1], ped[0], ped[1], C.silver, 1);
      fb.rect(ped[0] - 2, ped[1], 4, 2, C.night);

      drawChar(fb, {
        x: sad[0] - 1, y: wy + 1, h: 50, who: look, dir: -1,
        act: 'sit', phase: 0, expr: 'calm', props: ['bag'],
      });
      fb.line(sad[0] + 2, wy - 26, hd[0] + 4, hd[1], C.blue, 2);
      fb.rect(hd[0] + 3, hd[1] - 1, 2, 2, C.skin);
      fb.px(hd[0] + 8, hd[1] + 3, C.gold);
    }
  }
  fb.rect(0, 0, 8, 180, C.ink);   // 前景掠过的墙
}

// —— 教室：靠窗的座位，暖光从右侧斜进来 ——
export function classroomWide(fb, t, lt, o = {}) {
  const { act = 'write', expr = 'sad', dust = true, look = 'boy', desk = true } = o;
  fb.rect(0, 0, 320, 124, C.haze);
  for (let j = 0; j < 124; j++) {
    const rr = j / 124;
    for (let x = 0; x < 320; x++) {
      const l = clamp(1.15 - x / 300) * (.35 + rr * .5);
      if (l < .3) fb.px(x, j, C.dusk);
      else if (l < .5 && bayer(x, j) > l * 1.9) fb.px(x, j, C.plum);
      else if (l > .78 && bayer(x, j) < .18) fb.px(x, j, C.silver);
    }
  }
  // 挂钟：秒针在动，观众才觉得"时间在走"
  fb.ellipse(44, 30, 9, 9, C.paper);
  fb.ellipse(44, 30, 9, 9, C.ink, false);
  fb.px(44, 30, C.ink);
  fb.line(44, 30, 44, 24, C.ink, 1);
  fb.line(44, 30, 48 + (Math.floor(t) % 3), 32, C.rust, 1);
  // 黑板一角
  fb.rect(0, 46, 96, 50, C.wood);
  fb.rect(0, 49, 92, 44, C.pine);
  for (let k = 0; k < 5; k++) fb.hline(6, 6 + 30 + h1(k * 2.7) * 40, 56 + k * 7, C.grass);
  fb.rect(0, 93, 96, 3, C.woodDark);
  // 右侧窗
  fb.rect(148, 10, 156, 104, C.wood);
  fb.rect(152, 14, 148, 96, C.warm);
  fb.vgrad(152, 14, 148, 96, C.gold, C.straw, .8);
  for (let i = 0; i < 6; i++) {
    const bw = 20 + h1(i * 2.3) * 14, bh = 26 + h1(i * 4.1) * 22;
    fb.rect(150 + i * 26, 78 - bh, bw, bh, C.maroon);
    for (let k = 0; k < 3; k++)
      if (h1(i * 5 + k * 1.7) > .62) fb.rect(152 + i * 26 + k * 6, 82 - bh + k * 8, 3, 4, C.gold);
  }
  fb.rect(152, 78, 148, 32, C.pine);
  for (let i = 0; i < 8; i++) fb.ellipse(156 + i * 20, 78 - (i % 3) * 2, 11, 6, C.pine);
  for (let i = 0; i < 8; i++) fb.ellipse(158 + i * 20, 75 - (i % 3) * 2, 7, 3, C.leaf);
  for (const gx of [152 + 49, 152 + 98]) fb.rect(gx, 14, 3, 96, C.wood);
  fb.rect(152, 60, 148, 3, C.wood);
  fb.frame(148, 10, 156, 104, C.woodDark);
  fb.rect(152, 110, 148, 4, C.woodDark);
  // 地面 + 透视木纹
  fb.rect(0, 124, 320, 56, C.wood);
  for (let j = 124; j < 180; j += 4) fb.hline(0, 319, j, C.woodDark);
  for (let i = -7; i <= 7; i++) fb.line(150 + i * 6, 124, 150 + i * 40, 180, C.woodDark, 1);
  // 光楔：地面上的梯形亮区（边缘用 edge 柔化，硬边会像贴纸）
  for (let j = 124; j < 180; j++) for (let x = 0; x < 320; x++) {
    const u = (j - 124) / 56;
    const x0 = 168 - u * 40, x1 = 300 - u * 10;
    if (x > x0 && x < x1) {
      const edge = Math.min(1, Math.min(x - x0, x1 - x) / 14);
      if (bayer(x, j) < edge * (.55 - u * .3)) fb.px(x, j, C.gold);
    }
  }
  // 人先画，桌子压在前面 —— 顺序决定"在桌前"还是"在桌后"
  const bob = Math.sin(lt * 1.1) * .6;
  drawChar(fb, { x: 124, y: 176 + bob, h: 84, who: look, dir: 1, act, phase: (lt * .25) % 1, expr });
  if (desk) {
    fb.rect(0, 148, 210, 4, C.straw);
    fb.rect(0, 152, 210, 3, C.rust);
    fb.rect(0, 155, 210, 25, C.woodDark);
    for (let j = 158; j < 180; j += 5) fb.hline(0, 209, j, C.woodInk);
    fb.rect(10, 155, 3, 25, C.woodInk);
    fb.rect(196, 155, 3, 25, C.woodInk);
    fb.poly([[64, 146], [148, 142], [150, 152], [66, 156]], C.paper);
    for (let l = 0; l < 4; l++) fb.hline(70, 144 - l * 4, 148 + l * 2, C.blueLt);
    fb.line(140, 146, 158, 139, C.gold, 1);
    fb.poly([[24, 152], [104, 148], [106, 156], [26, 160]], C.paper);
    fb.hline(28, 100, 154, C.blueLt);
    fb.line(96, 152, 112, 146, C.gold, 1);
  }
  if (dust) for (let i = 0; i < 40; i++) {
    const ph = (lt * .12 + h1(i * 3.3)) % 1;
    const x = 190 + h1(i * 5.1) * 120 - ph * 30;
    const y = 24 + ph * 120;
    if (bayer(Math.round(x), Math.round(y)) < .5) fb.px(x, y, i % 4 ? C.paper : C.pure);
  }
}

// —— 人群：背景压成剪影，主角是画面里唯一有颜色的人 ——
// 这个镜头是"孤独"最经济的表达：不是拍他一个人，是拍他在很多人里。
export function crowd(fb, t, lt, o = {}) {
  const {
    heroX = 160, heroAct = 'stand', heroExpr = 'sad',
    her = false, herX = 250, base = 'plaza', back = false,
    heroH = 74, heroY = 184, heroLook = 'boy', seed = 0,
  } = o;
  if (base === 'plaza') {
    fb.rect(0, 0, 320, 180, C.dusk);
    fb.rect(0, 0, 320, 40, C.plum);
    fb.rect(0, 40, 320, 100, C.haze);
    for (let i = 0; i < 6; i++) { const bh = 30 + h1(i) * 30; fb.rect(i * 56, 108 - bh, 48, bh, C.dusk); }
    for (let i = 0; i < 5; i++) { fb.rect(24 + i * 66, 96, 4, 20, C.night); fb.ellipse(26 + i * 66, 94, 3, 3, C.gold); }
    fb.rect(0, 108, 320, 72, C.wood);
    for (let j = 108; j < 180; j += 5) fb.hline(0, 319, j, C.woodDark);
  } else {
    fb.rect(0, 0, 320, 180, C.ink);
    fb.vgrad(0, 0, 320, 120, C.ink, C.deep, 1);
    fb.rect(0, 108, 320, 72, C.night);
    for (let j = 108; j < 180; j += 6) fb.hline(0, 319, j, C.ink);
    for (let i = 0; i < 3; i++) { fb.rect(30 + i * 110, 40, 3, 70, C.ink); fb.ellipse(31 + i * 110, 38, 4, 4, C.warm); }
  }
  // 两层剪影：远层更小更暗，走动速度更慢
  const N = 26;
  for (let i = 0; i < N; i++) {
    const layer = h1(i * 5.5 + seed) > .5 ? 1 : 0;
    const sp = (layer ? 26 : 14) + h1(i * 3.7 + seed) * 18;
    const dirn = i % 2 ? -1 : 1;
    let x = h1(i * 8.1 + seed) * 380 + dirn * lt * sp;
    x = ((x % 380) + 380) % 380 - 30;
    const hh = layer ? 46 + h1(i * 1.9) * 16 : 34 + h1(i * 1.9) * 10;
    const yy = layer ? 182 : 170;
    drawChar(fb, {
      x, y: yy, h: hh, who: i % 4 ? 'boy' : 'girl', dir: dirn,
      act: 'walk', phase: (lt * 1.4 + i * .25) % 1, expr: 'calm',
      outline: false, sil: layer ? C.ink : C.night,
    });
  }
  if (her) {
    const gx = herX + lt * 6;
    if (gx < 340) drawChar(fb, { x: gx, y: 176, h: 54, who: 'girl', dir: 1, back: true, act: 'walk', phase: (lt * 1.2) % 1 });
  }
  drawChar(fb, {
    x: heroX, y: heroY, h: heroH, who: heroLook,
    dir: back ? 1 : -1, back, act: heroAct, phase: lt * .35, expr: heroExpr,
  });
}

// —— 拆信（近景）：信封 + 两只手 + 抽出的信纸 ——
export function letterOpen(fb, t, lt) {
  fb.rect(0, 0, 320, 180, C.woodInk);
  for (let j = 0; j < 180; j += 3) fb.hline(0, 319, j, C.woodDark);
  // 桌面光池：两层抖动叠出平滑过渡，避免同心圆环
  for (let j = 0; j < 180; j++) for (let x = 0; x < 320; x++) {
    const d = Math.hypot((x - 150) / 132, (j - 96) / 84);
    const l = clamp(1.2 - d);
    if (bayer(x, j) < l * (1.15 + .05 * Math.sin(t * 2.3))) fb.px(x, j, C.wood);
    if (bayer(x + 2, j + 2) < l * l * 1.1) fb.px(x, j, C.rust);
    if (l < .1) fb.px(x, j, C.ink);
  }
  // 信纸一直在往外抽，不给"停住"的空档
  const pull = seg(lt, .4, 7.2);
  const yy = 104 - pull * 46;
  fb.poly([[110, yy + 10], [220, yy + 2], [222, yy + 56], [112, yy + 64]], C.woodInk);
  fb.poly([[108, yy + 6], [222, yy - 2], [224, yy + 56], [110, yy + 64]], C.paper);
  fb.poly([[108, yy + 6], [222, yy - 2], [222, yy + 6], [108, yy + 14]], C.pure);
  for (let l = 0; l < 6; l++) fb.hline(116, 214 - l * 6, yy + 18 + l * 6, C.silver);
  for (let l = 0; l < 3; l++) fb.hline(116, 166, yy + 18 + l * 6, C.haze);
  // 信封：先影子，再本体，再折线（折线决定"厚度"）
  const env = [[88, 96], [232, 88], [238, 160], [94, 168]];
  fb.poly([[90, 100], [234, 92], [240, 164], [96, 172]], C.woodDark);
  fb.poly(env, C.paper);
  fb.poly([[88, 96], [232, 88], [160, 138], [88, 96]], C.silver);
  fb.poly([[88, 96], [160, 138], [94, 168]], C.paper);
  fb.poly([[232, 88], [160, 138], [238, 160]], C.paper);
  fb.line(160, 138, 238, 160, C.haze, 1);
  fb.line(160, 138, 94, 168, C.haze, 1);
  fb.line(88, 96, 232, 88, C.haze, 1);
  for (let x = 90; x < 230; x += 2) if (bayer(x, 97) < .5) fb.px(x, 96.5, C.woodInk);

  const hand = (hx, base, sgn) => {
    fb.ellipse(hx, base + 22, 26, 22, C.skinShade);
    fb.ellipse(hx, base + 18, 24, 16, C.skin);
    for (let i = 0; i < 4; i++) {
      const fx = hx - 14 + i * 9;
      const fl = 13 + (i === 1 || i === 2 ? 4 : 0) - (i === 0 || i === 3 ? 3 : 0);
      fb.rect(fx, base - fl, 7, fl + 16, C.skin);
      fb.rect(fx + 5, base - fl + 2, 2, fl + 12, C.skinShade);
      fb.rect(fx + 1, base - fl, 5, 1, C.paper);
      fb.rect(fx, base - fl + 7, 6, 1, C.skinShade);
    }
    fb.rect(hx + sgn * 19, base + 2, 7, 18, C.skin);
    fb.rect(hx + sgn * 25, base + 2, 2, 16, C.skinShade);
  };
  const tr = Math.round(Math.sin(t * 2.4));
  hand(100, 156 + tr, 1); hand(228, 148 - tr, -1);
  for (let i = 0; i < 50; i++) {
    const x = 50 + h1(i * 3.1) * 220, y = 34 + h1(i * 7.7) * 40;
    if (bayer(Math.round(x), Math.round(y)) > .82) fb.px(x, y, C.straw);
  }
}

// —— 躺着看星空：地平线压成剪影，画面下缘只露两个人的后脑 ——
export function stargaze(fb, t, lt, o = {}) {
  const { two = false, meteor = -1, point = true } = o;
  fb.rect(0, 0, 320, 180, C.ink);
  fb.vgrad3(0, 0, 320, 150, C.plum, C.deep, C.ink, .55, .95);
  // 银河：斜向抖动带
  for (let y = 0; y < 152; y++) for (let x = 0; x < 320; x++) {
    const d = Math.abs((y - 70) - (x - 160) * .22) / 46;
    if (d < 1 && bayer(x, y) < (1 - d) * .14) fb.px(x, y, d < .35 ? C.haze : C.dusk);
  }
  const dr = lt * 1.4;
  for (let i = 0; i < 78; i++) {
    const x = Math.floor(h1(i * 3.1) * 320);
    const y = Math.floor((h1(i * 7.7) * 158 + dr * (.4 + h1(i * 2.2) * .5)) % 158);
    const tw = h1(i * 5.3 + Math.floor(t * 1.2) * .37);
    if (tw < .52) continue;
    const big = tw > .9;
    fb.px(x, y, big ? C.paper : tw > .72 ? C.silver : C.blueLt);
    if (big) { fb.px(x - 1, y, C.haze); fb.px(x + 1, y, C.haze); fb.px(x, y - 1, C.haze); fb.px(x, y + 1, C.haze); }
  }
  for (let i = 0; i < 220; i++) {
    const x = Math.floor(h1(i * 4.7) * 320), y = Math.floor(h1(i * 8.3) * 150);
    const d = Math.abs((y - 70) - (x - 160) * .22) / 40;
    if (d > .8) continue;
    if (h1(i * 2.9) > .55) fb.px(x, y, d < .3 ? C.haze : C.dusk);
  }
  // 细弯月：实心圆挖掉一块。挖的时候别再补画一次实心圆，否则又变回满月。
  fb.ellipse(268, 34, 11, 11, C.paper);
  fb.ellipse(274, 30, 10, 10, C.deep);
  for (let r = 13; r < 26; r++) for (let a = 0; a < 20; a++) {
    const ang = a / 20 * 6.283, X = 268 + Math.cos(ang) * r, Y = 34 + Math.sin(ang) * r;
    if (bayer(Math.round(X), Math.round(Y)) < (1 - (r - 13) / 13) * .18) fb.px(X, Y, C.plum);
  }
  if (meteor >= 0 && meteor < 1) {
    const sx = 250 - meteor * 150, sy = 14 + meteor * 52;
    for (let i = 0; i < 16; i++)
      fb.px(sx + i * 1.3, sy - i * .45, i < 4 ? C.paper : i < 9 ? C.silver : C.blueLt);
  }
  // 地平线剪影
  fb.rect(0, 140, 320, 16, C.ink);
  for (let i = 0; i < 4; i++) {
    const bx = i * 88 - 10, bw = 78, bh = 16 + h1(i * 3.7) * 10;
    fb.rect(bx, 140 - bh + 4, bw, bh, C.night);
    for (let k = 0; k < 6; k++) {
      if (h1(i * 9 + k * 3.3) < .45) continue;
      const wy = 140 - bh + 12 + Math.floor(h1(i * 4 + k * 2.1) * 2) * 8;
      fb.rect(bx + 8 + k * 12, wy, 3, 6, h1(i * 7 + k) > .5 ? C.gold : C.warm);
    }
  }
  for (const [tx, tw2] of [[16, 18], [92, 14], [214, 16], [300, 12]]) {
    fb.ellipse(tx, 141, tw2, 9, C.ink);
    fb.ellipse(tx - tw2 * .5, 138, tw2 * .6, 7, C.ink);
    fb.ellipse(tx + tw2 * .5, 139, tw2 * .55, 6, C.ink);
  }
  fb.rect(0, 148, 320, 32, C.night);
  fb.vgrad(0, 148, 320, 32, C.night, C.deep, 1);
  for (let x = 0; x < 320; x += 3) fb.px(x, 148 + (x % 6 === 0 ? 1 : 0), C.pine);
  // 两个人的后脑：轮廓光 + 肩，侧脸点两个像素定朝向
  const head = (hx, hy, r, long) => {
    fb.ellipse(hx, hy + r * .18, r * 1.56, r * 1.26, C.wine);
    fb.ellipse(hx, hy - r * .02, r * 1.10, r * 1.12, C.wine);
    fb.ellipse(hx, hy + r * .2, r * 1.5, r * 1.2, C.night);
    fb.ellipse(hx, hy, r, r * 1.02, C.ink);
    fb.ellipse(hx, hy - r * .1, r * 1.06, r * 1.04, C.ink);
    if (long) {
      fb.rect(hx - r * 1.5, hy + r * .1, r * .7, r * 1.9, C.ink);
      fb.rect(hx + r * .75, hy + r * .1, r * .7, r * 1.9, C.ink);
    }
    fb.px(hx + r * 1.02, hy - r * .1, C.night);
    fb.px(hx + r * .95, hy + r * .3, C.night);
  };
  head(52, 172, 22, false);
  if (two) head(262, 170, 22, true);
  if (point) {
    fb.line(84, 182, 112, 150 + Math.sin(lt * .8) * 2, C.ink, 3);
    fb.rect(110, 146, 3, 5, C.wine);
  }
}
