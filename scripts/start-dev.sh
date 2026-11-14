#!/bin/bash
# trinity: package=quill
set -e
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile
echo "http://127.0.0.1:${PORT:-5173}/quill/"
exec pnpm vite --host 127.0.0.1 --port "${PORT:-5173}"
