#!/usr/bin/env bash
# Hamtar senaste main fran GitHub till minins kopior av viaeats. Kors av
# viaeats-pull.timer var 5:e minut.
#
#   ~/viaeats-jour   Hermes arbetskopia. Snabbspolas bara nar den star pa main
#                    och ar ren. Pagaende jour-grenar rors aldrig, de far bara
#                    en farsk origin/main att utga fran.
#   ~/viaeats-drift  Det tjansterna (pollare, vakt) kor fran. Ingen redigerar
#                    har. Andras tools/ startas pollarna om.
set -uo pipefail

pull() {
  local repo=$1
  [[ -d "$repo/.git" ]] || return 0
  git -C "$repo" fetch -q origin main || { echo "[viaeats-pull] kunde inte hamta $repo"; return 1; }
  local branch
  branch=$(git -C "$repo" rev-parse --abbrev-ref HEAD)
  if [[ "$branch" != main || -n "$(git -C "$repo" status --porcelain --untracked-files=no)" ]]; then
    return 0
  fi
  local before after
  before=$(git -C "$repo" rev-parse HEAD)
  git -C "$repo" merge -q --ff-only origin/main || { echo "[viaeats-pull] $repo gick inte att snabbspola"; return 1; }
  after=$(git -C "$repo" rev-parse HEAD)
  [[ "$before" == "$after" ]] && return 0
  echo "[viaeats-pull] $repo: ${before:0:9} -> ${after:0:9}"
  if [[ "$repo" == "$HOME/viaeats-drift" ]] && ! git -C "$repo" diff --quiet "$before" "$after" -- tools/hermes-whatsapp-forwarder; then
    # Pollarna laddar koden vid start. Vakten kors om varannan minut av sig sjalv.
    sudo -n systemctl try-restart hermes-poll.service hermes-meta-leads.service \
      && echo "[viaeats-pull] pollarna omstartade med ny kod"
  fi
}

pull "$HOME/viaeats-jour"
pull "$HOME/viaeats-drift"
