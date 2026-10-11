#!/bin/bash
# Build the app and publish it to the gh-pages branch of `origin`, which
# GitHub Pages serves. Only the built files go there, as a single commit.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build
touch dist/.nojekyll

REMOTE="$(git remote get-url origin)"
NAME="$(git config user.name || echo HueLite)"
EMAIL="$(git config user.email || echo noreply@example.com)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp -R dist/. "$TMP"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="$NAME" -c user.email="$EMAIL" commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
# use the GitHub CLI's login for this one push (no global git config change)
git -c credential.helper= -c credential.helper='!gh auth git-credential' push -q -f "$REMOTE" gh-pages
echo "deployed to gh-pages"
