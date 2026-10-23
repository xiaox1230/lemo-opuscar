#!/usr/bin/env python3
"""
selfcheck.py — 把成片拉回来量一遍，五项常见毛病逐条打分

用法：
    python scripts/selfcheck.py out/film.mp4 --shots film/shots.json --lyrics film/lyrics.json
    python scripts/selfcheck.py out/film.mp4 --shots film/shots.json --native 320x180
    python scripts/selfcheck.py out/film.mp4          # 没有 shots.json 就只做 2/5 两项

检查项：
  1) 像幻灯片   每镜"每秒改变像素占比"的中位数 + 最长完全静止秒数
  2) 硬跳/闪    孤立跳变：某帧差值远大于前后两帧
  3) 表现力     长句（多半是副歌）是否落在有人物的镜头上
  4) 道具       道具出镜时间轴（给 --props 时检查是否与分镜一致）
  5) 歌词没演出来  每句歌词落到哪个镜头、那一镜有没有人物

阈值都可以从命令行改。默认值是这支片子调出来的，不是普适真理：
    像素 320×180 的整数坐标画面，1.2s 不动 = 观众能察觉的"卡住"；
    1080p 手绘风因为线条一直在抖，静止判定要放宽到 0.02% 以下才算。
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

try:
    import numpy as np
except Exception:
    sys.exit("需要 numpy：pip install numpy")


def load_shots(path, cues=None):
    if path:
        p = Path(path)
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    if cues:
        # 没有分镜表就退化成"一句歌词一镜"
        return [{"n": i + 1, "t0": c["t0"], "t1": c["t1"], "note": c["text"]} for i, c in enumerate(cues)]
    return []


def sample_frames(mp4, fps, w, h):
    p = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(mp4),
         "-vf", f"fps={fps},scale={w}:{h},format=gray",
         "-f", "rawvideo", "-"],
        capture_output=True, check=True)
    buf = np.frombuffer(p.stdout, dtype=np.uint8)
    n = len(buf) // (w * h)
    if n == 0:
        sys.exit("抽不到帧，检查 mp4 路径与 ffmpeg。")
    return buf[:n * w * h].reshape(n, h, w).astype(np.int16)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mp4")
    ap.add_argument("--shots", default=None, help="shots.json")
    ap.add_argument("--lyrics", default=None, help="lyrics.json")
    ap.add_argument("--fps", type=float, default=12.0, help="抽样帧率（不抽满帧，否则慢 10 倍）")
    ap.add_argument("--native", default="480x270", help="分析分辨率 WxH")
    ap.add_argument("--diff", type=int, default=6, help="差值超过它才算像素变了（抗抖动噪声）")
    ap.add_argument("--pop-diff", type=int, default=40, help="判硬跳用的单像素阈值，要比 --diff 高得多")
    ap.add_argument("--still", type=float, default=1.2, help="静止超过这么多秒判为幻灯片")
    ap.add_argument("--still-eps", type=float, default=0.02, help="变化像素低于这个百分比算静止")
    ap.add_argument("--end-card", type=float, default=-1.0, help="片尾静止卡起点，这一镜允许静止")
    ap.add_argument("--props", default=None, help='道具时间轴 JSON：{"信":[80.9,87.3],...}')
    a = ap.parse_args()

    w, h = (int(v) for v in a.native.lower().split("x"))
    mp4 = Path(a.mp4)
    if not mp4.exists():
        sys.exit(f"没有这个文件：{mp4}")

    cues = []
    if a.lyrics and Path(a.lyrics).exists():
        cues = json.loads(Path(a.lyrics).read_text(encoding="utf-8")).get("cues", [])
    shots = load_shots(a.shots, cues)

    arr = sample_frames(mp4, a.fps, w, h)
    N = w * h
    d = np.abs(np.diff(arr, axis=0))
    changed = (d > a.diff).sum(axis=(1, 2)) / N * 100.0
    # 跳变检测单独用更高的单像素阈值：
    # 1px 的位移会让整屏的纹理"变了一点"，面积很大但每个像素只变十几级；
    # 真正的硬跳（灯开、闪白、颜色突变）是少数像素变几十级。用面积判会全是误报。
    changed2 = (d > a.pop_diff).sum(axis=(1, 2)) / N * 100.0
    times = np.arange(len(changed)) / a.fps

    print(f"抽样 {a.fps:g}fps  {len(arr)} 帧  {len(arr) / a.fps:.1f}s  分析分辨率 {w}x{h}")
    print(f"全片平均变化像素 {changed.mean():.3f}%")

    bad_still = 0
    if shots:
        print("\n—— 1) 像幻灯片 ——")
        print("   镜  区间              变化中位数   最长静止")
        for s in shots:
            m = (times >= s["t0"]) & (times < s["t1"] - 1.0 / a.fps)
            if m.sum() < 4:
                continue
            d = changed[m]
            med = float(np.median(d))
            run = best = 0.0
            for v in d:
                if v < a.still_eps:
                    run += 1.0 / a.fps
                    best = max(best, run)
                else:
                    run = 0.0
            allow = a.end_card >= 0 and s["t1"] > a.end_card
            flag = ""
            if best > a.still:
                if allow:
                    flag = "  （片尾卡，允许）"
                else:
                    flag = "  ← 静止过久"
                    bad_still += 1
            print(f"  {s['n']:02d}  {s['t0']:6.1f}-{s['t1']:6.1f}   {med:7.3f}%     {best:4.1f}s{flag}")
        print("  全部通过：没有超过 %.1fs 的完全静止段" % a.still if not bad_still
              else f"  不合格 {bad_still} 镜")

    print("\n—— 2) 孤立跳变（一帧硬跳，看起来像抖或闪）——")
    # 镜头边界本来就该是硬切，把它们排除掉，剩下的才是真问题
    cuts = [s["t0"] for s in shots] + [s["t1"] for s in shots]

    def near_cut(t, tol=0.25):
        return any(abs(t - c) < tol for c in cuts)

    hits, skipped = [], 0
    for i in range(1, len(changed2) - 1):
        nb = max(changed2[i - 1], changed2[i + 1])
        if not (changed2[i] > max(1.0, nb * 4) and changed2[i] > 3.0):
            continue
        if cuts and near_cut(times[i]):
            skipped += 1
            continue
        hits.append((float(times[i]), float(changed2[i])))

    # 等间隔的重复跳变 = 循环元素在重置（雨、落叶、粒子），一句话说清楚就行，
    # 一条条列出来只会把真正的问题淹掉。
    groups, cur = [], []
    for h in hits:
        if cur:
            gap = h[0] - cur[-1][0]
            gaps = sorted(cur[i + 1][0] - cur[i][0] for i in range(len(cur) - 1))
            typical = gaps[len(gaps) // 2] if gaps else gap
            same_rhythm = abs(gap - typical) <= max(0.15, typical * 0.6)
            if gap < 8.0 and (len(cur) < 2 or same_rhythm):
                cur.append(h)
                continue
        if cur:
            groups.append(cur)
        cur = [h]
    if cur:
        groups.append(cur)

    pops = 0
    periodic = 0
    for g in groups:
        if len(g) >= 4:
            gaps = sorted(g[i + 1][0] - g[i][0] for i in range(len(g) - 1))
            period = gaps[len(gaps) // 2]
            print(f"  {g[0][0]:6.2f}-{g[-1][0]:6.2f}s  等间隔跳变 {len(g)} 次，每 ~{period:.2f}s 一次  [周期]")
            pops += 1
            periodic += 1
        else:
            for t, v in g:
                print(f"  {t:6.2f}s  diff={v:5.2f}%")
                pops += 1
    if pops == 0:
        print("  无（镜内没有一次硬跳）")
    if periodic:
        print("  [周期] 的三种常见原因：循环粒子重置（相位 1→0 硬接）、慢速平移的 1px 步进、周期性闪烁。")
        print("         前两种把速度提到 >12px/s 或干脆不动；第三种改用 fb.dissolveDark() 过渡。")
    if pops == 0:
        print("  无（镜内没有一次硬跳）")
    if skipped:
        print(f"  （另有 {skipped} 处在镜头边界上，属于正常切镜，已忽略）")

    if cues and shots:
        print("\n—— 3) 长句是否落在有戏的镜头上 ——")
        for c in cues:
            n_hz = sum(1 for ch in c["text"] if "\u4e00" <= ch <= "\u9fff")
            if n_hz < 10:
                continue
            s = next((x for x in shots if x["t0"] - 0.2 <= c["t0"] < x["t1"]), None)
            if s:
                print(f"  {c['t0']:6.2f}s  镜{s['n']:02d}  {c['text']}")

    if a.props and Path(a.props).exists():
        print("\n—— 4) 道具出镜 ——")
        for k, ts in json.loads(Path(a.props).read_text(encoding="utf-8")).items():
            print(f"  {k}: " + ", ".join(f"{t:.1f}s" for t in ts))

    if cues and shots:
        print("\n—— 5) 歌词 → 镜头 ——")
        miss = []
        for c in cues:
            s = next((x for x in shots if x["t0"] - 0.2 <= c["t0"] < x["t1"]), None)
            if not s:
                miss.append(c)
                print(f"  {c['t0']:6.2f}  无对应镜头  {c['text']}")
            else:
                print(f"  {c['t0']:6.2f}  镜{s['n']:02d}  {c['text']}")
        if miss:
            print(f"  ! {len(miss)} 句歌词没有镜头覆盖 —— 分镜表的 t0/t1 有洞")

    print("\n结论：", end="")
    problems = bad_still + pops + (0 if not cues else 0)
    print("可以直接发" if problems == 0 else f"{problems} 处需要回看（见上）")


if __name__ == "__main__":
    main()
