#!/usr/bin/env python3
"""
make_lyrics.py — 歌词时间轴 → lyrics.js / lyrics.json / lyrics.srt

用法：
    python scripts/make_lyrics.py lyrics.lrc --dur 270 --outdir films/xxx
    python scripts/make_lyrics.py lyrics.txt --dur 270 --outdir films/xxx
    python scripts/make_lyrics.py lyrics.lrc --merge      # 太挤的句子并到下一句

支持的输入：
    .lrc     [mm:ss.xx]文本         （标准 LRC，也认 [00:15.37] 这种）
    .txt     12.34 文本
             1:05.2 文本
             mm:ss.xx 文本

输出（都写到 --outdir）：
    lyrics.js    export const LYRICS = [[t0, t1, '文本'], ...]   ← 页面直接 import
    lyrics.json  {dur, cues:[{t0,t1,text,sec}]}                  ← 给脚本和自检用
    lyrics.srt   标准 SRT，可单独外挂

三条硬规则（都是踩过的坑）：
  1) 每句的下限 1.7 秒：低于这个值中文根本读不完，字幕会"闪一下就走"。
  2) 每句的上限 6.8 秒：再长观众会以为字幕卡住了。
  3) 一句最多 14 个汉字（11px 字号下约 154px，320 宽里还留得下边距）。
     超了就在 空格/逗号 处断成两句，而不是压缩成一行小字。
"""
import argparse
import io
import json
import re
import sys
from pathlib import Path

MIN_LEN = 1.7
MAX_LEN = 6.8
GAP = 0.18          # 上一句结束到下一句开始的空隙
MAX_HZ = 14


def parse_time(s):
    s = s.strip().replace("：", ":")
    m = re.match(r"^(?:(\d+):)?(\d+(?:\.\d+)?)$", s)
    if not m:
        return None
    if m.group(1) is None:
        return float(m.group(2))
    return int(m.group(1)) * 60 + float(m.group(2))


def read_lrc(text):
    out = []
    # [mm:ss.xx] 可能一行多个标签（一句多段），按出现顺序都收
    for line in text.splitlines():
        tags = re.findall(r"\[(\d+:\d+(?:\.\d+)?)\]", line)
        if not tags:
            continue
        body = re.sub(r"\[\d+:\d+(?:\.\d+)?\]", "", line).strip()
        if not body:
            continue
        for t in tags:
            out.append((parse_time(t), body))
    return out


def read_txt(text):
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        if len(parts) < 2:
            continue
        t = parse_time(parts[0])
        if t is None:
            continue
        out.append((t, parts[1].strip()))
    return out


def hz_count(s):
    return sum(1 for ch in s if "\u4e00" <= ch <= "\u9fff")


def split_long(text, limit=MAX_HZ):
    """按标点/空格把过长的句子断开，返回列表"""
    if hz_count(text) <= limit:
        return [text]
    parts = re.split(r"(?<=[，,、；;：:\s])", text)
    out, cur = [], ""
    for p in parts:
        if not p:
            continue
        if hz_count(cur + p) > limit and cur:
            out.append(cur.strip())
            cur = p
        else:
            cur += p
    if cur.strip():
        out.append(cur.strip())
    return out or [text]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("lyrics")
    ap.add_argument("--dur", type=float, required=True, help="歌曲总时长（秒）")
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--gap", type=float, default=GAP)
    ap.add_argument("--min-len", type=float, default=MIN_LEN)
    ap.add_argument("--max-len", type=float, default=MAX_LEN)
    ap.add_argument("--merge", action="store_true", help="读不完的短句并到下一句")
    ap.add_argument("--section", default="", help="段落标记，如 verse1（可空）")
    a = ap.parse_args()

    src = Path(a.lyrics)
    raw = src.read_text(encoding="utf-8", errors="replace")
    pairs = read_lrc(raw) if src.suffix.lower() == ".lrc" else read_txt(raw)
    if not pairs:
        sys.exit(f"没能从 {src} 里解析出任何一行。检查格式是不是 '[mm:ss.xx]文本' 或 '12.34 文本'。")
    pairs.sort(key=lambda p: p[0])

    # 长句先拆成多条同时刻的 cue 会打架，所以长句只做警示，不自动拆
    items = [(t, s) for t, s in pairs]

    # --merge：把"字符数 / 时长"过高的句子并到下一句
    if a.merge:
        merged = []
        i = 0
        while i < len(items):
            t, s = items[i]
            if i + 1 < len(items):
                span = items[i + 1][0] - t
                need = hz_count(s) / 4.2          # 中文约 4.2 字/秒算"读得完"
                if span < need and hz_count(items[i + 1][1]) + hz_count(s) <= MAX_HZ:
                    merged.append((t, s + " " + items[i + 1][1]))
                    i += 2
                    continue
            merged.append((t, s))
            i += 1
        items = merged

    cues = []
    for i, (t0, text) in enumerate(items):
        nxt = items[i + 1][0] if i + 1 < len(items) else min(a.dur - 0.2, t0 + a.max_len)
        t1 = nxt - a.gap
        t1 = max(t0 + a.min_len, min(t1, t0 + a.max_len))
        t1 = min(t1, a.dur)
        cues.append({"t0": round(t0, 2), "t1": round(t1, 2), "text": text, "sec": a.section})

    # —— 可读性体检 ——
    warn = 0
    for c in cues:
        span = c["t1"] - c["t0"]
        n = len(c["text"].replace(" ", ""))
        cps = n / span if span > 0 else 99
        flags = []
        if span < 1.2:
            flags.append(f"只停留 {span:.1f}s")
        if cps > 7.0:
            flags.append(f"{cps:.1f} 字/秒（建议 ≤6）")
        if hz_count(c["text"]) > MAX_HZ:
            flags.append(f"{hz_count(c['text'])} 汉字（建议拆句）")
        if flags:
            warn += 1
            print(f"  ! {c['t0']:6.2f}s  {c['text']}  —— " + "；".join(flags), file=sys.stderr)

    outdir = Path(a.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    # lyrics.js —— 页面只能同步拿数据，所以必须是 JS 模块而不是 fetch json
    js = ["// 由 make_lyrics.py 生成，别手改。格式：[起, 止, 文本]", "export const LYRICS = ["]
    for c in cues:
        js.append(f"  [{c['t0']}, {c['t1']}, {json.dumps(c['text'], ensure_ascii=False)}],")
    js.append("];")
    (outdir / "lyrics.js").write_text("\n".join(js) + "\n", encoding="utf-8")

    (outdir / "lyrics.json").write_text(
        json.dumps({"dur": a.dur, "cues": cues}, ensure_ascii=False, indent=1), encoding="utf-8")

    def ts(s):
        h = int(s // 3600); m = int(s % 3600 // 60); sec = s % 60
        return f"{h:02d}:{m:02d}:{sec:06.3f}".replace(".", ",")

    with io.open(outdir / "lyrics.srt", "w", encoding="utf-8") as f:
        for i, c in enumerate(cues, 1):
            f.write(f"{i}\n{ts(c['t0'])} --> {ts(c['t1'])}\n{c['text']}\n\n")

    print(f"{len(cues)} 句，最后一句结束于 {cues[-1]['t1']:.2f}s（总长 {a.dur:.1f}s）")
    if warn:
        print(f"有 {warn} 句需要检查（见上面警告）。")
    print(f"已写 {outdir}/lyrics.js, lyrics.json, lyrics.srt")


if __name__ == "__main__":
    main()
