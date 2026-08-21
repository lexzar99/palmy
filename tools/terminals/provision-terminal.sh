#!/usr/bin/env bash
#
# Gör en ViaEats-terminal färdig: installerar appen, gör den till Device Owner
# och låser plattan till Inställningar + ViaEats.
#
# Detta ÄR vår MDM. Device Owner via adb kostar ingenting och kräver ingen
# server — men fönstret finns bara så länge plattan saknar konton. Läggs ett
# Google-konto till först måste enheten fabriksåterställas för att kunna låsas.
#
# Körs en gång per ny platta, med enheten i USB och USB-felsökning på:
#     ./provision-terminal.sh                 # en platta (den anslutna)
#     ./provision-terminal.sh --all-devices   # alla anslutna plattor i följd
#     ./provision-terminal.sh --app-only      # bara uppdatera APK:n
#     ./provision-terminal.sh --status        # visa nuvarande läge
#
set -uo pipefail

PACKAGE="com.matgo.restaurant"
# OBS: applicationId (com.matgo.restaurant) och klasspaketet
# (com.matgo.restaurant.nativeapp) skiljer sig åt i det här projektet, så
# komponenten måste skrivas ut med .nativeapp. — annars svarar dpm
# "Unknown admin" trots att receivern finns i APK:n.
ADMIN="${PACKAGE}/${PACKAGE}.nativeapp.dpc.PartnerDeviceAdminReceiver"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APK_DEFAULT="$REPO_ROOT/mobile_apps/Delivera Android/partner/build/outputs/apk/sunmi/release/partner-sunmi-release.apk"
APK="${VIAEATS_APK:-$APK_DEFAULT}"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
warn()  { printf '\033[33m%s\033[0m\n' "$*"; }
step()  { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

DEVICE="${VIAEATS_DEVICE:-}"
sh_adb() {
  if [ -n "$DEVICE" ]; then adb -s "$DEVICE" "$@"; else adb "$@"; fi
}

require_device() {
  command -v adb >/dev/null || { red "adb saknas. Installera Android platform-tools."; exit 1; }
  local count
  count=$(adb devices | awk 'NR>1 && $2=="device"' | wc -l | tr -d ' ')
  if [ "$count" -eq 0 ]; then
    red "Ingen enhet hittades. Koppla in plattan i USB och slå på USB-felsökning."
    exit 1
  fi
  if [ "$count" -gt 1 ] && [ -z "$DEVICE" ]; then
    red "Flera enheter anslutna. Ange vilken med VIAEATS_DEVICE=<serial>:"
    adb devices | awk 'NR>1 && $2=="device" {print "  " $1}'
    exit 1
  fi
  [ -n "$DEVICE" ] || DEVICE=$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')
  green "Enhet: $DEVICE ($(sh_adb shell getprop ro.product.model | tr -d '\r'), Android $(sh_adb shell getprop ro.build.version.release | tr -d '\r'))"
}

is_device_owner() {
  # dumpsys skriver "Device Owner:" först när en owner faktiskt finns.
  sh_adb shell dumpsys device_policy 2>/dev/null | grep -qi "device owner"
}

show_status() {
  step "Nuvarande läge"
  if is_device_owner; then green "Device Owner: satt"; else warn "Device Owner: INTE satt"; fi
  printf 'Installerad app:  %s\n' "$(sh_adb shell dumpsys package $PACKAGE 2>/dev/null | grep -m1 versionName | tr -d '\r ' || echo 'ej installerad')"
  printf 'Skärmtimeout:     %s ms\n' "$(sh_adb shell settings get system screen_off_timeout | tr -d '\r')"
  printf 'Tidszon:          %s\n' "$(sh_adb shell getprop persist.sys.timezone | tr -d '\r')"
  printf 'Klockformat:      %s-timmars\n' "$(sh_adb shell settings get system time_12_24 | tr -d '\r')"
  printf 'Plattans klocka:  %s\n' "$(sh_adb shell date | tr -d '\r')"
  printf 'Batteri-undantag: '
  if sh_adb shell dumpsys deviceidle whitelist 2>/dev/null | grep -q "$PACKAGE"; then green "ja"; else warn "nej"; fi
  echo "Appar med startikon:"
  visible_apps | sed 's/^/  /'
}

visible_apps() {
  sh_adb shell cmd package query-activities --brief \
      -a android.intent.action.MAIN -c android.intent.category.LAUNCHER 2>/dev/null \
    | grep -oE '^[[:space:]]*[a-zA-Z0-9_.]+/' | tr -d ' /\r' | sort -u
}

install_app() {
  step "Installerar appen"
  [ -f "$APK" ] || { red "Hittar ingen APK på: $APK"; red "Bygg först: ./gradlew :partner:assembleSunmiRelease"; exit 1; }
  echo "APK: $APK"
  local out
  out=$(sh_adb install -r -d "$APK" 2>&1)
  if echo "$out" | grep -q "Success"; then
    green "Appen installerad: $(sh_adb shell dumpsys package $PACKAGE | grep -m1 versionName | tr -d '\r ')"
  else
    red "Installationen misslyckades:"; echo "$out"
    # Vanligaste orsaken: APK:n är signerad med en ANNAN nyckel än den som
    # redan sitter på plattan. Den gamla måste då av först — och det raderar
    # parningen, så enheten måste paras om i admin efteråt.
    warn "Kontrollera att APK:n är signerad med samma nyckel som den installerade appen."
    exit 1
  fi
}

set_device_owner() {
  step "Sätter Device Owner"
  if is_device_owner; then green "Device Owner är redan satt — hoppar över."; return 0; fi
  local accounts
  accounts=$(sh_adb shell dumpsys account 2>/dev/null | grep -c "Account {" | tr -d '\r')
  if [ "${accounts:-0}" -gt 0 ]; then
    red "Plattan har $accounts konto(n) tillagda — Android vägrar då sätta Device Owner."
    red "Ta bort alla konton under Inställningar → Konton, eller fabriksåterställ, och kör igen."
    exit 1
  fi
  local out
  out=$(sh_adb shell dpm set-device-owner "$ADMIN" 2>&1 | tr -d '\r')
  if echo "$out" | grep -qi "success"; then green "Device Owner satt."
  else red "Kunde inte sätta Device Owner:"; echo "  $out"; exit 1; fi
}

apply_device_settings() {
  step "Skärm, batteri och notiser"

  # Always-on: appen håller redan FLAG_KEEP_SCREEN_ON i förgrunden. Det här
  # täcker resten — skärmen ska aldrig slockna, även på batteri.
  sh_adb shell settings put system screen_off_timeout 2147483647 >/dev/null 2>&1
  # 7 = AC + USB + trådlöst: skärmen förblir på i alla laddlägen.
  sh_adb shell settings put global stay_on_while_plugged_in 7 >/dev/null 2>&1
  green "Skärmen är satt att aldrig slockna."

  # Full batteri-frihet åt ViaEats: ingen doze, ingen bakgrundsstrypning.
  sh_adb shell dumpsys deviceidle whitelist "+$PACKAGE" >/dev/null 2>&1
  sh_adb shell cmd appops set "$PACKAGE" RUN_IN_BACKGROUND allow >/dev/null 2>&1
  sh_adb shell cmd appops set "$PACKAGE" WAKE_LOCK allow >/dev/null 2>&1
  green "ViaEats undantaget från batterioptimering."

  # Bevilja allt appen deklarerar, så ingen dialog dyker upp mitt i ett kök.
  local granted=0
  for perm in $(sh_adb shell dumpsys package "$PACKAGE" 2>/dev/null \
      | grep -oE 'android\.permission\.[A-Z_]+' | sort -u | tr -d '\r'); do
    sh_adb shell pm grant "$PACKAGE" "$perm" >/dev/null 2>&1 && granted=$((granted+1))
  done
  green "Behörigheter beviljade ($granted)."

  # Notiser av för allt utom ViaEats. De appar vi döljer är dessutom stoppade,
  # men de som ligger kvar utan startikon kan fortfarande pipa.
  local silenced=0
  for pkg in $(sh_adb shell pm list packages 2>/dev/null | sed 's/package://' | tr -d '\r'); do
    [ "$pkg" = "$PACKAGE" ] && continue
    sh_adb shell cmd appops set "$pkg" POST_NOTIFICATION ignore >/dev/null 2>&1 && silenced=$((silenced+1))
  done
  green "Notiser avstängda för $silenced appar (ViaEats orörd)."
}

# Appar som är registrerade som device admins kan inte döljas — Android
# vägrar setApplicationHidden på en aktiv admin. På Sunmi gäller det
# fjärrsupportappen, som annars blir kvar som enda främmande ikon på skärmen.
disable_stubborn_admins() {
  step "Stänger av appar som inte går att dölja"
  for pkg in com.sunmi.remotecontrol.pro; do
    if visible_apps | grep -q "^${pkg}$"; then
      local out
      out=$(sh_adb shell pm disable-user --user 0 "$pkg" 2>&1 | tr -d '\r')
      if echo "$out" | grep -q "disabled-user"; then
        green "$pkg avstängd."
      else
        warn "Kunde inte stänga av $pkg: $out"
      fi
    fi
  done
}

# Tid och tidszon.
#
# Kvittona får fel klockslag om plattan står i UTC, och personalen läser
# hämtningstider i 24-timmarsformat. Automatisk tid hämtas över nätverket
# (NTP) och fungerar på Wi-Fi, men automatisk TIDSZON kommer från
# mobilnätet — och plattorna har inget SIM. Därför sätts Europe/Stockholm
# uttryckligen som grund, med automatiken påslagen ovanpå.
apply_time_settings() {
  step "Tid och tidszon"

  sh_adb shell settings put global auto_time 1 >/dev/null 2>&1
  sh_adb shell settings put global auto_time_zone 1 >/dev/null 2>&1
  sh_adb shell settings put system time_12_24 24 >/dev/null 2>&1

  # persist.sys.timezone är den enda vägen att sätta zonen på API 25 utan
  # mobilnät. Kräver att adbd kör med tillräcklig behörighet.
  sh_adb shell setprop persist.sys.timezone "Europe/Stockholm" >/dev/null 2>&1

  local zone format
  zone=$(sh_adb shell getprop persist.sys.timezone | tr -d '\r')
  format=$(sh_adb shell settings get system time_12_24 | tr -d '\r')

  if [ "$zone" = "Europe/Stockholm" ]; then
    green "Tidszon: $zone"
  else
    warn "Tidszonen är \"$zone\", inte Europe/Stockholm."
    warn "Sätt den för hand: Inställningar → Datum och tid → Tidszon → Stockholm."
  fi

  if [ "$format" = "24" ]; then
    green "Klockformat: 24 timmar"
  else
    warn "Klockformatet är \"$format\", inte 24."
  fi
  green "Automatisk tid och tidszon påslagen."
  printf 'Plattans klocka: %s\n' "$(sh_adb shell date | tr -d '\r')"
}

apply_lockdown() {
  step "Låser plattan"
  # DPC:n i appen gör själva döljandet — den känner skyddslistan och rör aldrig
  # launcher, systemgränssnitt eller paketinstalleraren.
  sh_adb shell am start -n "$PACKAGE/${PACKAGE}.nativeapp.ui.MainActivity" >/dev/null 2>&1
  sleep 4
  echo "Appar som fortfarande syns:"
  visible_apps | sed 's/^/  /'
  local count
  count=$(visible_apps | grep -c . || true)
  if [ "${count:-0}" -le 3 ]; then
    green "Låsningen är aktiv."
  else
    warn "Fler appar än väntat syns kvar ($count)."
    warn "Öppna ViaEats på plattan en gång — låsningen appliceras när appen"
    warn "startar som device owner."
  fi
}

# ── Flottläge ───────────────────────────────────────────────────────────────
# 20 plattor ska sättas upp några i taget. Att köra dem en och en manuellt
# inbjuder till att man tappar räkningen på vilken som redan är klar, så
# batchläget kör alla anslutna och skriver en rad per enhet i slutet.
provision_all_connected() {
  local serials
  serials=$(adb devices | awk 'NR>1 && $2=="device" {print $1}')
  if [ -z "$serials" ]; then
    red "Ingen enhet hittades. Koppla in plattorna och slå på USB-felsökning."
    exit 1
  fi

  local total=0
  total=$(printf '%s\n' "$serials" | grep -c .)
  printf '\n\033[1m%s platta(or) ansluten(a)\033[0m\n' "$total"

  # Ackumuleras som text, inte arrayer: macOS levererar bash 3.2, där en tom
  # array under `set -u` avbryter skriptet i stället för att expandera till
  # ingenting.
  local ok_list="" fail_list="" ok_count=0 fail_count=0
  for serial in $serials; do
    printf '\n\033[1m════ %s ════\033[0m\n' "$serial"
    # Underprocess: en platta som fallerar får inte stoppa resten av bunten.
    if VIAEATS_DEVICE="$serial" "$0" --all; then
      ok_list="${ok_list}${serial}
"
      ok_count=$((ok_count + 1))
    else
      fail_list="${fail_list}${serial}
"
      fail_count=$((fail_count + 1))
    fi
  done

  printf '\n\033[1m──── Sammanfattning ────\033[0m\n'
  printf '%s' "$ok_list"   | while read -r s; do [ -n "$s" ] && green "  KLAR          $s"; done
  printf '%s' "$fail_list" | while read -r s; do [ -n "$s" ] && red   "  MISSLYCKADES  $s"; done
  printf '\n%s av %s klara.\n' "$ok_count" "$total"
  [ "$fail_count" -eq 0 ]
}

case "${1:-}" in
  --all-devices) provision_all_connected ;;
  --status)   require_device; show_status ;;
  --app-only) require_device; install_app ;;
  ""|--all)
    require_device
    install_app
    set_device_owner
    apply_time_settings
    apply_device_settings
    apply_lockdown
    disable_stubborn_admins
    show_status
    printf '\n'; green "Klar. Plattan är redo att paras i admin → Enheter."
    warn "Lägg ALDRIG till ett Google-konto på plattan — det bryter låsningen." ;;
  *) echo "Användning: $0 [--all|--all-devices|--app-only|--status]"; exit 1 ;;
esac
