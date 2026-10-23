// wardrobe.js — 角色骨架（速度树 / 关节角度驱动）
// 全片只调这里，造型才前后一致。
//
//   draw(fb, { x, y, h, who, dir, act, phase, expr, props, back, sil })
//     x,y  = 脚底中点
//     h    = 身高（像素，320×180 里男主 46、远景 20）
//     who  = LOOKS 里的键（'boy' / 'girl' / 自己 defineLook 的）
//     sil  = 传颜色索引时整具身体压成平色（人群、逆光、剪影转场）
//
// 角度约定：0 = 竖直向下，正 = 朝角色正面方向。全部是度数，不用弧度思考。
// 膝盖/肘部角度是"相对上一节"的附加量，所以 legF[1]=0 是直腿。

import { C } from '../core/palette.js';
import { clamp } from '../core/render.js';
import { PROPS, drawProp } from './props.js';

const D2R = Math.PI / 180;

// —— 骨架比例 ——
// 改这里会同时改变所有人物的头身比。headR=.143 约等于 7 头身，
// 想要更"绘本"就往 .18 调，想要更"写实"往 .12 调。
export const RIG = {
  headR: 0.143,
  hipY: 0.42,      // 胯高 / 身高
  shY: 0.68,       // 肩高 / 身高
  thigh: 0.21, shin: 0.21,
  upArm: 0.16, foreArm: 0.16,
  limb: 0.05,      // 肢体粗细 / 身高
  neck: 0.75,
};

// —— 造型 ——
// 颜色全部是调色板索引。换 PAL 时保持语义名一致即可，不用改这里。
export const LOOKS = {
  boy: {
    skin: { base: C.skin, shade: C.skinShade, hair: C.woodInk, hairLt: C.woodDark },
    cloth: { top: C.navy, topShade: C.blue, inner: C.white, leg: C.deep, legShade: C.night, shoe: C.woodInk, strap: C.wood },
    hair: 'short', bangs: false, bottom: 'shorts', blush: 1, headR: 1,
  },
  girl: {
    skin: { base: C.skin, shade: C.skinShade, hair: C.woodInk, hairLt: C.wine },
    cloth: { top: C.white, topShade: C.blueLt, inner: C.white, leg: C.wine, legShade: C.rust, shoe: C.ink, strap: C.straw },
    hair: 'long', bangs: true, bottom: 'skirt', blush: 1, headR: 1,
  },
};

export function defineLook(name, look) {
  LOOKS[name] = { ...LOOKS.boy, ...look };
  return LOOKS[name];
}

