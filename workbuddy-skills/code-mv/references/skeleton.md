# 共用骨架：页面契约、镜头表、相机、字幕

三种画风共用同一套"壳"。画风只决定 `plate()` 里怎么画，壳负责**可确定性重渲**。
先把壳写对，再谈画风；壳错了，画风再好看也导不出来。

## 一、页面契约（渲染器只认这四个全局）

```js
window.READY = true;                 // 模块 + 字体都就绪
window.DUR   = 270;                  // 秒
window.render = (t) => [...texts];   // 画第 t 秒
window.TEXTS  = (t) => [...texts];   // 这一刻屏幕上有哪些文字
```

`render(t)` 必须是**纯函数**：同一个 `t` 调一百次，画面必须一模一样。

禁止出现在 `render` 里的东西：

| 不能有 | 为什么 | 改成 |
|---|---|---|
| `Math.random()` | 6 个 worker 各自加载页面，随机结果不同 → 分段接缝处画面突变 | `rnd(seed)`，`seed = t * 1000 + k` |
| `Date.now()` / `performance.now()` | 同上，且第 2 遍渲染会变 | 只用传入的 `t` |
| 跨帧累加的状态（`x += v`） | worker 从 t=90 开始渲染时，`x` 还是初始值 | 全部写成 `f(t)` 的闭式表达 |
| `fetch` / `import()` 动态加载 | 抓帧时不等待，直接拿到 undefined | 数据在模块顶层 import 成静态 JS |

`TEXTS(t)` 的每一项：
```js
{ s: '文本', x: 120, y: 157, w: 80, h: 16 }   // 像素风用逻辑坐标，2D 风用画布像素
```
**只报真正的文字**。把字幕底衬、标题框这类色块也报进去，自检会以为字被遮挡，永远查不出问题。

## 二、把 assets 拷进影片目录

渲染器以**影片目录**为根找 `index.html`，所以影片目录里必须有 `core/ lib/ world/`：

```sh
FILM=films/my-song
mkdir -p "$FILM"
cp -r <skill>/assets/core <skill>/assets/lib <skill>/assets/world "$FILM"/
cp <skill>/assets/templates/pixel/*.js "$FILM"/          # 选像素风
cp <skill>/assets/templates/pixel/index.html "$FILM"/
# 纸艺/蜡笔：只拷那个风格的 index.html + 主 js，不需要 core/lib/world
```

目录结构长这样：

```
films/my-song/
├─ index.html          画布 + <script type="module" src="./main.js">
├─ main.js             SHOTS 表 + plate 调度 + 字幕
├─ lyrics.js           make_lyrics.py 生成
├─ song.mp3
├─ core/               palette.js render.js text.js
├─ lib/                wardrobe.js props.js
└─ world/              sky.js scenes.js plates.js
```

## 三、镜头表：一句歌词一镜

```js
const SHOTS = [
  { t0: 15.37, t1: 22.50, plate: 'alley',    cam: [0, 0] },
  { t0: 22.62, t1: 28.50, plate: 'room',     cam: [0, -40] },
  { t0: 28.50, t1: 35.57, plate: 'classroom',cam: [0, 0] },
];
```

- `t0/t1` **直接抄 `lyrics.js` 的时间**，不要自己重新估算。歌词是唯一的时间真相。
- 一个镜头对应一到三句歌词都行；但**不要**一句歌词跨两个镜头（观众会看到字幕换镜）。
- `shots.json` 是给 `selfcheck.py` 用的同一张表：
  ```json
  [{"n":1,"t0":0,"t1":15.3},{"n":2,"t0":15.37,"t1":22.5}]
  ```
  两处要同步。写个 20 行的脚本从 `lyrics.js` 生成 `shots.json` 更省事。

镜长怎么定：
1. 跑 `analyze_song.py`，看 `sections[]`。副歌（`loud`）里镜长 3–5 秒，主歌 5–7 秒，间奏可以放 20 秒以上的"三个空镜"。
2. 相邻镜之间必须有**因果**：上一镜的某个东西（蒸汽、伞面、柱子、耳机线、信纸的白）在新镜里继续出现。没有因果的相邻镜就是"幻灯片"。
3. 每 5–8 个镜头换一次景别（大全→近景→中景），否则节奏平。

## 四、相机

```js
const camX = Math.round(lerp(s.cam[0], s.cam[1], ss(u)));   // u = (t-t0)/(t1-t0)
const p = new Pan(fb, camX, 0);
PLATES[s.plate](p, t, lt);      // plate 里照常写绝对坐标，Pan 负责加偏移
```

