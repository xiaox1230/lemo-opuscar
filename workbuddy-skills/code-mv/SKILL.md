---
name: code-mv
description: 用代码逐帧渲染完整音乐 MV（1920×1080、24fps，画面全部由帧缓冲或 Canvas 2D 绘制，不用图片素材、不用生成式视频），内置像素游戏风、纸艺拼贴绘本、蜡笔手绘绘本三种画风与一套复用角色骨架。当用户要求「做一支 MV」「给这首歌配画面」「代码画 MV」「全代码动画」「音乐可视化短片」，或要求把某首歌做成像素风/绘本风动画时使用。内含画风样片的确认流程、一句歌词一镜的分镜法，以及像素风在低分辨率下踩过的坑。
---

# 用代码做一支完整的 MV

不是图像生成，不是视频生成。**每一帧都是一次函数调用**：`render(t) => 画面`。
这个差别决定了三件事：

1. **可重渲**。改一个颜色、挪一像素、换一句字幕，重跑 2 分钟，整片跟着变。生成式视频做不到。
2. **确定性**。同一个 `t` 永远是同一帧，所以能用 6 个进程并行抓帧，拼起来没有接缝。
3. **成本可算**。6480 帧就是 6480 次 `render`，不看 GPU 脸色。

代价是：**所有的"好看"都要你自己写**。所以这套 skill 的重点不是"怎么画一个人"，
而是"怎么在 30 个镜头里把同一个人画成一个样子，并且让观众看不出这是代码画的"。

样板成片：《等你下课》全曲 270 秒 / 31 镜，见 `references/case-dengnixiake.md`。

---

## 一、五步流程，中间必须停三次

```
① 定画风  ──▶ [停] 用户选画风
② 画角色  ──▶ [停] 用户确认造型（设定图）
③ 分镜    ──▶ [停] 用户确认时长与结构
④ 整片    ──▶ 一次性出 MP4
⑤ 自检    ──▶ 五类翻车点，不合格回去改
```

**三个检查点不是礼貌，是成本控制。**
画风错了 → 31 个镜头全废；角色错了 → 31 个镜头里的脸全废；分镜错了 → 重新对时间轴。
停下来问一次的代价是 1 分钟，不问的代价是 2 小时。

用 `AskUserQuestion` 问，不要用正文问（正文里的问题用户容易漏看）。每次最多 3 个问题。

### 步骤 0：先量歌，再动手

```sh
LIB=$(sh scripts/find-lib.sh | sed -n 's/^LIB=//p')
"$LEMO_PY" scripts/analyze_song.py song.mp3
```

得到时长、响度、BPM、能量曲线、段落（quiet/build/loud）、能量峰值、静音段。
**副歌在哪一段，决定哪里给近景**——不要靠听感猜，看 `sections[]` 里 `kind: loud` 的区间。

---

## 二、画风：先出样图，再动全片

### 三种画风的取舍

| | 像素游戏风 | 纸艺拼贴绘本 | 蜡笔手绘绘本 |
|---|---|---|---|
| 记忆点 | "游戏截图"的怀旧 | "手工做的"温度 | "线在动"的生命感 |
| 绘制载体 | 320×180 索引帧缓冲 ×6 | Canvas 2D 1920×1080 | Canvas 2D 1920×1080 |
| 单帧成本 | < 1ms | 30–80ms | 40–70ms |
| 全片耗时 | ~2 分钟 | ~15 分钟 | ~12 分钟 |
| 适合的歌 | 校园、少年、热血、怀旧 | 回忆、书信、温柔、离别 | 童年、愿望、日记体 |
| 最怕的坑 | 慢摇卡顿、中文太小糊 | 随机纹理在分段接缝处突变 | 几何位置跟着抖动（画面晃） |
| 详细文档 | `references/style-pixel.md` | `references/style-paper.md` | `references/style-crayon.md` |

