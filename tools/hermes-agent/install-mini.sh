#!/usr/bin/env bash
# Installerar Hermes-tillaggen pa Linux-minin. Kan koras om, ingenting skrivs over i onodan.
#
#   cd <repot pa minin> && bash tools/hermes-agent/install-mini.sh
#
# Kors som anvandaren som kor Hermes (inte root). sudo behovs for:
#   - anvandaren viaeats-jour, som ensam ager deploy-nyckeln till GitHub
#   - grinden och terminalvakten i /usr/local/lib/viaeats-jour (root-agda, sa Hermes inte kan skriva om dem)
#   - sudo-regeln som later Hermes kora just grinden som viaeats-jour, inget annat
#   - systemd-enheterna
set -euo pipefail

REPO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
HERMES_USER=${HERMES_USER:-$(id -un)}
HERMES_HOME_DIR=$(getent passwd "$HERMES_USER" | cut -d: -f6)
NODE_BIN=$(command -v node)
LIB=/usr/local/lib/viaeats-jour
JOUR_HOME=/var/lib/viaeats-jour
FORWARDER_ENV="$REPO_DIR/tools/hermes-whatsapp-forwarder/.runtime.env"
GITHUB_ED25519='SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU'

say() { printf '\n== %s\n' "$*"; }
need() { command -v "$1" >/dev/null || { echo "Saknas: $1" >&2; exit 1; }; }
need node; need python3; need git; need ssh-keygen; need sudo
[[ "$(id -u)" != 0 ]] || { echo "Kor som Hermes-anvandaren, inte root." >&2; exit 1; }
[[ -f "$FORWARDER_ENV" ]] || { echo "Saknas: $FORWARDER_ENV (bryggan och chatten)" >&2; exit 1; }
env_value() { grep -E "^$1=" "$FORWARDER_ENV" | tail -1 | cut -d= -f2- | sed -E "s/^['\"]|['\"]$//g"; }

say "Jour-grinden"
id viaeats-jour >/dev/null 2>&1 || sudo useradd --system --home-dir "$JOUR_HOME" --create-home --shell /usr/sbin/nologin viaeats-jour
sudo install -d -o viaeats-jour -g viaeats-jour -m 700 "$JOUR_HOME" "$JOUR_HOME/.ssh"
sudo install -d -o root -g root -m 755 "$LIB"
sudo install -o root -g root -m 755 "$REPO_DIR/tools/hermes-agent/jour/viaeats-jour.py" "$LIB/viaeats-jour.py"
sudo install -o root -g root -m 755 "$REPO_DIR/tools/hermes-agent/hooks/guard-terminal.py" "$LIB/guard-terminal.py"
sudo install -o root -g root -m 755 "$REPO_DIR/tools/hermes-agent/jour/viaeats-jour" /usr/local/bin/viaeats-jour

