#!/usr/bin/env bash
# Bump the extension version in manifest.json.
#
# The Chrome Web Store rejects any upload whose version is not strictly
# greater than the published one, so run this before every release build.
#
# Usage: scripts/bump-version.sh [patch|minor|major]   (default: patch)
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

current=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest")

# Strict validation before the value is used in arithmetic or sed patterns.
# This is the hardening gate: only digits.digits.digits passes, so arithmetic
# injection and pattern injection are impossible past this point.
[[ "$current" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo "error: unexpected version format in $manifest: '$current'" >&2
  exit 1
}

part="${1:-patch}"
IFS=. read -r major minor patch <<<"$current"

# 10# forces base-10 so components with leading zeros (e.g. "08") can't be
# misread as octal.
case "$part" in
  major) major=$((10#$major + 1)); minor=0; patch=0 ;;
  minor) minor=$((10#$minor + 1)); patch=0 ;;
  patch) patch=$((10#$patch + 1)) ;;
  *) echo "usage: $0 [patch|minor|major]" >&2; exit 1 ;;
esac

new="${major}.${minor}.${patch}"

# Escape the dots so the search pattern matches literally.
current_re=${current//./\\.}

# Write atomically: edit a temp copy, verify the edit landed, then swap it in.
# The manifest is never left half-written, even if this script is killed.
tmp=$(mktemp "${manifest}.XXXXXX")
trap 'rm -f "$tmp"' EXIT

sed "s/\"version\"[[:space:]]*:[[:space:]]*\"${current_re}\"/\"version\": \"${new}\"/" "$manifest" >"$tmp"

grep -q "\"version\": \"${new}\"" "$tmp" || {
  echo "error: version replacement failed; $manifest left unchanged" >&2
  exit 1
}

mv "$tmp" "$manifest"
trap - EXIT
echo "Version: $current -> $new"
