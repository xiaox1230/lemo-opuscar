// main.js — 像素风 MV 骨架（可直接改）
//
// 页面契约（渲染器只认这四个全局）：
//   window.READY  = true            —— 模块与字体都就绪，可以开始抓帧
//   window.DUR    = 秒              —— 总时长
//   window.render = (t) => [...]    —— 画第 t 秒，返回这一帧的文字框
//   window.TEXTS  = (t) => [...]    —— 这一刻画面上有哪些文字（自检用）
//
// 铁律：render 里不许出现 Math.random / Date.now / 网络请求 / 跨帧累加状态。
// 违反任何一条，多线程分段渲染就会在不同段落接出不一样的画面。

import { FB, Pan, bayer, clamp, seg, ss, lerp } from './core/render.js';
import { C } from './core/palette.js';
import { initText, cnTextCenter, cnTextW } from './core/text.js';
import { sky, leaves, vignette } from './world/sky.js';
import { building, gate, tree, ground, steps, lamp } from './world/scenes.js';
import { alley, stargaze } from './world/plates.js';
import { draw as drawChar } from './lib/wardrobe.js';
import { LYRICS } from './lyrics.js';
// 还有这些零件没用到，按需引入：crowd() 人潮、classroomWide() 靠窗座位、
// letterOpen() 拆信特写、nightSky() 夜空、rain() 雨、street() 街、bike() 车。

// 字号在这里统一：11 是 320×180 下中文的舒适下限（10 勉强，8–9 必糊会被 text.js 拦住）
initText({ minPx: 9, warnPx: 11 });

const SCALE = 6;                     // 320 × 6 = 1920
const fb = new FB(320, 180);
const ctx = document.getElementById('c').getContext('2d');

// ——————————————————— 镜头表 ———————————————————
// 一句歌词一镜：t0/t1 直接抄 lyrics.js 的时间，改歌词不用改这里。
// cam: [起x, 止x] —— 相机世界坐标。位移 / 时长 < 12px/s 就干脆不动，慢摇比不动更难看。
const SHOTS = [
  { t0: 0.0, t1: 6.8, plate: 'gate', cam: [0, 0] },
  { t0: 6.8, t1: 13.5, plate: 'steps', cam: [0, -140] },
  { t0: 13.5, t1: 19.8, plate: 'alley', cam: [0, 0] },
  { t0: 19.8, t1: 24.0, plate: 'stars', cam: [0, 0] },
];
const DUR = 24;

// ——————————————————— 画板 ———————————————————
// 会被摇的镜头，背景必须画到画面外（OX0..OX1 就是 overscan）。
// 露边的典型症状：摇到某一帧，画面右边缘出现一条纯色竖条。
const OX0 = -240, OX1 = 560;

const PLATES = {
  gate(p, t, lt) {
    sky(p, { x0: OX0, x1: OX1, y1: 130, t, sun: { x: 250, y: 104, r: 13 } });
    building(p, 20, 34, 150, 96, t, { lit: 0.7 });
    gate(p, 168, 132, 44);
    tree(p, 60, 132, 1.15, t);
    ground(p, 130, 180, { x0: OX0, x1: OX1 });
    steps(p, 150, 134, 90, 4, 1);
    leaves(p, lt, { n: 18, speed: 10 });
    drawChar(p, {
      x: 200 + Math.sin(lt * .5), y: 168, h: 48, who: 'boy',
      act: 'wait', phase: lt * .4, expr: 'look', props: ['bag'],
    });
    vignette(p, { strength: .35 });
  },

  steps(p, t, lt) {
    sky(p, { x0: OX0, x1: OX1, y1: 120, t });
    building(p, -40, 46, 220, 74, t, { lit: 0.55 });
    ground(p, 120, 180, { base: C.wood, x0: OX0, x1: OX1 });
    steps(p, 170, 124, 120, 5, 1);
    tree(p, 30, 122, 1.3, t);
    lamp(p, 392, 120, 34);
    // 两个人坐着：写字的手在动，等的人只是看
    drawChar(p, { x: 250, y: 150, h: 46, who: 'girl', dir: -1, act: 'sit', phase: lt * .3, expr: 'calm' });
    drawChar(p, { x: 292, y: 150, h: 48, who: 'boy', dir: -1, act: 'write', phase: (lt * .25) % 1, expr: 'look' });
    leaves(p, lt + 3, { n: 12, speed: 8, seed: 5 });
  },

  alley(p, t, lt) {
    alley(p, t, lt, { rider: true });
    vignette(p, { strength: .4 });
  },

  stars(p, t, lt) {
    stargaze(p, t, lt, { two: true, meteor: seg(lt, 1, 3) });
  },
};

