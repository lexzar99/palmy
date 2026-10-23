#!/usr/bin/env python3
"""Sammanfogar viaeats-sakerheten in i ~/.hermes/config.yaml. Kan koras om.

  ~/.hermes/hermes-agent/venv/bin/python tools/hermes-agent/harden-hermes.py

Kors med Hermes egen Python (ruamel.yaml finns dar), sa kommentarer och
formatering i config.yaml behalls. En kopia sparas fore varje andring.
Vad och varfor: tools/hermes-agent/hermes-config.viaeats.yaml och README.md.
"""
import json
import shutil
import time
from pathlib import Path

from ruamel.yaml import YAML

HERMES = Path.home() / '.hermes'
CONFIG = HERMES / 'config.yaml'
ALLOWLIST = HERMES / 'shell-hooks-allowlist.json'
GUARD = '/usr/local/lib/viaeats-jour/guard-terminal.py'

DENY = [
    'git push*',
    'hermes config set*',
    'hermes config unset*',
    'hermes config edit*',
    'hermes hooks revoke*',
    'hermes pairing*',
    '*viaeats-jour/.ssh*',
]
# "delete in root path" godkandes en gang for alltid. Raderingar ska fraga.
DROP_FROM_ALLOWLIST = {'delete in root path'}


def main():
    yaml = YAML()
    yaml.preserve_quotes = True
    data = yaml.load(CONFIG.read_text(encoding='utf-8'))
    backup = CONFIG.with_name(f'config.yaml.bak-viaeats-{time.strftime("%Y%m%d-%H%M%S")}')
    shutil.copy2(CONFIG, backup)
    changes = []

    approvals = data.setdefault('approvals', {})
    deny = approvals.setdefault('deny', [])
    for pattern in DENY:
        if pattern not in deny:
            deny.append(pattern)
            changes.append(f'approvals.deny += {pattern}')

    hooks = data.setdefault('hooks', {})
    pre = hooks.setdefault('pre_tool_call', [])
    if not any(isinstance(hook, dict) and hook.get('command') == GUARD for hook in pre):
        pre.append({'matcher': 'terminal', 'command': GUARD, 'timeout': 10, 'fail_closed': True})
        changes.append('hooks.pre_tool_call += guard-terminal.py')

    whatsapp = data.setdefault('whatsapp', {})
    if whatsapp.get('unauthorized_dm_behavior') != 'ignore':
        whatsapp['unauthorized_dm_behavior'] = 'ignore'
        changes.append('whatsapp.unauthorized_dm_behavior = ignore')

    allowlist = data.get('command_allowlist') or []
    for entry in list(allowlist):
        if entry in DROP_FROM_ALLOWLIST:
            allowlist.remove(entry)
            changes.append(f'command_allowlist -= {entry}')

    with CONFIG.open('w', encoding='utf-8') as handle:
        yaml.dump(data, handle)

    # Gatewayen fragar aldrig sjalv om nya hooks. Godkannandet ligger har.
    approved = json.loads(ALLOWLIST.read_text()) if ALLOWLIST.exists() else {'approvals': []}
    entry = {'event': 'pre_tool_call', 'command': GUARD}
    if entry not in approved.setdefault('approvals', []):
        approved['approvals'].append(entry)
        ALLOWLIST.write_text(json.dumps(approved, indent=2) + '\n')
        ALLOWLIST.chmod(0o600)
        changes.append('shell-hooks-allowlist += guard-terminal.py')

    print(f'Kopia: {backup}')
    print('\n'.join(changes) if changes else 'Inget att ändra, allt var redan på plats.')


if __name__ == '__main__':
    main()
