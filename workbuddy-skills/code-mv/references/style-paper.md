# 纸艺拼贴绘本（Canvas 2D 直绘，1920×1080）

适合：回忆、童年、书信、温柔的歌。画风自带"这是手工做的"的温度，观众不会追问"为什么不像照片"。

## 一、四个基本件

整套画风只有四个函数，全在 `assets/templates/paper/paper.js` 里，可以直接抄。

### 1. 纸纹理（模块加载时生成一次）

```js
function paperTex(w, h, base, fiber, dust) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h / 90; i++) {          // 纸浆颗粒
    const x = rnd(i * 3.7) * w, y = rnd(i * 7.1 + 1) * h, r = .6 + rnd(i * 2.3) * 1.6;
    g.fillStyle = `rgba(${dust},${.03 + rnd(i * 5.9) * .07})`;
    g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
  }
  for (let i = 0; i < 260; i++) {                  // 纤维
    /* 长 20–110px 的细线，角度接近水平 */
  }
  return c;
}
```

**必须用 `rnd(seed)` 而不是 `Math.random()`。** 渲染器是多进程分段抓帧的，每个进程重新加载页面时纹理都不一样，接缝处一眼就看出来。这是这套画风最容易犯、最难发现的错。

准备两张：`kraft`（牛皮纸 `#cbb083`）当底，`news`（旧报纸 `#e6dcc6`）当彩色纸片的纹。

### 2. 撕纸边

```js
function torn(pts, amp, seed) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const segs = Math.max(2, Math.round(Math.hypot(b[0]-a[0], b[1]-a[1]) / 26));  // 每 26px 一个采样
    for (let k = 0; k < segs; k++) {
      const u = k / segs;
      const n = (rnd(seed + i * 7.7 + k * 3.3) - .5) * 2 * amp;
      out.push([a[0] + (b[0]-a[0])*u + n, a[1] + (b[1]-a[1])*u + n]);
    }
  }
  return out;
}
```
`amp` 8–14 是纸，20 以上就是"手绘毛边"了。采样密度决定毛边的频率：太密像锯齿，太疏像折线。

### 3. 一块纸片

```js
function piece(pts, fill, o = {}) {
  // ① 投影
  // ② 白边（lineWidth = edge, strokeStyle = '#f7f1e2'）
  // ③ 纸色填充
  // ④ 纸纹（clip 后 drawImage 纹理，globalAlpha ≈ .85）
}
```

顺序不能换：**先白边再填色**，白边会被填色吃掉一半，剩下的那半才像"剪纸";反过来就成了描边贴纸。

- `edge`: 0（远山、天空这种"背景纸"）→ 6–9（小物件）→ 12–14（大块）
- `shadow`: 24–30 给前景，10–16 给背景。投影方向固定右上（`offsetX 10, offsetY 14`），光源才统一。

### 4. 关节纸偶

`doll(x, y, h, who, dir, act, ph, ex)`：腿/身/臂都是 `torn()` 出来的纸片，
四肢用"先粗白线、再细色线"叠出剪纸白边。

比例和像素风不同：这里用 **2 头身**（`hr = h * .13`，头占 1/7.7），比像素风更"绘本"。

## 二、手作感的三条规则

1. **10fps 步进。** `const fr = Math.floor(t * 10)`。24fps 全帧平滑会像塑料动画；10fps 才有定格感。
2. **每层各抖各的。** 每个纸片用不同种子抖 1–2px：
   ```js
   const jx = k => (rnd(fr * 1.7 + k) - .5) * 3;
   ```
   整帧一起抖就成了"画面在晃"（晕）。
3. **同一片纸每帧的抖动要连续。** 用 `fr`（帧号）当种子，不要用 `t` 的小数部分，否则 24fps 采到的 10fps 帧会重复错乱。

## 三、字幕

不要黑条。用一条**撕纸白条** + 深棕字：

```js
piece(torn([[x0, y], [x1, y-6], [x1, y+bh], [x0, y+bh+4]], 5, 900),
      '#f4ecd8', { edge: 8, shadow: 22, tex: news });
ctx.fillStyle = '#3a2e20';
ctx.font = '500 46px "Microsoft YaHei", ...';
ctx.fillText(s, W/2 - tw/2, y + 16);
```
字放在纸条**偏上** 16px 处（视觉居中，不是几何居中，纸条下缘的撕边更重）。

## 四、这套画风的坑

| 症状 | 原因 | 修法 |
|---|---|---|
| 分段接缝处纹理突变 | 纹理生成用了 `Math.random()` | 全部换 `rnd(i)` |
| 纸片看起来是"描边"不是"剪纸" | 先描边再填色 | 调换：填色后描边，或把 edge 加大再填 |
| 画面像在晃，看着晕 | 整帧共用一个抖动种子 | 每层独立种子 `k` |
| 人物像贴纸浮在背景上 | 忘了投影，或投影方向和别处不同 | 统一 `offsetX 10, offsetY 14` |
| 撕边像锯齿 | 采样过密（每 8px） | 放宽到 26px/段，`amp` 提到 10–14 |
| 太干净、不像纸 | 缺纸纹 | 每个 `piece` 都传 `tex`，透明度 .85 |

## 五、性能

纸艺是"每个色块一个离屏 canvas + 一次 drawImage"。一帧 30–60 个色块 = 60 次 canvas 创建。
1080p 下单帧 30–80ms，是全片最慢的画风。对策：

- `--workers 4`，别用 6（内存会飙）。
- 大面积静态纸片（天空、地面）可以预渲染成一张缓存，只重画人物和前景。真要做全曲，这一步是必须的：`if (fr === cachedFr) ctx.drawImage(cache, 0, 0)`。
- 不要在 `piece()` 里 `ctx.shadowBlur` 叠加多层——每层阴影都是全画面模糊，成本随层数线性涨。