规律（320×180 像素画布）：
- **位移 / 时长 < 12px/s 就不要动。** 4px/s 的平移等于每 6 帧跳一格，肉眼看是"卡"。这个速度下宁可静止，改用画面内的东西动（蒸汽、落叶、人潮、笔尖、秒针）。
- 想慢，就**改景别**（推近 1.15 倍靠 plate 重画），不要靠平移凑。
- 会被摇的 plate，背景要画到画面外：`sky(p, {x0:-240, x1:560})`、`ground(p, y0, y1, {x0:-240, x1:560})`。露边的症状是某一帧画面边缘出现一条纯色竖条。

## 五、字幕层

```js
const SUB = { y: 148, h: 32, size: 11, weight: 500 };

function drawSubtitle(p, t) {
  const line = currentLine(t);                       // 从 LYRICS 里查
  if (!line) return null;
  const k = clamp((t - line.a) / .5) * clamp((line.b - t) / .5);   // 两头淡入淡出
  if (k <= 0.02) return null;
  for (let j = SUB.y; j < SUB.y + SUB.h; j++)
    for (let x = 0; x < p.w; x++)
      if (bayer(x, j) < .45 * k) p.px(x, j, C.ink);   // 45% 抖动暗底
  cnTextCenter(p, line.s, p.w / 2, SUB.y + 8, C.paper, SUB.size, SUB.weight, C.ink);
  return { s: line.s, ... };
}
```

- 字幕**画在帧缓冲里**，不叠 DOM。叠 DOM 的话放到 1920 时字体是平滑的，跟像素画面不是一套。
- 可读性靠**字的 1px 四周描边**（`cnText` 的 `shadow` 参数），底衬只是辅助。只有底衬没有描边的字幕，压到亮地面上就废了。
- 底衬用**抖动**（45%），不要铺实心黑条。实心条会让整支 MV 像在画面下面贴了块黑板。
- 底部 32px 是字幕区，构图时不要往这里放东西。人、物、手的下缘都要在 y ≤ 148 之上，或者只露出"下缘"这个事实（躺着的后脑、画面的下边框）。

## 六、片头片尾

```js
function drawTitle(p, t) {
  if (t < 0.4 || t > 5.2) return null;
  const k = seg(t, .4, 1.4) * (1 - seg(t, 4.2, 5.2));
  for (let j = 56; j < 116; j++) for (let x = 32; x < 288; x++)
    if (bayer(x, j) < .62 * k) p.px(x, j, C.ink);          // 抖动底
  cnTextCenter(p, '歌名', p.w / 2, 66, C.gold, 22, 700, C.ink);
  return { s: '歌名', ... };
}
```
- 片名 22px / 700 是 320×180 里的上限，再大就超出画面宽度。
- 片尾卡**允许静止**（它是署名，不是镜头），在 `selfcheck.py` 里用 `--end-card` 把它排除。
- 片尾字要用 11px / 10px，**不要**用 8–9px：CJK 在 9px 时笔画会并成一块墨。

## 七、构建：一条命令出片

```sh
FILM=films/my-song
FPS=24; WK=6
"$LEMO_PY" scripts/make_lyrics.py lyrics.lrc --dur 270 --outdir $FILM
node $LIB/core/render/video.mjs $FILM --fps $FPS --workers $WK --out $FILM/out/video.mp4
ffmpeg -y -v error -i $FILM/song.mp3 -t 270 -ar 48000 -ac 2 -c:a pcm_s16le $FILM/out/mix.wav
sh $LIB/core/render/mux.sh $FILM/out/video.mp4 $FILM/out/mix.wav $FILM/out/film.mp4 $FPS 0
```

`mux.sh` 最后那个 `0` 是"不加颗粒"。要胶片颗粒感传 `1`。

- 24fps × 270s = 6480 帧。6 worker 大约 2 分钟（像素风），纸艺/蜡笔因为每帧重绘 Canvas 会慢 3–5 倍，建议 `--workers 4` 并把 `DUR` 的 FPS 降到 24 但每帧内部按 10/12fps 步进（见两种 2D 风的文档）。
- 混流阶段做两遍 `loudnorm` 到 −14 LUFS / TP −1.2，这是短视频平台的标准响度。不做的话上传后会被压得忽大忽小。

## 八、自检

```sh
"$LEMO_PY" scripts/selfcheck.py $FILM/out/film.mp4 \
  --shots $FILM/shots.json --lyrics $FILM/lyrics.json \
  --native 320x180 --end-card 258
```

五项与阈值见 `checks.md`。