// —— 发型 ——
// mass：头发的实体；ink：比实体大一圈的墨线，剪影时才不会毛边。
// g = { hx, hy, r, sk, dir }
export const HAIR = {
  short: {
    ink: (fb, g) => {
      fb.ellipse(g.hx, g.hy - g.r * 0.08, g.r * 1.14, g.r * 1.14, C.ink);
      fb.rect(g.hx - g.r * 1.14, g.hy - g.r * 0.40, g.r * 2.28, g.r * 1.05, C.ink);
    },
    mass: (fb, g) => {
      fb.ellipse(g.hx, g.hy - g.r * 0.10, g.r * 1.07, g.r * 1.06, g.sk.hair);
      fb.rect(g.hx - g.r * 1.06, g.hy - g.r * 0.35, g.r * 0.34, g.r * 1.00, g.sk.hair);
      fb.rect(g.hx + g.r * 0.74, g.hy - g.r * 0.35, g.r * 0.34, g.r * 1.00, g.sk.hair);
    },
  },
  long: {
    ink: (fb, g) => {
      fb.ellipse(g.hx, g.hy - g.r * 0.08, g.r * 1.14, g.r * 1.14, C.ink);
      fb.rect(g.hx - g.r * 1.14, g.hy - g.r * 0.50, g.r * 2.28, g.r * 2.20, C.ink);
    },
    mass: (fb, g) => {
      fb.ellipse(g.hx, g.hy - g.r * 0.10, g.r * 1.07, g.r * 1.06, g.sk.hair);
      fb.rect(g.hx - g.r * 1.06, g.hy - g.r * 0.55, g.r * 0.50, g.r * 2.25, g.sk.hair);
      fb.rect(g.hx + g.r * 0.56, g.hy - g.r * 0.55, g.r * 0.50, g.r * 2.25, g.sk.hair);
      fb.px(g.hx - g.r * 0.82, g.hy + g.r * 1.45, g.sk.hairLt);
      fb.px(g.hx + g.r * 0.72, g.hy + g.r * 1.15, g.sk.hairLt);
    },
    back: (fb, g) => {
      fb.ellipse(g.hx, g.hy - g.r * 0.05, g.r * 0.92, g.r * 0.95, g.sk.hair);
      fb.rect(g.hx - g.r * 0.92, g.hy + g.r * 0.30, g.r * 1.84, g.r * 1.20, g.sk.hair);
      fb.rect(g.hx - g.r * 0.92, g.hy + g.r * 1.35, g.r * 1.84, Math.max(1, g.r * 0.22), g.sk.hairLt);
    },
  },
  bob: {
    ink: (fb, g) => {
      fb.ellipse(g.hx, g.hy - g.r * 0.08, g.r * 1.14, g.r * 1.14, C.ink);
      fb.rect(g.hx - g.r * 1.12, g.hy - g.r * 0.45, g.r * 2.24, g.r * 1.55, C.ink);
    },
    mass: (fb, g) => {
      fb.ellipse(g.hx, g.hy - g.r * 0.10, g.r * 1.05, g.r * 1.04, g.sk.hair);
      fb.rect(g.hx - g.r * 1.04, g.hy - g.r * 0.30, g.r * 0.70, g.r * 1.50, g.sk.hair);
      fb.rect(g.hx + g.r * 0.34, g.hy - g.r * 0.30, g.r * 0.70, g.r * 1.50, g.sk.hair);
    },
  },
  bun: {
    ink: (fb, g) => {
      fb.ellipse(g.hx, g.hy - g.r * 1.35, g.r * 0.52, g.r * 0.52, C.ink);
      HAIR.short.ink(fb, g);
    },
    mass: (fb, g) => {
      fb.ellipse(g.hx, g.hy - g.r * 1.32, g.r * 0.44, g.r * 0.44, g.sk.hair);
      HAIR.short.mass(fb, g);
    },
  },
  ponytail: {
    ink: (fb, g) => {
      fb.ellipse(g.hx - g.dir * g.r * 1.25, g.hy + g.r * 0.35, g.r * 0.45, g.r * 0.95, C.ink);
      HAIR.short.ink(fb, g);
    },
    mass: (fb, g) => {
      HAIR.short.mass(fb, g);
      fb.ellipse(g.hx - g.dir * g.r * 1.18, g.hy + g.r * 0.30, g.r * 0.38, g.r * 0.88, g.sk.hair);
      fb.px(g.hx - g.dir * g.r * 1.10, g.hy + g.r * 0.85, g.sk.hairLt);
    },
  },
  bald: { ink: () => {}, mass: () => {} },
};

export function defineHair(name, def) {
  HAIR[name] = { ink: () => {}, mass: () => {}, ...def };
  return HAIR[name];
}

