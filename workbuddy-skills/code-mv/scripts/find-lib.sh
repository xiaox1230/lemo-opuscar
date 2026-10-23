#!/bin/sh
# find-lib.sh — 找到 lemo-opuscar 仓库根（渲染管线在里面），打印 LIB=<绝对路径>
#
# 用法：
#   sh scripts/find-lib.sh                    # 探测并打印 LIB=<绝对路径>
#   sh scripts/find-lib.sh /path/to/repo      # 直接指定
#   LIB=$(sh scripts/find-lib.sh | sed -n 's/^LIB=//p')   # 在脚本里取用
#
# 为什么不在 skill 里打包一份渲染管线：
#   core/render/*.mjs 要 import playwright-core 和 @ffmpeg-installer，
#   这两个包按 node_modules 解析，搬到别处就 404。所以只探测、不复制。

ok() { [ -f "$1/core/render/video.mjs" ] && [ -f "$1/core/render/mux.sh" ]; }

# 1) 命令行显式指定
if [ -n "$1" ]; then
  if ok "$1"; then LIB=$(cd "$1" && pwd); else
    echo "找不到渲染管线：$1/core/render/video.mjs" >&2; exit 1
  fi
fi

# 2) 环境变量
if [ -z "$LIB" ] && [ -n "$LEMO_LIB" ] && ok "$LEMO_LIB"; then
  LIB=$(cd "$LEMO_LIB" && pwd)
fi

# 3) 从当前目录逐级向上找（在影片目录里跑时最常用）
if [ -z "$LIB" ]; then
  d=$(pwd)
  while [ "$d" != "/" ] && [ "$d" != "" ]; do
    if ok "$d"; then LIB=$d; break; fi
    d=$(dirname "$d")
  done
fi

# 4) 常见位置
if [ -z "$LIB" ]; then
  for c in "$HOME/lemo-opuscar" "$HOME/opuscar" "$HOME/src/lemo-opuscar" \
           "$HOME/projects/lemo-opuscar" "$HOME/Documents/lemo-opuscar" \
           "$HOME/Desktop/lemo-opuscar" "/c/ai代码动画" "/d/ai代码动画"; do
    if ok "$c"; then LIB=$(cd "$c" && pwd); break; fi
  done
fi

# 5) 一层目录扫描（$HOME/*/lemo-opuscar）
if [ -z "$LIB" ]; then
  for c in "$HOME"/*/lemo-opuscar "$HOME"/*/*/lemo-opuscar; do
    if ok "$c"; then LIB=$(cd "$c" && pwd); break; fi
  done
fi

if [ -z "$LIB" ]; then
  cat >&2 <<'EOF'
[code-mv] 没找到 lemo-opuscar 仓库（需要 core/render/video.mjs）。

  装法：
    git clone https://github.com/xiaox1230/lemo-opuscar
    cd lemo-opuscar && npm install
    # Windows 还要装 ffmpeg（或用 npm i @ffmpeg-installer/ffmpeg 后加进 PATH）

  然后任选一种让本脚本认识它：
    export LEMO_LIB=/绝对路径/lemo-opuscar
    sh scripts/find-lib.sh /绝对路径/lemo-opuscar
    # 或者 cd 进仓库里再跑
EOF
  exit 1
fi

LIB=$(cd "$LIB" && pwd)
echo "LIB=$LIB"

# 顺手体检：缺什么现在说，别等渲染到一半才报错
miss=""
command -v node >/dev/null 2>&1 || miss="$miss node"
command -v ffmpeg >/dev/null 2>&1 || { [ -x "$LIB/.tools/ffmpeg/bin/ffmpeg" ] || miss="$miss ffmpeg"; }
[ -d "$LIB/node_modules/playwright-core" ] || miss="$miss playwright-core"

if [ -n "$miss" ]; then
  echo "[code-mv] 缺少:$miss" >&2
  echo "          node/npm 装好后在仓库根跑 npm install；ffmpeg 可装系统版或放进 .tools/ffmpeg/bin" >&2
  exit 2
fi

echo "OK: node $(node -v), ffmpeg 就位, playwright-core 就位"
