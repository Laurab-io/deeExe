#!/usr/bin/env bash
# Package the extension for the Chrome Web Store.
#
# Produces dist/duplicate-tab-closer-v<version>.zip containing only the files
# the extension actually ships (no docs, README, or repo metadata).
#
# Usage: scripts/build.sh
set -euo pipefail
cd "$(dirname "$0")/.."

manifest="manifest.json"
[[ -f "$manifest" ]] || { echo "error: $manifest not found" >&2; exit 1; }

# Require exactly one "version" line so a loose match can never pick up the
# wrong value silently.
count=$(grep -c '"version"' "$manifest") || true
[[ "$count" == "1" ]] || {
  echo "error: expected exactly one \"version\" line in $manifest, found $count" >&2
  exit 1
}

version=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest")

# Strict validation: the version becomes part of the output filename, so this
# also guarantees it can't contain path separators or shell metacharacters.
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo "error: unexpected version format in $manifest: '$version'" >&2
  exit 1
}

# Explicit allowlist — never zip the whole directory, so repo metadata,
# docs, or stray local files can't leak into the store upload.
files=(
  manifest.json
  popup.html popup.css popup.js
  duplicates.html duplicates.css duplicates.js
  icons/icon16.png icons/icon48.png icons/icon128.png
)

for f in "${files[@]}"; do
  [[ -f "$f" ]] || { echo "error: shipped file missing: $f" >&2; exit 1; }
done

out="dist/duplicate-tab-closer-v${version}.zip"
mkdir -p dist
rm -f "$out"

# -X strips extended attributes and other platform metadata from the archive.
zip -X "$out" "${files[@]}"

echo "Built $out"