// —— 动作 → 关节角度 ——
// 这是整套骨架的核心：动作不是关键帧位图，是关节角度。
// 加一个新动作只要在这里加一个 case，正/背/侧、左/右朝向全部自动成立。
function pose(act, p, look) {
  const s = Math.sin;
  const P = {
    lean: 0, head: [0, 0, 0],
    armF: [8, 6], armB: [-6, 6],
    legF: [4, 2], legB: [-4, 2],
    yOff: 0, squat: 0, breathe: 0,
  };
  const breathe = 0.5 + 0.5 * s(p * Math.PI * 2);
  P.breathe = breathe;

  switch (act) {
    case 'stand':
      P.armF = [6 + breathe * 2, 8]; P.armB = [-6 - breathe * 2, 8];
      P.legF = [5, 3]; P.legB = [-5, 3];
      P.head = [0, breathe * 0.4, 0];
      break;
    case 'wait':                       // 站着张望，重心压在一条腿上
      P.armF = [10, 26]; P.armB = [-4, 10];
      P.legF = [8, 4]; P.legB = [-9, 14];
      P.lean = -2; P.head = [1, breathe * 0.5, 3];
      break;
    case 'walk': {
      const ph = p * Math.PI * 2, sw = s(ph), sw2 = s(ph + Math.PI);
      P.legF = [22 * sw, Math.max(0, -18 * sw) + 6];
      P.legB = [22 * sw2, Math.max(0, -18 * sw2) + 6];
      P.armF = [-15 * sw, 20 + 6 * Math.abs(sw)];
      P.armB = [-15 * sw2, 20 + 6 * Math.abs(sw2)];
      P.yOff = -Math.abs(sw) * 1.5; P.lean = 2;
      break;
    }
    case 'run': {
      const ph = p * Math.PI * 2, sw = s(ph), sw2 = s(ph + Math.PI);
      P.legF = [38 * sw, Math.max(0, -50 * sw) + 10];
      P.legB = [38 * sw2, Math.max(0, -50 * sw2) + 10];
      P.armF = [-42 * sw, 60]; P.armB = [-42 * sw2, 60];
      P.yOff = -Math.abs(sw) * 2.5; P.lean = 8;
      break;
    }
    case 'jump': {                     // p 0..1：屈膝 → 起跳 → 滞空 → 落地
      const k = p < .2 ? p / .2 : p < .8 ? 1 : (1 - (p - .8) / .2);
      P.squat = (p < .2 ? p / .2 : p < .8 ? 1 - (p - .2) / .6 : 0) * 8;
      P.yOff = -Math.sin(clamp((p - .15) / .7) * Math.PI) * 14;
      P.legF = [10 * k, 30 * k]; P.legB = [-10 * k, 30 * k];
      P.armF = [40 + 90 * k, 20]; P.armB = [30 + 80 * k, 20];
      P.lean = 3 * k;
      break;
    }
    case 'sit':
      P.squat = 13; P.legF = [86, 84]; P.legB = [80, 80];
      P.armF = [22, 40]; P.armB = [14, 40]; P.lean = -4;
      P.head = [0, 1, -2];
      break;
    case 'squat':
      P.squat = 12; P.legF = [70, 100]; P.legB = [-60, 100];
      P.armF = [30, 50]; P.armB = [10, 40]; P.lean = 8;
      break;
    case 'lookup':
      P.head = [0, -1, -14]; P.armF = [4, 6]; P.armB = [-4, 6];
      P.legF = [4, 2]; P.legB = [-4, 2]; P.lean = -3;
      break;
    case 'lookback':
      P.head = [0, 0, 8]; P.armF = [6, 10]; P.armB = [-6, 10];
      break;
    case 'letter':                     // 单手前伸递信
      P.armF = [58, 18]; P.armB = [-8, 24]; P.lean = 4;
      P.legF = [8, 4]; P.legB = [-6, 4]; P.head = [0, 0, 4];
      break;
    case 'hold':                       // 双手捧
      P.armF = [42, 62]; P.armB = [38, 62]; P.lean = 2;
      break;
    case 'umbrella':
      P.armF = [16, 96]; P.armB = [-8, 16];
      P.legF = [4, 2]; P.legB = [-4, 2];
      break;
    case 'write':
      P.squat = 12; P.legF = [84, 80]; P.legB = [78, 78];
      P.armF = [52, 46]; P.armB = [30, 56]; P.lean = 10; P.head = [0, 1, 8];
      break;
    case 'lean':                       // 靠墙，单脚点地
      P.lean = -7; P.legF = [12, 6]; P.legB = [-16, 26];
      P.armB = [-16, 30]; P.armF = [16, 34];
      P.head = [0, 0, 2];
      break;
    case 'wave':
      P.armF = [150 + 12 * s(p * Math.PI * 2), 20]; P.armB = [-6, 10];
      break;
    case 'reach_up':
      P.armF = [170, 6]; P.armB = [160, 10]; P.head = [0, -1, -8];
      break;
    case 'point':                      // 抬手指远处（星空/远方）
      P.armF = [96, 4]; P.armB = [-10, 14]; P.lean = -2;
      P.head = [0, -1, -6];
      break;
    case 'cry':                        // 低头抹眼
      P.armF = [64, 78]; P.armB = [-4, 10]; P.lean = 6;
      P.head = [0, 1.5, 6];
      break;
    default: break;
  }
  return P;
}

// 关节：起点 + 角度(0=向下) → 终点
const seg2 = (x, y, a, len) => [x + Math.sin(a * D2R) * len, y + Math.cos(a * D2R) * len];