// ——————————————————— 字幕层 ———————————————————
// 字幕画在帧缓冲上（跟着像素网格走），不叠 DOM —— 否则放到 1920 时字会变虚。
// 底部 30px 是字幕区，构图时不要往这里放东西。
//
// 可读性靠两件事，缺一不可：
//   1) 字本身带 1px 四周描边（cnText 的 shadow 参数）—— 这是决定性的；
//   2) 底下垫一层 45% 的抖动暗色，把背景压下去但不切断画面。
// 直接铺一条实心黑条最省事，但整支 MV 会像在画面底下贴了块黑板。
const SUB = { y: 148, h: 32, size: 11, weight: 500 };

function currentLine(t) {
  for (const [a, b, s] of LYRICS) if (t >= a && t < b) return { a, b, s };
  return null;
}

function drawSubtitle(p, t) {
  const line = currentLine(t);
  if (!line) return null;
  const k = clamp((t - line.a) / .5) * clamp((line.b - t) / .5);   // 两头淡入淡出
  if (k <= 0.02) return null;
  for (let j = SUB.y; j < SUB.y + SUB.h; j++)
    for (let x = 0; x < p.w; x++)
      if (bayer(x, j) < .45 * k) p.px(x, j, C.ink);
  const ty = SUB.y + 8;
  cnTextCenter(p, line.s, p.w / 2, ty, C.paper, SUB.size, SUB.weight, C.ink);
  const w = cnTextW(line.s, SUB.size, SUB.weight);
  return { s: line.s, x: Math.round((p.w - w) / 2), y: ty, w, h: Math.ceil(SUB.size * 1.45) };
}

function drawTitle(p, t) {
  if (t < 0.4 || t > 5.2) return null;
  const k = seg(t, .4, 1.4) * (1 - seg(t, 4.2, 5.2));
  for (let j = 56; j < 116; j++)
    for (let x = 32; x < 288; x++)
      if (bayer(x, j) < .62 * k) p.px(x, j, C.ink);
  if (k <= .3) return null;
  const s = '等你下课';
  cnTextCenter(p, s, p.w / 2, 66, C.gold, 22, 700, C.ink);
  cnTextCenter(p, 'A CODE-RENDERED MV', p.w / 2, 96, C.silver, 10, 500, C.ink);
  const w = cnTextW(s, 22, 700);
  return { s, x: Math.round((p.w - w) / 2), y: 66, w, h: 32 };
}

// ——————————————————— 主渲染 ———————————————————
function shotAt(t) {
  for (const s of SHOTS) if (t >= s.t0 && t < s.t1) return s;
  return SHOTS[SHOTS.length - 1];
}

window.render = (t) => {
  t = clamp(t, 0, DUR - 1e-6);
  const s = shotAt(t);
  const lt = t - s.t0;
  const u = clamp(lt / (s.t1 - s.t0));

  // 相机：全程整数偏移。ss() 让起步/收尾更柔和，但结果必须 Math.round
  const camX = Math.round(lerp(s.cam[0], s.cam[1], ss(u)));
  const p = new Pan(fb, camX, 0);

  fb.clear(C.ink);
  PLATES[s.plate](p, t, lt);

  const texts = [];
  const sub = drawSubtitle(fb, t);          // 字幕不受相机影响，画在真帧缓冲上
  if (sub) texts.push(sub);
  const title = drawTitle(fb, t);
  if (title) texts.push(title);

  fb.present(ctx, SCALE);
  return texts;
};

// TEXTS 只报"真正是文字"的元素。把字幕底衬色块也报进去，自检会以为字被遮挡。
window.TEXTS = (t) => {
  const out = [];
  const line = currentLine(t);
  if (line) {
    const w = cnTextW(line.s, SUB.size, SUB.weight);
    out.push({ s: line.s, x: Math.round((320 - w) / 2), y: SUB.y + 7, w, h: Math.ceil(SUB.size * 1.45) });
  }
  if (t >= 0.7 && t <= 5.0) out.push({ s: '等你下课', x: 60, y: 66, w: 200, h: 32 });
  return out;
};

window.SHOTINFO = SHOTS.map((s, i) => ({ i, t0: s.t0, t1: s.t1, plate: s.plate }));
window.DUR = DUR;
window.READY = true;
