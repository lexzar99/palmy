#!/usr/bin/env bash
# Install the repo's git hooks for the current clone.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
mkdir -p .git/hooks
ln -sf ../../scripts/pre-commit-block-secrets.sh .git/hooks/pre-commit
chmod +x scripts/pre-commit-block-secrets.sh
echo "✓ pre-commit hook installed (blocks .env + obvious live secrets)"
echo "  bypass with: git commit --no-verify"
