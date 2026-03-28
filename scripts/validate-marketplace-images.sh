#!/usr/bin/env bash
# Usage: validate-marketplace-images.sh [dir]
# Validates that every script.js / script.py under powers/ has a sibling
# marketplace.png with dimensions 1200x896.
# Defaults to searching the 'powers' directory relative to the script's location.

set -euo pipefail

REQUIRED_WIDTH=1200
REQUIRED_HEIGHT=896
ROOT="${1:-$(dirname "$0")/../powers}"

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

while IFS= read -r dir; do
  image="$dir/marketplace.png"
  checked=$((checked + 1))

  echo "--- Checking: $dir"

  if [ ! -f "$image" ]; then
    echo "FAIL: missing marketplace.png"
    failed=1
    continue
  fi

  dims=$(png_dimensions "$image" 2>&1)
  if [ $? -ne 0 ]; then
    echo "FAIL: marketplace.png — $dims"
    failed=1
    continue
  fi

  if [ "$dims" != "${REQUIRED_WIDTH}x${REQUIRED_HEIGHT}" ]; then
    echo "FAIL: marketplace.png — expected ${REQUIRED_WIDTH}x${REQUIRED_HEIGHT}, got $dims"
    failed=1
  else
    echo "OK: marketplace.png ${dims}"
  fi
done < <(find "$ROOT" -type f \( -name "script.js" -o -name "script.py" \) -exec dirname {} \; | sort -u)

echo ""

if [ $checked -eq 0 ]; then
  echo "No scripts found under $ROOT"
  exit 0
fi

if [ $failed -ne 0 ]; then
  echo "One or more scripts are missing a valid marketplace.png."
  exit 1
fi

echo "All $checked script folder(s) have a valid marketplace.png (${REQUIRED_WIDTH}x${REQUIRED_HEIGHT})."