三种都支持"一句歌词一镜"。像素风因为成本低，可以放心做 30 镜；两种 2D 风建议 15–20 镜。

### 出样图的做法

同一个开场画面，三种画风各渲一张，附一句话理由，让用户选：

```sh
node $LIB/core/render/still.mjs <风格模板目录> 2.0 --prefix <风格名>_ --out /tmp/style
```

要渲的是**同一个镜头**（同一构图、同一个人物），否则用户比不出来。
每张图给一句理由，例如"像素风的低分辨率会把校门口的铁栅栏简化成三条竖线，反而更像记忆"。

**不要**一下给 10 张。3 张 + 每张一句话，用户 10 秒能决定。

---

## 三、角色：一套 draw()，不是 31 套

```js
import { draw as drawChar } from './lib/wardrobe.js';

drawChar(fb, {
  x: 160, y: 168, h: 48,        // 脚底中点 + 身高
  who: 'boy', dir: 1,
  act: 'wait', phase: 0.3, expr: 'look', props: ['bag'],
});
```

- **18 个动作**（`stand wait walk run jump sit squat lookup lookback letter hold umbrella write lean wave reach_up point cry`）都是关节角度表里的一个 `case`，加动作不用写新函数。
- **8 个表情**（`calm happy shy sad teary closed look open`）。
- **道具走注册表**：`defineProp('气球', fn, {anchor:'hand', layer:'over'})`，不在 `draw()` 里加 `if`。
  `layer:'over'` 画在头之后（伞、气球这类会挡脸的），`'under'` 画在身体之前（书包带）。
- **剪影**：`sil: C.ink` 让整具身体压成单色 —— 人群、逆光、转场全靠它。

画完必须出**设定图**给用户确认：

```js
import { drawSheet } from './lib/wardrobe.js';
drawSheet(fb, { who: ['boy', 'girl'], hgt: 58 });   // 上排 正面/背面，下排 三个表情
```

**这套骨架只有正面和背面。** 所谓"侧面"是镜像 + 转头角度近似出来的，
需要侧脸镜头就用 `back: true` 或者 3/4 角度的构图，别硬画侧视图。

这一步返回的 `{handF, handB, head}` 等锚点，后面挂道具要用。

---

## 四、分镜：一句歌词一镜

```js
const SHOTS = [
  { t0: 15.37, t1: 22.50, plate: 'alley',     cam: [0, 0] },
  { t0: 22.62, t1: 28.50, plate: 'room',      cam: [0, -40] },
];
```

三条规则：

1. **`t0/t1` 直接抄歌词时间**。歌词是唯一的时间真相，不要重新估。
2. **不要一句歌词跨两个镜头**，观众会看到字幕换镜。两句合成一镜可以。
3. **相邻镜必须有物理钩子**：蒸汽、伞面、柱子、发梢、纸角、衣角。没有钩子的相邻镜就是 PPT 翻页。

镜长：
```
镜长 = 下一句起点 − 0.18（留白）− 本句起点，夹在 [1.7s, 6.8s]
```
前奏 / 间奏 / 尾声没有歌词，不受夹取约束，但必须有画面内运动，否则判定为幻灯片。

转场只用 4 种（都便宜、都不出戏）：

| 转场 | 做法 | 用在哪 |
|---|---|---|
| 前景物扫过 | 树叶/衣角/柱子横穿画面 0.4s | 同场景的相邻镜 |
| 卡点切 | 直接换 plate，切点落在强拍 | 段落交界 |
| 上摇/下摇空镜 | 一个 plate 里放 2–3 个景，相机竖直移 | 间奏、时间跳跃 |
| 亮起/熄灭 | `dissolveDark()` 有序溶解 | 开灯、入夜、黑场 |

**不要整屏叠化。** 在像素/手绘风里，叠化会出现两种风格混在一起的脏帧。

---

## 五、整片：一张画布，相机移动

