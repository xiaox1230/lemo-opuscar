#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/xiaox1230/lemo-opuscar.git"
CLONE=false
VOICE=false
MUSIC=false
LAUNCH=true

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo) REPO=${2:?missing repository URL}; shift 2 ;;
    --clone) CLONE=true; shift ;;
    --voice) VOICE=true; shift ;;
    --music) MUSIC=true; shift ;;
    --no-launch) LAUNCH=false; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }

command -v apt-get >/dev/null 2>&1 || die "This installer supports Ubuntu/Debian WSL distributions."
say "Installing WSL system packages"
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl ffmpeg git python3 python3-venv xz-utils

mkdir -p "$HOME/.local/bin" "$HOME/.local/opt"
export PATH="$HOME/.local/opt/node-v22/bin:$HOME/.local/bin:$PATH"

node_major=0
if command -v node >/dev/null 2>&1; then
  node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || printf 0)
fi
if [ "$node_major" -lt 20 ]; then
  say "Installing the current Node.js 22 LTS binary"
  case "$(uname -m)" in
    x86_64) node_arch=x64 ;;
    aarch64|arm64) node_arch=arm64 ;;
    *) die "Unsupported CPU architecture: $(uname -m)" ;;
  esac
  node_base=https://nodejs.org/dist/latest-v22.x
  sums=$(mktemp)
  curl -fsSL "$node_base/SHASUMS256.txt" -o "$sums"
  archive=$(awk -v arch="$node_arch" '$2 ~ ("node-v.*-linux-" arch "\\.tar\\.xz$") { print $2; exit }' "$sums")
  [ -n "$archive" ] || die "Could not identify the Node.js download."
  curl -fsSL "$node_base/$archive" -o "/tmp/$archive"
  expected=$(awk -v file="$archive" '$2 == file { print $1 }' "$sums")
  printf '%s  %s\n' "$expected" "/tmp/$archive" | sha256sum -c -
  rm -rf "$HOME/.local/opt/node-v22"
  mkdir -p "$HOME/.local/opt/node-v22"
  tar -xJf "/tmp/$archive" --strip-components=1 -C "$HOME/.local/opt/node-v22"
  rm -f "$sums" "/tmp/$archive"
fi

if ! command -v uv >/dev/null 2>&1 && ! python3 -c 'import sys; raise SystemExit(sys.version_info < (3, 11))' 2>/dev/null; then
  say "Installing uv so the project can provision Python 3.12"
  uv_env=$(mktemp -d)
  python3 -m venv "$uv_env"
  "$uv_env/bin/pip" install --quiet uv
  cp "$uv_env/bin/uv" "$uv_env/bin/uvx" "$HOME/.local/bin/"
  rm -rf "$uv_env"
fi

if $CLONE; then
  LIB=${LEMO_OPUSCAR_HOME:-$HOME/lemo-opuscar}
  if [ -d "$LIB/.git" ]; then
    say "Updating $LIB"
    git -C "$LIB" pull --ff-only
  elif [ -e "$LIB" ]; then
    die "$LIB already exists and is not a Git repository. Set LEMO_OPUSCAR_HOME to another path."
  else
    say "Cloning $REPO"
    git clone "$REPO" "$LIB"
  fi
else
  script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  LIB=$(cd "$script_dir/.." && pwd)
fi

say "Installing Lemo-Opuscar dependencies"
tiers=()
$VOICE && tiers+=(voice)
$MUSIC && tiers+=(music)
LEMO_OPUSCAR_HOME="$LIB" bash "$LIB/plugin/skills/lemo-opuscar/scripts/setup.sh" deps "${tiers[@]}"

if ! command -v claude >/dev/null 2>&1; then
  say "Installing Claude Code"
  npm config set prefix "$HOME/.local"
  npm install -g @anthropic-ai/claude-code
fi

profile_line='export PATH="$HOME/.local/opt/node-v22/bin:$HOME/.local/bin:$PATH"'
grep -Fqx "$profile_line" "$HOME/.profile" 2>/dev/null || printf '\n%s\n' "$profile_line" >> "$HOME/.profile"

printf '\n\033[1;32mSetup complete. Project: %s\033[0m\n' "$LIB"
if $LAUNCH; then
  say "Starting Claude Code (sign in when prompted)"
  cd "$LIB"
  exec claude
else
  printf 'Start later in WSL with: cd %q && claude\n' "$LIB"
fi
