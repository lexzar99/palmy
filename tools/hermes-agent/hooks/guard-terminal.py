#!/usr/bin/env python3
"""Hermes pre_tool_call-vakt for terminalen.

Installeras root-agd i /usr/local/lib/viaeats-jour/ sa att agenten inte kan
skriva om den (Hermes litar tyst pa andrade hook-skript). Registreras i
~/.hermes/config.yaml med matcher "terminal" och fail_closed: true.

  block   -> kommandot kors aldrig (push, produktion, Hermes egna installningar)
  approve -> Hermes fragar anvandaren pa WhatsApp forst (allt som tar bort, sudo)

Det har stoppar misstag. Den harda sparren mot push ligger i att Hermes inte
har nagon nyckel till GitHub - bara viaeats-jour-grinden har det.
"""
import hashlib
import json
import re
import sys

GIT = r'\bgit(?:\s+(?:-[Cc]\s+\S+|--?[\w-]+(?:=\S+)?))*\s+'

BLOCK = [
    # push som git-underkommando, aven efter globala flaggor (git -C x push).
    # "git commit -m 'Fixa push-notiser'" ska ga igenom.
    (GIT + r'push\b', 'Pusha aldrig själv. Kör viaeats-jour request och vänta på användarens kod.'),
    (GIT + r'remote\s+(add|set-url|rename)\b', 'Fjärrarkiven ändras inte i jour-läget.'),
    (r'\bhermes\s+(config|hooks|pairing|update|gateway\s+(stop|restart|uninstall))\b', 'Hermes egna inställningar ändras bara av användaren.'),
    (r'\.hermes/(config\.ya?ml|\.env|shell-hooks-allowlist\.json|platforms/)', 'Hermes konfiguration och WhatsApp-session rörs inte från terminalen.'),
    (r'\b(railway|vercel|psql|pg_dump|pg_restore|dropdb|createdb)\b', 'Produktionen (Railway, Vercel, databasen) rörs aldrig av Hermes.'),
    (r'\bprisma\s+(migrate|db\s+(push|execute|seed))', 'Migrationer körs manuellt enligt runbooken, aldrig av Hermes.'),
    (r'\bpnpm\b[^;&|]*\bdb:', 'Databaskommandon körs inte av Hermes.'),
    (r'_hemligheter|\.viaeats/swish', 'Hemligheter läses inte.'),
    (r'\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b', 'Skript från nätet körs inte.'),
    (r'/var/lib/viaeats-jour|/etc/viaeats-jour|/etc/sudoers', 'Grindens filer rörs inte.'),
]

APPROVE = [
    # Hermes har full sudo pa minin (jalle-full-control). Varje sudo-kommando
    # fragar darfor anvandaren. Sudo mot grindens filer stoppas ovan.
    (r'(^|[\s;&|(])sudo\b', 'kör som root'),
    (r'(^|[\s;&|(])(rm|rmdir|unlink|shred|truncate)\s', 'tar bort filer'),
    (r'\bfind\b.*\s-delete\b', 'tar bort filer'),
    (r'\bgit\s+(rm|clean)\b', 'tar bort filer ur git'),
    (r'\bgit\s+reset\s+--hard\b', 'kastar ocommittade ändringar'),
    (r'\bgit\s+(checkout\s+(-f\b|--\s|\.)|restore\b|stash\s+(drop|clear)\b|branch\s+-D\b)', 'kastar git-ändringar'),
    (r'(^|[\s;&|(])mv\s', 'flyttar eller skriver över filer'),
    (r'\b(systemctl|service)\s+(--user\s+)?(stop|disable|restart|mask|kill)\b', 'stoppar eller startar om tjänster'),
    (r'(^|[\s;&|(])(kill|pkill|killall)\s', 'stoppar processer'),
    (r'\bcrontab\s+-r\b', 'tar bort schemalagda jobb'),
    (r'\bdocker\s+(rm|rmi|system\s+prune|volume\s+rm)\b', 'tar bort containrar eller volymer'),
    (r'\bdd\s+if=|\bmkfs', 'skriver direkt till disk'),
]


def decide(command):
    for pattern, message in BLOCK:
        if re.search(pattern, command):
            return {'action': 'block', 'message': f'Stoppat av viaeats-vakten: {message}'}
    for pattern, reason in APPROVE:
        if re.search(pattern, command):
            # rule_key per exakt kommando: ett "always" godkanner bara just det kommandot.
            key = hashlib.sha256(command.encode()).hexdigest()[:16]
            return {
                'action': 'approve',
                'message': f'Hermes vill köra ({reason}): {command[:300]}',
                'rule_key': f'viaeats-guard:{key}',
            }
    return {}


def main():
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        # Trasig indata: hellre fraga an slappa igenom.
        print(json.dumps({'action': 'approve', 'message': 'viaeats-vakten kunde inte läsa kommandot.'}))
        return
    command = str(((payload.get('tool_input') or {}).get('command')) or '')
    print(json.dumps(decide(command), ensure_ascii=False))


if __name__ == '__main__':
    main()