```js
const p = new Pan(fb, camX, 0);   // Pan 是带整数偏移的画布代理
PLATES[s.plate](p, t, lt);        // plate 里照常写绝对坐标
```

- **相机速度要么 0，要么 ≥12px/s**（320×180）。4px/s 的平移 = 每 6 帧跳一格 = 肉眼可见的卡。这个速度下宁可静止，改让画面里的东西动。
- 会被摇的 plate，背景要画到画面外：`sky(p, {x0:-240, x1:560})`。露边的症状是某一帧边缘出现一条纯色竖条。
- 字幕画在帧缓冲**最上层**，固定底部 32px，不参与构图。可读性靠**字的 1px 四周描边**，底衬只是辅助（45% 抖动，不要实心黑条）。

完整骨架（含 `SHOTS` 表、`drawSubtitle`、`drawTitle`、`TEXTS`）：`references/skeleton.md`。

---

## 六、渲染与混流

```sh
FPS=24; WK=6; FILM=films/my-song

node $LIB/core/render/video.mjs $FILM --fps $FPS --workers $WK --out $FILM/out/video.mp4

ffmpeg -y -v error -i $FILM/song.mp3 -t 270 -ar 48000 -ac 2 -c:a pcm_s16le $FILM/out/mix.wav

sh $LIB/core/render/mux.sh $FILM/out/video.mp4 $FILM/out/mix.wav $FILM/out/film.mp4 $FPS 0
```

- `mux.sh` 最后一位是颗粒：`0` 不加，`1` 加胶片颗粒。
- 内部做了两遍 `loudnorm` 到 −14 LUFS / TP −1.2。**不要跳过**——平台会二次压缩，原片响度不对就会忽大忽小。
- 2D 直绘的两种画风建议 `--workers 4`，内存吃得比像素风多。

---

## 七、自检：五类翻车点

```sh
"$LEMO_PY" scripts/selfcheck.py $FILM/out/film.mp4 \
  --shots $FILM/shots.json --lyrics $FILM/lyrics.json \
  --native 320x180 --end-card 258
```

| # | 症状 | 关键指标（像素风） | 一句话修法 |
|---|---|---|---|
| 1 | 像幻灯片 | 每镜变化像素中位数 < 0.02%；最长静止 > 1.2s | 先加画面内运动（蒸汽/落叶/秒针），别先加运镜 |
| 2 | 运镜晃 / 硬跳 | 镜内孤立跳变（等间隔的尤其可疑） | 慢摇砍掉；灯亮换 `dissolveDark()` |
| 3 | 表现力不够 | 副歌里的长句是否落在有脸的镜头上 | 副歌前给一个空镜蓄势，副歌第一句给近景 |
| 4 | 道具不对 | 道具首次出现是否早于歌词 1–2 秒 | 早出现、有归属、结局回收 |
| 5 | 歌词没演出来 | 每句歌词是否有镜头覆盖 | 调整 `SHOTS` 边界，或换动作 |

合格线参考（270 秒 / 31 镜的实测）：全局平均变化 2.997%，无 >1.2s 静止段，41/41 字幕可读。
详细阈值与 SRT 之外的混流检查：`references/checks.md`。

---

## 八、12 条必须拦住的坑

全是真踩过的，按"会不会毁掉整片"排序。

**会毁掉整片的（4 条）**

1. **`render` 里出现 `Math.random()` / `Date.now()`。** 6 个 worker 各自加载页面，随机结果不同 → 分段接缝处画面突变。全部换 `rnd(seed)`。纸艺和蜡笔的纹理生成尤其容易犯。
2. **跨帧累加状态（`x += v`）。** worker 从 t=90 开始时 `x` 还是初值。全部写成 `f(t)`。
3. **字幕只加底衬、不给字描边。** 压到亮地面/星空上就废了。`cnText(..., shadow=C.ink)` 四周补 1px。
4. **一句歌词跨两个镜头。** 观众看到字幕换镜，比看到画面换镜更出戏。

