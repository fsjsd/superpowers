#!/usr/bin/env bash
# Usage:
#   validate-marketplace-images.sh                       # scan all of powers/
#   validate-marketplace-images.sh <script> [<script>…]  # check specific script files
#
# Validates that every script.js / script.py folder has a sibling
# marketplace.png with dimensions 1200x896.

set -euo pipefail

REQUIRED_WIDTH=1200
REQUIRED_HEIGHT=896

failed=0
checked=0

# Read PNG dimensions from file header using Node (no external deps needed).
# PNG stores width at bytes 16-19, height at bytes 20-23 (big-endian uint32).
png_dimensions() {
  local file="$1"
  node -e "
    const fs = require('fs');
    const buf = Buffer.alloc(24);
    const fd = fs.openSync(process.argv[1], 'r');
    fs.readSync(fd, buf, 0, 24, 0);
    fs.closeSync(fd);
    const sig = buf.slice(0, 8).toString('hex');
    if (sig !== '89504e470d0a1a0a') {
      process.stderr.write('Not a valid PNG file\n');
      process.exit(1);
    }
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    console.log(width + 'x' + height);
  " "$file"
}

check_dir() {
  local dir="$1"
  local image="$dir/marketplace.png"
  checked=$((checked + 1))

  echo "--- Checking: $dir"

  if [ ! -f "$image" ]; then
    echo "FAIL: missing marketplace.png"
    failed=1
    return
  fi

  local dims
  dims=$(png_dimensions "$image" 2>&1) || { echo "FAIL: marketplace.png — $dims"; failed=1; return; }

  if [ "$dims" != "${REQUIRED_WIDTH}x${REQUIRED_HEIGHT}" ]; then
    echo "FAIL: marketplace.png — expected ${REQUIRED_WIDTH}x${REQUIRED_HEIGHT}, got $dims"
    failed=1
  else
    echo "OK: marketplace.png ${dims}"
  fi
}

if [ $# -eq 0 ]; then
  # No args — scan all of powers/
  ROOT="$(dirname "$0")/../powers"
  while IFS= read -r dir; do
    check_dir "$dir"
  done < <(find "$ROOT" -type f \( -name "script.js" -o -name "script.py" \) -exec dirname {} \; | sort -u)
else
  # Args are script file paths — deduplicate their parent directories
  declare -A seen
  for f in "$@"; do
    basename_f=$(basename "$f")
    if [[ "$basename_f" != "script.js" && "$basename_f" != "script.py" ]]; then
      continue
    fi
    dir=$(dirname "$f")
    if [[ -z "${seen[$dir]+x}" ]]; then
      seen[$dir]=1
      check_dir "$dir"
    fi
  done
fi

echo ""

if [ $checked -eq 0 ]; then
  echo "No scripts found."
  exit 0
fi

if [ $failed -ne 0 ]; then
  echo "One or more scripts are missing a valid marketplace.png."
  exit 1
fi

echo "All $checked script folder(s) have a valid marketplace.png (${REQUIRED_WIDTH}x${REQUIRED_HEIGHT})."

if [ $failed -ne 0 ]; then
  echo "One or more scripts are missing a valid marketplace.png."
  exit 1
fi

echo "All $checked script folder(s) have a valid marketplace.png (${REQUIRED_WIDTH}x${REQUIRED_HEIGHT})."
