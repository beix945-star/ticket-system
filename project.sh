#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR/frontend"
TASK="${1:-dev}"
case "$TASK" in install|dev|build|lint|preview) ;; *) echo '用法：./project.sh install|dev|build|lint|preview'; exit 1 ;; esac
BUNDLED_ROOT="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"
if command -v node >/dev/null 2>&1 && command -v pnpm >/dev/null 2>&1; then
  RUNNER="$(command -v pnpm)"
elif [[ -x "$BUNDLED_ROOT/node/bin/node" && -x "$BUNDLED_ROOT/bin/fallback/pnpm" ]]; then
  export PATH="$BUNDLED_ROOT/node/bin:$BUNDLED_ROOT/bin/fallback:$PATH"
  RUNNER="$BUNDLED_ROOT/bin/fallback/pnpm"
elif command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  RUNNER="$(command -v npm)"
else
  echo '没有找到 Node.js。请先安装 Node.js LTS，再重新运行。'
  exit 1
fi
if [[ "$TASK" == install ]]; then exec "$RUNNER" install; fi
if [[ ! -d node_modules ]]; then "$RUNNER" install; fi
exec "$RUNNER" run "$TASK"