sudo install -d -o root -g viaeats-jour -m 750 /etc/viaeats-jour
tmp=$(mktemp)
cat > "$tmp" <<EOF
# Grindens konfig. Las bara av viaeats-jour. Skapad av install-mini.sh $(date -Iseconds).
JOUR_HOME=$JOUR_HOME
JOUR_REPO_FETCH_URL=https://github.com/lexzar99/palmy.git
JOUR_REPO_PUSH_URL=git@github.com:lexzar99/palmy.git
JOUR_BRANCH=main
HERMES_BRIDGE_SEND_URL=$(env_value HERMES_BRIDGE_SEND_URL || echo http://127.0.0.1:3000/send)
HERMES_WHATSAPP_CHAT_ID=$(env_value HERMES_WHATSAPP_CHAT_ID)
JOUR_MAX_FILES=15
JOUR_MAX_LINES=400
JOUR_CODE_TTL_MIN=30
EOF
sudo install -o root -g viaeats-jour -m 640 "$tmp" /etc/viaeats-jour/jour.env
rm -f "$tmp"

# Deploy-nyckeln skapas och ligger hos viaeats-jour. Hermes kan inte lasa den.
if ! sudo test -f "$JOUR_HOME/.ssh/id_ed25519"; then
  sudo -u viaeats-jour ssh-keygen -q -t ed25519 -N '' -C "hermes-jour@$(hostname)" -f "$JOUR_HOME/.ssh/id_ed25519"
fi
# GitHubs vardnyckel kontrolleras mot det publicerade fingeravtrycket, inte bara litas pa.
scanned=$(ssh-keyscan -t ed25519 github.com 2>/dev/null)
if [[ "$(ssh-keygen -lf - <<<"$scanned" | awk '{print $2}')" != "$GITHUB_ED25519" ]]; then
  echo "github.com visar fel vardnyckel. Avbryter." >&2; exit 1
fi
printf '%s\n' "$scanned" | sudo -u viaeats-jour tee "$JOUR_HOME/.ssh/known_hosts" >/dev/null

# Hermes far kora grinden som viaeats-jour - och inget annat med sudo.
sudoers=$(mktemp)
echo "$HERMES_USER ALL=(viaeats-jour) NOPASSWD: $LIB/viaeats-jour.py" > "$sudoers"
sudo visudo -cf "$sudoers" >/dev/null
sudo install -o root -g root -m 440 "$sudoers" /etc/sudoers.d/viaeats-jour
rm -f "$sudoers"
sudo -u viaeats-jour "$LIB/viaeats-jour.py" sync

say "Hermes arbetskopia (~/viaeats-jour)"
if [[ ! -d "$HERMES_HOME_DIR/viaeats-jour/.git" ]]; then
  git clone -q --filter=blob:none https://github.com/lexzar99/palmy.git "$HERMES_HOME_DIR/viaeats-jour"
fi
git -C "$HERMES_HOME_DIR/viaeats-jour" config user.name "Hermes (jour)"
git -C "$HERMES_HOME_DIR/viaeats-jour" config user.email "hermes-jour@viaeats.se"

say "Driftkopia (~/viaeats-drift) och hamtning fran GitHub"
# Tjansterna kor fran en egen kopia som bara far tools/ och som ingen redigerar.
# viaeats-pull.timer snabbspolar bada kopiorna mot GitHub var 5:e minut.
if [[ ! -d "$HERMES_HOME_DIR/viaeats-drift/.git" ]]; then
  git clone -q --filter=blob:none --sparse https://github.com/lexzar99/palmy.git "$HERMES_HOME_DIR/viaeats-drift"
  git -C "$HERMES_HOME_DIR/viaeats-drift" sparse-checkout set tools
fi
sudo install -o root -g root -m 755 "$REPO_DIR/tools/hermes-agent/viaeats-pull.sh" /usr/local/bin/viaeats-pull

say "Skills"
SKILLS="$HERMES_HOME_DIR/.hermes/skills/viaeats"
mkdir -p "$SKILLS"
for skill in viaeats-jour viaeats-drift; do
  mkdir -p "$SKILLS/$skill"
  sed "s#~/viaeats-hermes#$REPO_DIR#g" "$REPO_DIR/tools/hermes-agent/skills/$skill/SKILL.md" > "$SKILLS/$skill/SKILL.md"
done
if [[ -f "$HERMES_HOME_DIR/viaeats-CLAUDE.md" ]]; then
  mkdir -p "$SKILLS/viaeats-jour/references"
  cp "$HERMES_HOME_DIR/viaeats-CLAUDE.md" "$SKILLS/viaeats-jour/references/CLAUDE.md"
fi

say "systemd"
install_unit() {
  sed -e "s#^User=hermes#User=$HERMES_USER#" -e "s#/opt/viaeats#$REPO_DIR#g" -e "s#/usr/bin/node#$NODE_BIN#g" \
    "$REPO_DIR/tools/hermes-agent/systemd/$1" | sudo tee "/etc/systemd/system/$1" >/dev/null
}
for unit in hermes-vakt.service hermes-vakt.timer hermes-vecka.service hermes-vecka.timer hermes-meta-leads.service viaeats-pull.service viaeats-pull.timer; do
  install_unit "$unit"
done
sudo systemctl daemon-reload
sudo systemctl enable --now hermes-vakt.timer hermes-vecka.timer viaeats-pull.timer
if [[ -f "$HERMES_HOME_DIR/.viaeats/hermes/meta-leads.env" ]]; then
  sudo systemctl enable hermes-meta-leads.service
  sudo systemctl restart hermes-meta-leads.service
else
  echo "Lead-bevakningen startas nar ~/.viaeats/hermes/meta-leads.env finns (setup-meta-leads.mjs)."
fi
# Nya poll-api.js (NY ORDER-formatet, restaurangvakten) galler efter omstart.
if systemctl list-unit-files hermes-poll.service >/dev/null 2>&1; then sudo systemctl restart hermes-poll.service; fi

say "Klart"
echo "Deploy-nyckel att lagga till pa GitHub (lexzar99/palmy -> Settings -> Deploy keys, Allow write access):"
sudo cat "$JOUR_HOME/.ssh/id_ed25519.pub"
echo
echo "Kvar i Hermes config.yaml: terminalvakten och approvals.deny. Se tools/hermes-agent/README.md."