**会让画面变丑的（5 条）**

5. **发丝盖住脸。** 顺序必须是：头发墨线 → 头发实体 → 最后盖脸椭圆。刘海也在脸之后。
6. **台阶像钢琴键。** 一级三条线：踏面 / 棱线 / 立面阴影，一条色块画台阶必糊。
7. **中文 < 9px。** 8px 会糊成一团墨。`text.js` 在 8px 直接抛错、10px 警告一次。标题 11–14px，字幕 11–12px，英文可以 8px。
8. **渐隐用逐像素 hash。** 变成雪花噪点。用 `bayer(x, y) < ratio` 有序溶解。
9. **结束卡文字重叠。** 8–9px 的中文会并笔画。片尾用 11/10px，纵向拉开到 130/148。

**会白跑一趟的（3 条）**

10. **慢摇 1px 抖动。** 位移/时长 < 12px/s 一律砍掉，改静止 + 画面内运动。这是全片最常见的"看着不对劲但说不出哪里"。
11. **短画板摇出去露边。** 会被摇的 plate，背景画到画面外至少一个行程。
12. **`TEXTS` 把字幕底衬也报进去。** 自检会以为字被遮挡，一天都查不出问题。只报文字框。

---

## 九、文件地图

```
code-mv/
├─ SKILL.md                      ← 你在这里
├─ references/
│  ├─ skeleton.md                页面契约、镜头表、相机、字幕、构建命令
│  ├─ style-pixel.md             像素风：调色板、抖动、骨架、五类坑
│  ├─ style-paper.md             纸艺：纹理、撕边、纸片、手作感三条规则
│  ├─ style-crayon.md            蜡笔：crayon()、颗粒镂空、沸腾线
│  ├─ checks.md                  五类翻车点的指标、阈值、改法
│  └─ case-dengnixiake.md        《等你下课》31 镜样本 + 12 个坑的镜号
├─ assets/
│  ├─ core/    palette.js  render.js  text.js
│  ├─ lib/     wardrobe.js  props.js
│  ├─ world/   sky.js  scenes.js  plates.js
│  └─ templates/
│     ├─ pixel/   index.html  main.js  lyrics.js
│     ├─ paper/   index.html  paper.js
│     └─ crayon/  index.html  crayon.js
└─ scripts/
   ├─ find-lib.sh        探测 lemo-opuscar 仓库根（打印 LIB=）
   ├─ analyze_song.py    歌 → 时长/BPM/响度/段落/能量峰值
   ├─ make_lyrics.py     歌词 → lyrics.js + lyrics.json + lyrics.srt
   └─ selfcheck.py       成片 → 五类翻车点报告
```

### 开工前的最小动作

```sh
# 1) 找依赖
LIB=$(sh scripts/find-lib.sh | sed -n 's/^LIB=//p')

# 2) 建影片目录（三种画风都这么拷）
FILM=films/my-song
mkdir -p "$FILM"
cp -r assets/core assets/lib assets/world "$FILM"/
cp assets/templates/pixel/index.html assets/templates/pixel/main.js assets/templates/pixel/lyrics.js "$FILM"/

# 3) 改 main.js 里的 SHOTS，然后
node $LIB/core/render/still.mjs "$FILM" 2.0    # 先看一眼单帧
```

**先渲一帧，再渲全片。** 单帧 0.1 秒，全片 2 分钟——顺序反了就会拿着一个错构图渲 6480 帧。

### 什么时候不要用这个 skill

- 用户要"照片级写实""真人演出" → 这是生成式视频的活。
- 用户只要"一段 15 秒的循环动效" → 直接写一个 HTML，不需要 MV 流水线。
- 用户没给歌、也没说时长 → 先问清楚。没有时间轴就没有分镜，没有分镜就没有 MV。