// 五官。像素太小的时候（r<5）不画眼，只留发型剪影——比画两坨糊点好看。
function eyeSet(fb, X, Y, expr, sx) {
  const e = (dx, dy, c = C.ink) => fb.px(X + dx * sx, Y + dy, c);
  switch (expr) {
    case 'happy': e(-2, 0); e(-1, -1); e(0, 0); e(1, -1); e(2, 0); break;
    case 'shy': e(-2, 0); e(-1, 0); e(1, 0); e(2, 0); break;
    case 'sad': e(-2, -1); e(-1, 0); e(1, 0); e(2, -1); break;
    case 'teary': e(-2, 0); e(-1, 0); e(1, 0); e(2, 0); e(-1, 1, C.blueLt); e(1, 1, C.blueLt); break;
    case 'closed': e(-2, 0); e(-1, 0); e(0, 0); e(1, 0); e(2, 0); break;
    case 'look': e(-2, 0); e(-1, 0); e(1, 0); e(2, 0); break;
    default: e(-2, 0); e(1, 0); break;   // calm
  }
}

function mouth(fb, X, Y, expr) {
  switch (expr) {
    case 'happy': fb.px(X - 1, Y, C.wine); fb.px(X, Y + 1, C.wine); fb.px(X + 1, Y, C.wine); break;
    case 'sad': fb.px(X - 1, Y + 1, C.wine); fb.px(X, Y, C.wine); fb.px(X + 1, Y + 1, C.wine); break;
    case 'shy': fb.px(X - 1, Y, C.blush); fb.px(X, Y, C.wine); fb.px(X + 1, Y, C.blush); break;
    case 'open': fb.rect(X - 1, Y, 2, 2, C.wine); fb.px(X - 1, Y + 2, C.rust); break;
    default: fb.px(X - 1, Y, C.skinShade); fb.px(X, Y, C.skinShade); break;
  }
}

