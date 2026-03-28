#!/usr/bin/env bash
# Usage: generate-manifests.sh <script_file>
set -euo pipefail

f="$1"
dir=$(dirname "$f")

if [[ "$f" == *.js ]]; then
  node "$f" --superpowers=describe > "$dir/manifest.json"
elif [[ "$f" == *.py ]]; then
  python3 "$f" --superpowers describe > "$dir/manifest.json"
fi

# Build "files" array: all entries in the script's directory except manifest.json and marketplace.png
files_json=$(ls "$dir" | grep -v -E '^(manifest\.json|marketplace\.png)$' | jq -R . | jq -s .)

# Inject "files" into manifest
tmp=$(mktemp)
jq --argjson files "$files_json" '. + {files: $files}' "$dir/manifest.json" > "$tmp"
mv "$tmp" "$dir/manifest.json"

git add "$dir/manifest.json"
