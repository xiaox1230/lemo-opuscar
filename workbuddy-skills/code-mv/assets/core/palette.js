// palette.js — 索引调色板
// 用法：
//   import { C, makePalette } from './palette.js';
//   const myPal = makePalette([...32 个 #rrggbb], ['ink','sky',...]);
//   const fb = new FB(320, 180, myPal);
// 约定：调色板建议 32 色（索引 0 = 最暗，便于当"黑"用）；多几色也能跑，但 DARKEN 会变慢。
//
// 关键：颜色不是"任意 RGB"，而是一张固定的索引表。
// 好处是抖动（Bayer）可以在 32 色里造出成百上千种"观感色"，
// 并且每帧只写 Uint8，5 万像素的整屏重绘也毫无压力。

const srgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lum = ([r, g, b]) => r * 0.299 + g * 0.587 + b * 0.114;

// —— 默认调色板：黄昏校园 ——
// 紫灰天空 / 暖光 / 校服蓝 / 梧桐绿 / 皮肤 / 木色。换成夜景就把前 8 个换成更冷的蓝紫。
export const PAL_HEX = [
  '#0d0b18', '#1b1830', '#2b2547', '#3f3760', '#5a4f7d', '#7d6f9b', '#b0a3b8', '#efe6da',
  '#ffd9a0', '#f5b177', '#e88a5a', '#c9603f', '#a33c3a', '#71283a', '#3d1a2b',
  '#264f3f', '#3c7a52', '#5ca166', '#93c06a', '#d8cf7a',
  '#a8794a', '#7a5230', '#4a3220', '#241708',
  '#2b4a7d', '#48679b', '#8aa4c6', '#cdd9e6',
  '#c96a86', '#f0a3ab',
  '#ffc94d', '#ffffff',
];

// 语义名。写场景时用 C.pine 而不是 15 —— 换调色板不用改一行绘制代码。
export const NAMES = [
  'ink', 'night', 'deep', 'plum', 'dusk', 'haze', 'silver', 'paper',
  'skin', 'skinShade', 'warm', 'fire', 'rust', 'wine', 'maroon',
  'pine', 'leaf', 'grass', 'young', 'straw',
  'bark', 'wood', 'woodDark', 'woodInk',
  'navy', 'blue', 'blueLt', 'white',
  'pink', 'blush',
  'gold', 'pure',
];

/**
 * 造一张调色板的全部派生数据。
 * @param {string[]} hex   颜色表（#rrggbb）
 * @param {string[]} names 语义名，缺省时用 c0..cN
 */
export function makePalette(hex = PAL_HEX, names = NAMES) {
  const RGB = hex.map(srgb);
  const L = RGB.map(lum);

  // 每个颜色"压暗一档"的索引 —— 灯亮/灯灭的抖动过渡靠它，
  // 直接改亮度会让画面在某几帧整体跳色。
  const DARKEN = hex.map((_, i) => {
    let best = 0, bd = Infinity;
    for (let j = 0; j < hex.length; j++) {
      if (L[j] > L[i] * 0.62) continue;                     // 只找明显更暗的
      const d = Math.abs(L[j] - L[i] * 0.34)
        + Math.abs(RGB[j][0] - RGB[i][0] * 0.34)
        + Math.abs(RGB[j][1] - RGB[i][1] * 0.34)
        + Math.abs(RGB[j][2] - RGB[i][2] * 0.34);
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  });

  // 给 present() 用的 ABGR 查表（ImageData 是小端，顺序是 A,B,G,R）
  const LUT32 = new Uint32Array(hex.map((_, i) => {
    const [r, g, b] = RGB[i];
    return (255 << 24) | (b << 16) | (g << 8) | r;
  }));

  // 语义名 -> 索引
  const C = {};
  (names || []).forEach((n, i) => { if (i < hex.length) C[n] = i; });
  for (let i = 0; i < hex.length; i++) if (!('c' + i in C)) C['c' + i] = i;

  return { hex, RGB, LUT32, DARKEN, C, size: hex.length };
}

// 最近色（把任意 #rrggbb 折回索引）—— 用于"我想用这个色但调色板里没有"
export function nearest(pal, hex) {
  const [r, g, b] = srgb(hex);
  let best = 0, bd = Infinity;
  pal.RGB.forEach(([r2, g2, b2], i) => {
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

export const DEFAULT_PAL = makePalette();

// 默认调色板的语义名直出，供 world/ 与 lib/ 直接 import
export const C = DEFAULT_PAL.C;
export const RGB = DEFAULT_PAL.RGB;
export const DARKEN = DEFAULT_PAL.DARKEN;

// —— 其它几套现成调色板（同 32 槽位，语义名一致，可直接换）——

// 夜：把黄昏整体压成蓝紫，天空更暗，暖光只在灯下出现
export const PAL_NIGHT = makePalette([
  '#07060f', '#101528', '#1a2340', '#243056', '#333f70', '#4a5688', '#6d78a4', '#c9cfe0',
  '#ffd59a', '#f0ab72', '#d9825a', '#b2523c', '#8c3336', '#5e2233', '#331226',
  '#1b3d33', '#2c6045', '#468055', '#6d9a5c', '#b8b06a',
  '#8f653f', '#684329', '#3d2a1b', '#1c1207',
  '#223c66', '#3a5680', '#7590b4', '#b6c4d6',
  '#b45c74', '#e0909a',
  '#ffc94d', '#ffffff',
]);

// 晨：偏青绿，天空发白，用于回忆镜/结尾
export const PAL_DAWN = makePalette([
  '#0a0d0c', '#161f1c', '#24302b', '#364740', '#4f635a', '#748a7e', '#a8b8ac', '#f2f0e6',
  '#ffdfae', '#f7bb85', '#e39068', '#c4684a', '#a3403d', '#732a37', '#3f1c28',
  '#2a4f3d', '#40804f', '#62a463', '#9cc270', '#ded489',
  '#b08a55', '#82583a', '#503626', '#271a0d',
  '#33527f', '#52749e', '#94aec9', '#dbe4ea',
  '#cf7290', '#f4aab1',
  '#ffd166', '#ffffff',
]);