// —— 主绘制 ——
export function draw(fb, o = {}) {
  const {
    x = 160, y = 174, h = 46, who = 'boy', dir = 1,
    act = 'stand', phase = 0, expr = 'calm',
    props = [], t = 0, outline = true, sil = null, back = false,
  } = o;

  const ovr0 = fb.ovr;
  if (sil != null) fb.ovr = sil;                 // 剪影：整具身体压成单色

  const look = typeof who === 'object' ? who : (LOOKS[who] || LOOKS.boy);
  const sk = look.skin, cl = look.cloth;
  const P = pose(act, phase, look);
  const s = dir >= 0 ? 1 : -1;

  // —— 比例（全部从 RIG 来，改一处全片生效）——
  const headR = h * RIG.headR * (look.headR || 1);
  const hipY = y - h * RIG.hipY + P.yOff;
  const shY = y - h * RIG.shY + P.yOff + P.squat * 0.45;
  const neck = shY - headR * RIG.neck;
  const torsoLean = P.lean * D2R;
  const hipX = x, shX = x + Math.sin(torsoLean) * (hipY - shY) * s;

  const thigh = h * RIG.thigh, shin = h * RIG.shin;
  const upArm = h * RIG.upArm, foreArm = h * RIG.foreArm;

  const legF = seg2(hipX + s, hipY, s * P.legF[0], thigh);
  const footF = seg2(legF[0], legF[1], s * (P.legF[0] + P.legF[1]), shin);
  const legB = seg2(hipX - s, hipY, s * P.legB[0], thigh);
  const footB = seg2(legB[0], legB[1], s * (P.legB[0] + P.legB[1]), shin);

  const shF = [shX + s * h * 0.045, shY + 1], shB = [shX - s * h * 0.045, shY + 1];
  const elbF = seg2(shF[0], shF[1], s * P.armF[0], upArm);
  const handF = seg2(elbF[0], elbF[1], s * (P.armF[0] - P.armF[1]), foreArm);
  const elbB = seg2(shB[0], shB[1], s * P.armB[0], upArm);
  const handB = seg2(elbB[0], elbB[1], s * (P.armB[0] - P.armB[1]), foreArm);

  const lw = Math.max(2, Math.round(h * RIG.limb));

  // 道具分两趟：under 在身体之前（书包带要压在衣服下），over 在头之后（伞、气球）
  const attach = [];
  for (const pr of props) {
    const kind = typeof pr === 'string' ? pr : pr.kind;
    const def = PROPS[kind];
    if (!def) continue;
    let hx, hy;
    if (def.anchor === 'shoulder') { hx = shX - s * h * 0.05; hy = shY + 2; }
    else if (def.anchor === 'handB' || (pr.hand === 'B')) { hx = handB[0]; hy = handB[1]; }
    else { hx = handF[0]; hy = handF[1]; }
    attach.push({ kind, def, hx, hy });
  }
  const drawProps = (layer) => {
    for (const a of attach) {
      if (a.def.layer !== layer) continue;
      drawProp(fb, a.kind, { hx: a.hx, hy: a.hy, h, dir: s, t, look });
    }
  };

  const drawLimbs = (asBack) => {
    const leg = asBack ? [legB, footB] : [legF, footF];
    const arm = asBack ? [shB, elbB, handB] : [shF, elbF, handF];
    const col = asBack ? cl.legShade : cl.leg;
    const acol = asBack ? cl.topShade : cl.top;

    if (outline) {
      fb.line(leg[0][0], leg[0][1], leg[1][0], leg[1][1], C.ink, lw + 2);
      fb.line(x + (asBack ? -s : s), hipY, leg[0][0], leg[0][1], C.ink, lw + 2);
    }
    fb.line(leg[0][0], leg[0][1], leg[1][0], leg[1][1], col, lw);
    fb.line(hipX + (asBack ? -s : s), hipY, leg[0][0], leg[0][1], col, lw);

    const fx = leg[1][0], fy = leg[1][1];
    fb.rect(fx - 1, fy - 1, lw + 1, 2, cl.shoe);
    fb.px(fx + s * (lw + 1 > 2 ? 1 : 0), fy - 1, cl.shoe);

    if (outline) {
      fb.line(arm[0][0], arm[0][1], arm[1][0], arm[1][1], C.ink, lw + 2);
      fb.line(arm[1][0], arm[1][1], arm[2][0], arm[2][1], C.ink, lw + 2);
    }
    fb.line(arm[0][0], arm[0][1], arm[1][0], arm[1][1], acol, lw);
    fb.line(arm[1][0], arm[1][1], arm[2][0], arm[2][1], acol, lw);
    fb.rect(arm[2][0] - 1, arm[2][1] - 1, 2, 2, sk.base);   // 手
  };

  drawLimbs(true);                                  // 远侧先画
  drawProps('under');                               // 书包带压在衣服下

  // —— 躯干 ——
  const torso = [
    [shX - s * h * 0.07, shY - h * 0.01], [shX + s * h * 0.07, shY - h * 0.01],
    [hipX + s * h * 0.055, hipY + 1], [hipX - s * h * 0.055, hipY + 1],
  ];
  if (outline) fb.outline(torso, C.ink);
  fb.poly(torso, cl.top);
  fb.rect(shX - s * h * 0.02, shY, 2, h * 0.09, cl.inner);   // 领口

  if (look.bottom === 'skirt') {
    const skirt = [
      [hipX - h * 0.06, hipY], [hipX + h * 0.06, hipY],
      [hipX + h * 0.085, hipY + h * 0.13], [hipX - h * 0.085, hipY + h * 0.13],
    ];
    if (outline) fb.outline(skirt, C.ink);
    fb.poly(skirt, cl.leg);
    for (let i = -2; i <= 2; i++)
      fb.line(hipX + i * h * 0.02, hipY + 2, hipX + i * h * 0.026, hipY + h * 0.125, cl.legShade);
  } else if (look.bottom === 'pants') {
    fb.rect(hipX - h * 0.06, hipY - 1, h * 0.12, h * 0.14, cl.leg);
  } else {                                          // shorts
    fb.rect(hipX - h * 0.06, hipY - 1, h * 0.12, h * 0.07, cl.leg);
  }

  drawLimbs(false);                                 // 近侧后画

  // —— 头 ——
  const hx = shX + P.head[0] * s + Math.sin(torsoLean) * headR * 0.6 * s;
  const hy = neck - headR * 0.55 + P.head[1];
  const r = headR;
  fb.rect(hx - 1, hy + r * 0.70, 2, Math.max(1, r * 0.55), sk.shade);   // 脖子

  const hair = HAIR[look.hair] || HAIR.short;
  const g = { hx, hy, r, sk, dir: s };

  // 先画大一圈的墨线，再铺头发实体，最后把脸盖上去 ——
  // 顺序错了就是"发丝糊在脸上"，这是像素角色最常见的翻车。
  hair.ink(fb, g);
  if (back) {
    if (hair.back) hair.back(fb, g);
    else {
      fb.ellipse(hx, hy - r * 0.05, r * 0.92, r * 0.95, sk.hair);
      fb.rect(hx - r * 0.8, hy + r * 0.45, r * 1.6, r * 0.5, sk.hair);
    }
    fb.px(hx - r * 0.28, hy - r * 0.62, sk.hairLt);
    fb.px(hx + r * 0.30, hy - r * 0.50, sk.hairLt);
  } else {
    hair.mass(fb, g);
    // 脸：比头发小一圈，露出一圈头发当轮廓
    fb.ellipse(hx, hy + r * 0.24, r * 0.76, r * 0.76, sk.base);
    // 刘海：只有 look.bangs 为真才画，且画在脸之后（否则盖住脸）
    if (look.bangs) {
      for (let i = -3; i <= 3; i++) {
        const yy = hy - r * 0.36 + Math.abs(i) * r * 0.06;
        fb.px(hx + i * r * 0.22, yy, sk.hair);
      }
    }
    const fx = hx + s * r * 0.16, fy = hy + r * 0.18;
    if (r >= 5) {                                    // 太小就别画眼，糊
      eyeSet(fb, fx, fy, expr, s);
      mouth(fb, fx, fy + Math.max(2, r * 0.52), expr);
    }
    if (expr === 'shy' && look.blush) {
      fb.px(hx - s * r * 0.52, fy + 1, C.blush);
      fb.px(hx - s * r * 0.64, fy + 1, C.blush);
    }
    if (r > 6) {                                     // 眉毛
      if (expr === 'sad') {
        fb.px(fx - 2, fy - 3, sk.hair); fb.px(fx + 2, fy - 3, sk.hair);
        fb.px(fx - 1, fy - 2, sk.hair); fb.px(fx + 1, fy - 2, sk.hair);
      } else if (expr === 'happy') {
        fb.px(fx - 2, fy - 3, sk.hair); fb.px(fx + 2, fy - 3, sk.hair);
      } else {
        fb.px(fx + s, fy - 3, sk.hair);
      }
    }
    fb.px(hx - s * r * 0.84, fy, sk.shade);          // 耳朵
  }

  fb.ovr = ovr0;
  drawProps('over');                                // 伞/气球：必须压在头上面
  return { handF, handB, head: [hx, hy], hip: [hipX, hipY], shoulder: [shX, shY], r };
}

