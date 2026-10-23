# 像素游戏风（320×180 索引帧缓冲）

适合：校园、怀旧、少年感、有大量"重复小动作"的故事。
成本最低、最不容易翻车、也最容易做出"游戏截图"的记忆点。

## 一、为什么是 320×180

- 1920 / 6 = 320，1080 / 6 = 180，**整数倍**放大。用 400×225 之类会出现非整数像素，边缘发毛。
- 51200 个像素，整屏重绘 < 1ms。6480 帧也不心疼，所以可以每一帧都真的重画。
- 32 色足够：颜色多不等于好看，**限制反而让画面统一**。

`assets/core/palette.js` 里备了三套（黄昏 / 夜 / 晨），槽位语义一致，换 `makePalette` 的参数即可整片换色。

## 二、画法的顺序

像素画的层次必须写死，顺序错了就是"糊成一块"：

```
天空/背景 → 远景（楼、树） → 地面 → 中景道具 → 角色（远侧肢体 → 躯干 → 近侧肢体 → 头）
→ 前景（掠过的柱子/树叶） → 字幕
```

角色内部的顺序在 `wardrobe.js` 里已经固定，不要改：

1. `hair.ink()` —— 比头发大一圈的墨线（剪影时才不毛边）
2. `hair.mass()` —— 头发实体
3. 脸（比头发小一圈的椭圆）
4. 刘海（`look.bangs`，**画在脸之后**）
5. 五官、腮红、眉毛、耳朵

> **最常见的翻车：发丝盖住脸。** 原因永远是"先画脸再画头发"，或者刘海画在了 `ellipse(脸)` 之前。脸必须最后盖上去。

## 三、常用调用

```js
import { FB, Pan, bayer, clamp, seg, ss, lerp } from './core/render.js';
import { C, makePalette } from './core/palette.js';
import { initText, cnTextCenter, cnTextW } from './core/text.js';
import { draw as drawChar } from './lib/wardrobe.js';

initText({ minPx: 9, warnPx: 11 });

const fb = new FB(320, 180);                       // 或 new FB(320, 180, myPal)
const ctx = canvas.getContext('2d');

// 角色
drawChar(fb, {
  x: 160, y: 168, h: 48,          // x,y = 脚底中点；h = 身高（像素）
  who: 'boy', dir: 1,             // dir: 1 朝右 / -1 朝左
  act: 'wait', phase: 0.3,        // phase 0..1 循环相位（走路/呼吸）
  expr: 'look', props: ['bag'],
  back: false, sil: null,         // sil 传颜色索引 = 整具身体压成剪影
});
```

`draw()` 返回 `{handF, handB, head, hip, shoulder, r}`，道具要挂在手上时用这个。

### 道具的两层

```js
defineProp('气球', (fb, {hx, hy, h, dir}) => { /* 画法 */ }, { anchor: 'hand', layer: 'over' });
```

- `layer: 'under'` —— 在身体之前画（书包带要压在衣服下面）
- `layer: 'over'` —— 在头之后画（伞、气球、举起来的东西）

**伞必须用 `over`**。否则伞杆被头盖住，画面上只剩一个浮在空中的红椭圆——这是最容易被忽略的一个"顺序错就废"的道具。

## 四、动作与姿态

`wardrobe.js` 里 `pose(act, phase)` 是"关节角度表"。加动作 = 加一个 `case`：

```js
case 'point':
  P.armF = [96, 4]; P.armB = [-10, 14]; P.lean = -2;
  P.head = [0, -1, -6];
  break;
```

角度约定：**0 = 竖直向下，正 = 朝角色正面**。膝盖/肘是相对上一节的附加角，`legF[1] = 0` 是直腿。

已有 18 个动作：`stand wait walk run jump sit squat lookup lookback letter hold umbrella write lean wave reach_up point cry`。

新角色 = `defineLook('男二', {...})`；新发型 = `defineHair('双马尾', {ink, mass})`。
**不要**给每个角色写一套 draw，那样 30 个镜头后一定不一致。

## 五、剪影与人群

```js
drawChar(fb, { ..., outline: false, sil: C.ink });   // 整具身体压成单色
```
`sil` 走的是 `fb.ovr`，所有 `px/rect/line/ellipse/poly` 都会强制成这个索引，所以描边、阴影全部消失，天然得到干净剪影。

人群镜就是这个功能的主场：背景两层剪影人潮（`crowd()`），主角是画面里**唯一有颜色**的人。孤独不用演，对比就出来了。

## 六、像素风的五类坑（都踩过）

| 症状 | 原因 | 修法 |
|---|---|---|
| 台阶像一排钢琴键 | 每一级只有一条色块，级与级之间没有明暗差 | 一级三条线：踏面 `silver` / 棱线 `haze` / 立面阴影 `dusk` |
| 慢摇像卡顿 | 位移 4px/s，等于每 6 帧跳一格 | 要么 ≥12px/s，要么 `cam: [0, 0]` 改成画面内的东西动 |
| 灯亮整屏硬跳 | 直接切整屏颜色，中间帧全变 | `fb.dissolveDark(1 - ramp)`：Bayer 有序溶解，配合 2 帧闪烁 |
| 渐隐发噪 | 每像素按 `hash(x,y)` 随机消失 | 用 `bayer(x, y) < ratio`，有序才像"溶解"不像"雪花" |
| 字幕压不住背景 | 只加了底衬、没给字描边 | `cnText(..., shadow=C.ink)` 四周补 1px |

另外两条只在低分辨率下出现：

- **字号 < 9px 的中文会糊成一团墨。** `text.js` 会在 8px 直接抛错、10px 警告一次。标题 11–14px，字幕 11–12px。英文可以到 8px。
- **1px 宽的线在 ×6 放大后会显得粗。** 想要"细线"的感觉，用 `C.haze` 这种中间色而不是黑色。

## 七、抖动（dither）用法

`bayer(x, y)` 返回 0..1 的阈值。想让 A 色渐变成 B 色：

```js
fb.mix(x, y, w, h, C.plum, C.deep, 0.45);   // 45% 的像素是 deep
fb.vgrad(x, y, w, h, C.deep, C.warm, 0.8);  // 竖向渐变，ease=0.8
fb.vgrad3(0, 0, 320, 150, C.plum, C.deep, C.ink, .55, .95);   // 三段
```

天空、水面、光池、"半透明"底衬全靠它。**不要**用 `rgba` / `globalAlpha`——索引帧缓冲里没有 alpha，只有索引。

## 八、一个镜头的写法

```js
const PLATES = {
  classroom(p, t, lt) {
    sky(p, { x0: -40, x1: 360, y1: 120, t });       // 会被摇就画宽点
    building(p, -40, 46, 220, 74, t, { lit: 0.55 });
    ground(p, 120, 180, { x0: -40, x1: 360 });
    drawChar(p, { x: 124, y: 176, h: 84, who: 'boy', dir: 1,
                  act: 'write', phase: (lt * .25) % 1, expr: 'sad' });
    // 桌子压在人前面，"在桌前"才成立
    p.rect(0, 148, 210, 32, C.woodDark);
  },
};
```

`t` 是全片时间（钟表、闪烁这类跨镜头连续的东西用它），`lt` 是本镜内时间（"这一镜从 0 演到 1"用它）。混用会导致同一动作在不同镜头里速度不同。
