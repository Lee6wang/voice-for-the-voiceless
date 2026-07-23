#!/usr/bin/env bash

set -euo pipefail

studio_app="${ANDROID_STUDIO_APP:-/Applications/Android Studio.app}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
config_app_dir="$(cd "$script_dir/.." && pwd)"
android_dir="$config_app_dir/android"

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node。请先在当前终端加载 NVM，再重新执行 npm run studio。"
  exit 1
fi

if [[ ! -d "$studio_app" ]]; then
  echo "未找到 Android Studio：$studio_app"
  exit 1
fi

if [[ ! -f "$android_dir/settings.gradle" ]]; then
  echo "尚未生成原生 Android 工程。请先执行："
  echo "npx expo prebuild --platform android --no-install"
  exit 1
fi

if pgrep -f "$studio_app/Contents/MacOS/studio" >/dev/null 2>&1; then
  echo "Android Studio 仍在运行。请先按 Command+Q 完全退出，再执行 npm run studio。"
  exit 1
fi

node_dir="$(dirname "$(command -v node)")"
studio_path="$node_dir:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
studio_jdk="$studio_app/Contents/jbr/Contents/Home"

open \
  --env "PATH=$studio_path" \
  --env "JAVA_HOME=$studio_jdk" \
  -a "$studio_app" \
  "$android_dir"

echo "Android Studio 已使用 Node 路径启动：$(command -v node)"