/**
 * 角色设定图：给用户确认造型用。**这一步不能省** —— 造型定不下来就开画全片，
 * 30 个镜头全部返工。
 *
 * 版式：
 *   上排  每个角色的 正面 / 背面
 *   下排  每个角色的 三个表情（calm / happy / sad 可改）
 *
 * 注意：这套骨架只有正面和背面。所谓"侧面"是正面镜像 + 转头角度近似出来的，
 * 不要在这张图上假装有真正的侧视图 —— 需要侧脸时用 back:true 或 3/4 角度构图。
 */
export function drawSheet(fb, opts = {}) {
  const {
    w = fb.w, h = fb.h,
    who = ['boy', 'girl'],
    hgt = 58,
    exprs = ['calm', 'happy', 'sad'],
  } = opts;

  fb.clear(C.deep);
  for (let x = 0; x < w; x += 16) fb.vline(x, 0, h - 1, C.night);
  for (let y = 0; y < h; y += 16) fb.hline(0, w - 1, y, C.night);

  const perChar = w / who.length;
  const y1 = Math.round(h * 0.44);       // 上排脚底线
  const y2 = h - 4;                      // 下排脚底线

  who.forEach((name, ci) => {
    const x0 = perChar * ci;
    // 上排：正面 + 背面（镜像朝向，让两张脸的朝向对称）
    draw(fb, { x: x0 + perChar * 0.30, y: y1, h: hgt, who: name, dir: 1, act: 'stand', expr: 'calm', phase: .25 });
    draw(fb, { x: x0 + perChar * 0.72, y: y1, h: hgt, who: name, dir: -1, back: true, act: 'stand', expr: 'calm', phase: .25 });
    // 下排：表情。尺寸别压太小 —— r < 6 时眉毛画不出来，三个表情看着一模一样
    exprs.forEach((e, ei) => {
      const x = x0 + perChar * (0.18 + ei * 0.30);
      draw(fb, { x, y: y2, h: hgt * 0.80, who: name, dir: 1, act: 'stand', expr: e, phase: ei / 3 });
    });
  });
  // 分隔线：上下两排 + 角色之间，读图时有"这是表"的感觉
  fb.hline(0, w - 1, Math.round(h * 0.47), C.night);
  for (let i = 1; i < who.length; i++) fb.vline(Math.round(perChar * i), 0, h - 1, C.night);
  return fb;
}
