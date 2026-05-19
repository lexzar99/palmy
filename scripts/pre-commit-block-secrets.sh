#!/usr/bin/env bash
# Block accidental commits of .env files or recognisable live secrets.
# Install: ln -sf ../../scripts/pre-commit-block-secrets.sh .git/hooks/pre-commit
set -euo pipefail

red() { printf '\033[0;31m%s\033[0m\n' "$*" >&2; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*" >&2; }

staged=$(git diff --cached --name-only --diff-filter=ACMR)
[ -z "$staged" ] && exit 0

fail=0

# 1. Block .env files (allow .env.example / .env.*.example)
while IFS= read -r f; do
  case "$f" in
    *.env.example|*.env.*.example) ;;
    .env|*.env|*/.env|*.env.*|*/.env.*)
      red "✘ refusing to commit env file: $f"
      fail=1
      ;;
  esac
done <<< "$staged"

# 2. Pickaxe staged diff for live secret patterns
diff=$(git diff --cached --no-color -U0 -- $staged 2>/dev/null || true)

check() {
  local label="$1" pattern="$2"
  local hits
  hits=$(printf '%s\n' "$diff" | grep -nE "^\+.*$pattern" || true)
  if [ -n "$hits" ]; then
    red "✘ $label found in staged diff:"
    printf '%s\n' "$hits" | head -3 >&2
    fail=1
  fi
}

check "Stripe live secret key"  'sk_live_[A-Za-z0-9]{20,}'
check "Stripe restricted key"   'rk_live_[A-Za-z0-9]{20,}'
check "Stripe webhook secret"   'whsec_[A-Za-z0-9]{30,}'
check "Google API key"          'AIza[A-Za-z0-9_-]{32,}'
check "AWS access key"          'AKIA[0-9A-Z]{16}'
check "AWS temp access key"     'ASIA[0-9A-Z]{16}'
check "Slack bot token"         'xox[baprs]-[A-Za-z0-9-]{10,}'
check "GitHub personal token"   'ghp_[A-Za-z0-9]{30,}'
check "GitHub fine-grained PAT" 'github_pat_[A-Za-z0-9_]{20,}'
check "SendGrid API key"        'SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{20,}'
check "Twilio account SID"      'AC[a-f0-9]{32}'
check "Twilio auth token"       'twilio.{0,20}[a-f0-9]{32}'
check "Supabase service role"   'eyJhbGciOiJIUzI1NiIs[A-Za-z0-9_=-]{40,}\.[A-Za-z0-9_=-]{20,}\.[A-Za-z0-9_=-]{20,}'
check "RSA / private key block" 'BEGIN [A-Z ]*PRIVATE KEY'

if [ $fail -ne 0 ]; then
  red ""
  red "Commit blocked. If you are 100% sure this is safe, bypass with: git commit --no-verify"
  exit 1
fi

exit 0
