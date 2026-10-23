#!/usr/bin/env python3
"""
analyze_song.py — 把一首歌量成可以直接分镜的数字

用法：
    python scripts/analyze_song.py song.mp3                 # 打印摘要 + 写 song.analysis.json
    python scripts/analyze_song.py song.mp3 -o /tmp/a.json
    python scripts/analyze_song.py song.mp3 --quiet         # 只写文件不打印

输出字段（analysis.json）：
    dur          总时长（秒）
    lufs         整曲响度（EBU R128）
    bpm / beat0  估计速度与第一个强拍的位置
    rms[]        每 0.1 秒的 RMS（0..1），拿来画"能量曲线"决定副歌在哪
    sections[]   按能量自动切的段落 {t0,t1,kind:'quiet'|'build'|'loud'}
    peaks[]      能量最高的若干个瞬间（"该给近景/特写"的位置）
    silence[]    静音段（片头片尾留白）

为什么要跑这一步：
    分镜的时长不是拍脑袋定的，是歌词时间轴减出来的；而"哪句该给大景、哪句该给特写"
    取决于这一段的能量。先把歌量清楚，后面 30 个镜头的长短和景别就不用反复试。

依赖：numpy（缺失时会退化成纯 Python，慢但能跑）、ffmpeg
"""
import argparse
import array
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

SR = 22050          # 分析采样率，够用且快
HOP = 0.10          # RMS 帧长（秒）

try:
    import numpy as np
    HAVE_NP = True
except Exception:
    HAVE_NP = False


def ffmpeg_bin():
    for c in ("ffmpeg",):
        if shutil.which(c):
            return c
    # 有些仓库把 ffmpeg 放在 .tools 里
    for c in (Path.cwd() / ".tools/ffmpeg/bin/ffmpeg.exe", Path.cwd() / ".tools/ffmpeg/bin/ffmpeg"):
        if c.exists():
            return str(c)
    sys.exit("找不到 ffmpeg。装一个，或把它的 bin 目录加进 PATH。")


