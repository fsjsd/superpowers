#!/usr/bin/env bash
# Usage: validate-scripts.sh <file> [<file> ...]
# Validates that each script.js or script.py runs in describe mode and
# outputs valid JSON with the required 'name' and 'description' fields.
# Exits 1 if any script fails.

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "No scripts to validate."
  exit 0
fi

failed=0

validate_output() {
  local output="$1"
  local validation
  local val_exit=0
  validation=$(node scripts/validate-schema.mjs "$output" 2>&1) || val_exit=$?
  echo "$validation"
  return $val_exit
}

for script in "$@"; do
  # Only process script.js and script.py files
  basename=$(basename "$script")
  if [[ "$basename" != "script.js" && "$basename" != "script.py" ]]; then
    continue
  fi

  echo "--- Checking: $script"

  output=''
  exit_code=0
  if [[ "$script" == *.js ]]; then
    output=$(node "$script" --superpowers=describe 2>&1) || exit_code=$?
  elif [[ "$script" == *.py ]]; then
    output=$(python3 "$script" --superpowers describe 2>&1) || exit_code=$?
  fi

  if [ $exit_code -ne 0 ]; then
    echo "FAIL: script exited with code $exit_code"
    echo "$output"
    failed=1
    continue
  fi

  if ! validate_output "$output"; then
    echo "FAIL: $script"
    failed=1
  fi
done

if [ $failed -ne 0 ]; then
  echo ""
  echo "One or more scripts failed validation. See above for details."
  exit 1
fi

echo ""
echo "All scripts passed."