def decode(path):
    """解码成 16bit 单声道 PCM，直接从 stdout 读，不落盘"""
    p = subprocess.run(
        [ffmpeg_bin(), "-v", "error", "-i", str(path),
         "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
        capture_output=True, check=True)
    raw = p.stdout
    if HAVE_NP:
        return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    a = array.array("h")
    a.frombytes(raw)
    return [v / 32768.0 for v in a]


def loudness(path):
    """EBU R128 整曲响度"""
    try:
        p = subprocess.run(
            [ffmpeg_bin(), "-v", "info", "-i", str(path),
             "-filter_complex", "ebur128=peak=true", "-f", "null", "-"],
            capture_output=True, text=True)
        for line in reversed((p.stderr or "").splitlines()):
            if "I:" in line and "LUFS" in line:
                return float(line.split("I:")[1].split("LUFS")[0].strip())
    except Exception:
        pass
    return None


def rms_curve(x, hop_s=HOP):
    hop = max(1, int(SR * hop_s))
    n = len(x) // hop
    if HAVE_NP:
        y = x[:n * hop].reshape(n, hop)
        return np.sqrt((y * y).mean(axis=1)).tolist()
    out = []
    for i in range(n):
        s = 0.0
        blk = x[i * hop:(i + 1) * hop]
        for v in blk:
            s += v * v
        out.append(math.sqrt(s / hop))
    return out


def estimate_tempo(rms, hop_s=HOP):
    """
    在 RMS 的"上升量"上做自相关。比直接对波形做 FFT 稳，
    因为这首歌有人声、有混响，波形周期性很差，但"每小节一次重击"很清楚。
    """
    onset = [max(0.0, rms[i] - rms[i - 1]) for i in range(1, len(rms))]
    if len(onset) < 40:
        return None, None
    mean = sum(onset) / len(onset)
    o = [v - mean for v in onset]

    best = (0.0, 0)
    lo, hi = int(0.30 / hop_s), int(1.30 / hop_s)      # 50..200 BPM
    for lag in range(lo, min(hi, len(o) // 2)):
        s = 0.0
        for i in range(len(o) - lag):
            s += o[i] * o[i + lag]
        if s > best[0]:
            best = (s, lag)
    if not best[1]:
        return None, None
    bpm = 60.0 / (best[1] * hop_s)
    while bpm < 70:
        bpm *= 2
    while bpm > 180:
        bpm /= 2
    # 第一个强拍：跳过前 2 秒（很多歌开头就有音），找第一个明显的起音
    thr = mean * 1.8
    beat0 = next((i * hop_s for i, v in enumerate(onset) if i * hop_s > 2.0 and v > thr), 0.0)
    return round(bpm, 1), round(beat0, 2)


def auto_sections(rms, hop_s=HOP, min_s=3.0):
    """
    按能量切成 quiet / build / loud。
    做法：逐帧打标签 → 游程编码 → 把过短的段并进前一段 → 合并同类相邻段。
    不要"边扫边 append"：一旦某个段太短被跳过，那段区间就没人认领，段落表会留下空洞。
    """
    if len(rms) < 20:
        return []
    win = 12                                  # 1.2 秒平滑
    sm = []
    for i in range(len(rms)):
        a = max(0, i - win // 2)
        b = min(len(rms), i + win // 2 + 1)
        sm.append(sum(rms[a:b]) / (b - a))
    top = max(sm) or 1.0
    rel = [v / top for v in sm]

    def label(v):
        return "loud" if v > .62 else ("build" if v > .28 else "quiet")

    # 1) 游程编码
    runs, cur, start = [], label(rel[0]), 0
    for i in range(1, len(rel)):
        k = label(rel[i])
        if k != cur:
            runs.append({"t0": start * hop_s, "t1": i * hop_s, "kind": cur})
            cur, start = k, i
    runs.append({"t0": start * hop_s, "t1": len(rel) * hop_s, "kind": cur})

    # 2) 过短的段并进前一段（第一段则并进后一段）
    fixed = []
    for r in runs:
        if r["t1"] - r["t0"] < min_s and fixed:
            fixed[-1]["t1"] = r["t1"]
        else:
            fixed.append(dict(r))
    if len(fixed) > 1 and fixed[0]["t1"] - fixed[0]["t0"] < min_s:
        fixed[1]["t0"] = fixed[0]["t0"]
        fixed.pop(0)

    # 3) 合并同类相邻
    merged = []
    for r in fixed:
        if merged and merged[-1]["kind"] == r["kind"]:
            merged[-1]["t1"] = r["t1"]
        else:
            merged.append(dict(r))

    return [{"t0": round(r["t0"], 1), "t1": round(r["t1"], 1), "kind": r["kind"]} for r in merged]


def find_silence(rms, hop_s=HOP, thr=0.006, min_s=0.6):
    out, run = [], 0
    for i, v in enumerate(rms):
        if v < thr:
            run += 1
        else:
            if run * hop_s >= min_s:
                out.append({"t0": round((i - run) * hop_s, 1), "t1": round(i * hop_s, 1)})
            run = 0
    if run * hop_s >= min_s:
        out.append({"t0": round((len(rms) - run) * hop_s, 1), "t1": round(len(rms) * hop_s, 1)})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("-o", "--out", default=None)
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args()

    src = Path(a.audio)
    if not src.exists():
        sys.exit(f"没有这个文件：{src}")

    x = decode(src)
    hop = HOP
    dur = len(x) / SR
    rms = rms_curve(x, hop)
    bpm, beat0 = estimate_tempo(rms, hop)
    secs = auto_sections(rms, hop)
    sil = find_silence(rms, hop)

    # 能量峰值：取前 8 个局部极大，彼此至少隔 4 秒
    idx = sorted(range(len(rms)), key=lambda i: -rms[i])
    peaks = []
    for i in idx:
        t = i * hop
        if all(abs(t - p) > 4.0 for p in peaks):
            peaks.append(round(t, 1))
        if len(peaks) >= 8:
            break
    peaks.sort()

    data = {
        "file": src.name,
        "dur": round(dur, 3),
        "sr": SR,
        "lufs": loudness(src),
        "bpm": bpm,
        "beat0": beat0,
        "rms": [round(v, 4) for v in rms],
        "sections": secs,
        "peaks": peaks,
        "silence": sil,
    }
    out = Path(a.out) if a.out else src.with_suffix(".analysis.json")
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    if a.quiet:
        return
    print(f"文件      {src.name}")
    print(f"时长      {dur:.2f}s")
    print(f"响度      {data['lufs'] if data['lufs'] is not None else 'n/a'} LUFS")
    print(f"速度      {bpm} BPM   第一个强拍 {beat0}s")
    print(f"静音段    {len(sil)} 段")
    print("\n段落（能量）：")
    for s in secs:
        bar = "#" * max(1, int((s["t1"] - s["t0"]) / 4))
        print(f"  {s['t0']:7.1f} - {s['t1']:7.1f}  {s['kind']:6s} {bar}")
    print("\n能量峰值（该给近景的位置）：" + ", ".join(f"{t:.0f}s" for t in peaks))
    print(f"\n已写 {out}")
    print("下一步：把歌词按 4–7 秒一句切好，跑 scripts/make_lyrics.py")


if __name__ == "__main__":
    main()
