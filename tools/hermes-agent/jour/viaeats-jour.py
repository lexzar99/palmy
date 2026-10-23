#!/usr/bin/env python3
"""viaeats-jour: godkannandegrinden for Hermes jour-andringar.

Hermes far koda sma akuta fixar men aldrig pusha sjalv. Flodet:

  1. Hermes committar i sin arbetskopia och kor `viaeats-jour request "titel"`.
  2. Grinden (det har skriptet) kor som anvandaren viaeats-jour via sudo. Den
     tar emot commitarna som en git-bundle, kontrollerar dem och skickar exakt
     vad som andras till WhatsApp tillsammans med en engangskod.
  3. Koden gar direkt fran grinden till bryggan. Hermes ser den aldrig, och kan
     inte lasa den har anvandarens filer (deploy-nyckel, koder, begaranden).
  4. Anvandaren svarar "GODKANN <id> <kod>". Forst da kan Hermes kora
     `viaeats-jour approve <id> <kod>`, och grinden pushar exakt de commitar som
     visades - aldrig med force, och bara om main inte flyttat sig under tiden.

Det som visades ar det som pushas: grinden raknar fram sammanfattningen ur sin
egen kopia av commitarna, inte ur nagot Hermes beskriver.
"""
import argparse
import fcntl
import fnmatch
import hashlib
import hmac
import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

DEFAULT_CONFIG = Path('/etc/viaeats-jour/jour.env')
ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

# Sokvagar en jour-andring aldrig far rora. Schema och migrationer kraver
# manuell SQL i produktion (annars P2022), och grindens egna filer far inte
# kunna skrivas om av den som grinden vaktar.
DEFAULT_PROTECTED = [
    '_hemligheter/*', '.github/*', '.claude/*',
    'packages/api/prisma/*', 'packages/db/*',
    '*.env', '*.env.*', '.env*', '*/.env*',
    '*.pem', '*.p8', '*.p12', '*.key',
    'RESTO-nummer/*',
    'tools/hermes-agent/jour/*', 'tools/hermes-agent/hooks/*', 'tools/hermes-agent/skills/viaeats-jour/*',
]

SECRET_PATTERNS = [
    re.compile(r'EAA[A-Za-z0-9]{40,}'),                      # Meta
    re.compile(r'\b(sk|rk)_live_[A-Za-z0-9]{16,}'),          # Stripe
    re.compile(r'\bgh[pousr]_[A-Za-z0-9]{30,}'),             # GitHub
    re.compile(r'\bAKIA[0-9A-Z]{16}\b'),                     # AWS
    re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----'),
    re.compile(r'\bxox[abpr]-[A-Za-z0-9-]{10,}'),            # Slack
    re.compile(r'\bre_[A-Za-z0-9]{20,}'),                    # Resend
]


class JourError(Exception):
    pass


# --- konfiguration -------------------------------------------------------------

def load_config():
    # Under sudo ar miljon nollstalld, sa VIAEATS_JOUR_CONFIG kan bara anvandas
    # vid lokala tester. Agenten kan inte peka grinden mot en egen konfig.
    path = DEFAULT_CONFIG
    if not os.environ.get('SUDO_USER') and os.environ.get('VIAEATS_JOUR_CONFIG'):
        path = Path(os.environ['VIAEATS_JOUR_CONFIG'])
    values = {}
    if path.exists():
        for line in path.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('"\'')
    home = Path(values.get('JOUR_HOME', '/var/lib/viaeats-jour'))
    protected = [item.strip() for item in values.get('JOUR_PROTECTED', '').split(',') if item.strip()]
    return {
        'home': home,
        'fetch_url': (values.get('JOUR_REPO_FETCH_URL') or 'https://github.com/lexzar99/palmy.git'),
        'push_url': (values.get('JOUR_REPO_PUSH_URL') or 'git@github.com:lexzar99/palmy.git'),
        'branch': (values.get('JOUR_BRANCH') or 'main'),
        'ssh_key': values.get('JOUR_SSH_KEY', str(home / '.ssh' / 'id_ed25519')),
        'known_hosts': values.get('JOUR_KNOWN_HOSTS', str(home / '.ssh' / 'known_hosts')),
        'bridge': (values.get('HERMES_BRIDGE_SEND_URL') or 'http://127.0.0.1:3000/send'),
        'chat_id': values.get('HERMES_WHATSAPP_CHAT_ID', ''),
        'max_files': int(values.get('JOUR_MAX_FILES', '15')),
        'max_lines': int(values.get('JOUR_MAX_LINES', '400')),
        'ttl_s': int(values.get('JOUR_CODE_TTL_MIN', '30')) * 60,
        'max_attempts': int(values.get('JOUR_MAX_ATTEMPTS', '3')),
        'protected': DEFAULT_PROTECTED + protected,
        'dry_run_push': values.get('JOUR_DRY_RUN_PUSH', '0') == '1',
    }


# --- git -----------------------------------------------------------------------

def mirror(cfg):
    return cfg['home'] / 'mirror.git'


def git(cfg, *args, input_bytes=None, push=False, check=True):
    env = {
        'PATH': '/usr/local/bin:/usr/bin:/bin',
        'HOME': str(cfg['home']),
        'GIT_TERMINAL_PROMPT': '0',
        'LANG': 'C.UTF-8',
    }
    if push:
        env['GIT_SSH_COMMAND'] = (
            f"ssh -i {cfg['ssh_key']} -o IdentitiesOnly=yes -o BatchMode=yes "
            f"-o UserKnownHostsFile={cfg['known_hosts']} -o StrictHostKeyChecking=yes"
        )
    # cwd = grindens hem: Hermes anropar fran sin egen hemkatalog, som
    # viaeats-jour inte far lasa.
    result = subprocess.run(
        ['git', '--git-dir', str(mirror(cfg)), *args],
        input=input_bytes, capture_output=True, env=env, timeout=600, cwd=str(cfg['home']),
    )
    if check and result.returncode != 0:
        raise JourError(f"git {args[0]} misslyckades: {result.stderr.decode('utf-8', 'replace').strip()[:400]}")
    return result.stdout.decode('utf-8', 'replace')


def sync(cfg):
    if not mirror(cfg).exists():
        cfg['home'].mkdir(parents=True, exist_ok=True)
        subprocess.run(['git', 'init', '-q', '--bare', str(mirror(cfg))], check=True, capture_output=True, cwd=str(cfg['home']))
        git(cfg, 'remote', 'add', 'origin', cfg['fetch_url'])
        git(cfg, 'config', 'remote.origin.promisor', 'true')
        git(cfg, 'config', 'remote.origin.partialclonefilter', 'blob:none')
    branch = cfg['branch']
    git(cfg, 'fetch', '-q', '--filter=blob:none', 'origin', f'+refs/heads/{branch}:refs/heads/{branch}')
    return git(cfg, 'rev-parse', f'refs/heads/{branch}').strip()


def is_ancestor(cfg, older, newer):
    return subprocess.run(
        ['git', '--git-dir', str(mirror(cfg)), 'merge-base', '--is-ancestor', older, newer],
        capture_output=True, env={'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': str(cfg['home'])}, cwd=str(cfg['home']),
    ).returncode == 0


# --- begaranden ----------------------------------------------------------------

def requests_dir(cfg):
    path = cfg['home'] / 'requests'
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    return path


def load_request(cfg, request_id):
    if not re.fullmatch(r'[A-Z2-9]{4}', request_id or ''):
        raise JourError('Ogiltigt id. Det ser ut som J7K2.')
    path = requests_dir(cfg) / f'{request_id}.json'
    if not path.exists():
        raise JourError(f'Begäran {request_id} finns inte.')
    return json.loads(path.read_text(encoding='utf-8'))


def save_request(cfg, request):
    path = requests_dir(cfg) / f"{request['id']}.json"
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(request, ensure_ascii=False, indent=2), encoding='utf-8')
    os.chmod(tmp, 0o600)
    tmp.replace(path)


def audit(cfg, event, request, **extra):
    line = {'at': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'event': event, 'id': request.get('id'),
            'tip': request.get('tip'), 'title': request.get('title'), **extra}
    with open(cfg['home'] / 'audit.jsonl', 'a', encoding='utf-8') as handle:
        handle.write(json.dumps(line, ensure_ascii=False) + '\n')


def hash_code(code, salt):
    return hashlib.pbkdf2_hmac('sha256', code.encode(), bytes.fromhex(salt), 200_000).hex()


def whatsapp(cfg, text, kind):
    if not cfg['chat_id']:
        raise JourError('HERMES_WHATSAPP_CHAT_ID saknas i grindens konfig.')
    body = json.dumps({'chatId': cfg['chat_id'], 'message': text, 'payload': {'type': f'jour:{kind}'}}).encode()
    req = urllib.request.Request(cfg['bridge'], data=body, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            if response.status >= 300:
                raise JourError(f'WhatsApp-bryggan svarade HTTP {response.status}')
    except OSError as error:
        raise JourError(f'WhatsApp-bryggan gick inte att nå ({error}).') from error


# --- analys --------------------------------------------------------------------

def analyse(cfg, base, tip):
    files = []
    for line in git(cfg, 'diff', '--name-status', '-M', base, tip).splitlines():
        parts = line.split('\t')
        status = parts[0][0]
        files.append({'status': status, 'path': parts[-1], 'from': parts[1] if status == 'R' else None})
    stats = {}
    for line in git(cfg, 'diff', '--numstat', '-M', base, tip).splitlines():
        added, removed, path = line.split('\t', 2)
        path = re.sub(r'\{[^}]* => ([^}]*)\}', r'\1', path).replace('//', '/').split(' => ')[-1]
        stats[path] = (None if added == '-' else int(added), None if removed == '-' else int(removed))
    for item in files:
        item['added'], item['removed'] = stats.get(item['path'], (None, None))

    added_total = sum(item['added'] or 0 for item in files)
    removed_total = sum(item['removed'] or 0 for item in files)
    commits = git(cfg, 'log', '--format=%h %s', '--max-count=20', f'{base}..{tip}').splitlines()
    patch = git(cfg, 'diff', '-U1', '--no-color', '-M', base, tip)
    return {'files': files, 'added': added_total, 'removed': removed_total, 'commits': commits, 'patch': patch}


def problems(cfg, info):
    found = []
    touched = [item['path'] for item in info['files']] + [item['from'] for item in info['files'] if item['from']]
    for path in touched:
        if any(fnmatch.fnmatch(path, pattern) for pattern in cfg['protected']):
            found.append(f'{path} är skyddad och får inte ändras som jour-fix')
    if len(info['files']) > cfg['max_files']:
        found.append(f"{len(info['files'])} filer är för många för en jour-fix (max {cfg['max_files']})")
    if info['added'] + info['removed'] > cfg['max_lines']:
        found.append(f"{info['added'] + info['removed']} ändrade rader är för mycket för en jour-fix (max {cfg['max_lines']})")
    added_lines = [line[1:] for line in info['patch'].splitlines() if line.startswith('+') and not line.startswith('+++')]
    if any(pattern.search(line) for line in added_lines for pattern in SECRET_PATTERNS):
        found.append('ändringen innehåller något som ser ut som en hemlig nyckel')
    if not info['commits']:
        found.append('inga nya commits jämfört med main')
    return found


def destructive(info):
    """Allt som tar bort: raderade filer och filer dar mer an 20 rader forsvinner netto."""
    deleted = [item['path'] for item in info['files'] if item['status'] == 'D']
    shrunk = [
        f"{item['path']} (−{item['removed']} rader)" for item in info['files']
        if item['status'] != 'D' and item['removed'] and item['removed'] - (item['added'] or 0) > 20
    ]
    return deleted, shrunk


GIT_NOISE = ('index ', '--- ', '+++ ', 'deleted file mode', 'new file mode', 'similarity index', 'rename from', 'rename to', 'old mode', 'new mode')


def readable_patch(patch):
    """Diffen utan git-brus, sa den gar att lasa i mobilen."""
    lines = []
    for line in patch.splitlines():
        if line.startswith('diff --git '):
            lines.append(f"📄 {line.rsplit(' b/', 1)[-1]}")
        elif not line.startswith(GIT_NOISE):
            lines.append(line)
    return '\n'.join(lines)


def describe(cfg, request, info, code):
    sign = {'A': 'ny', 'M': 'ändrad', 'D': 'RADERAS', 'R': 'flyttad', 'C': 'kopierad', 'T': 'ändrad'}
    lines = [f"JOUR-ÄNDRING {request['id']} väntar på ditt OK", f"\"{request['title']}\"", '']
    deleted, shrunk = destructive(info)
    if deleted or shrunk:
        lines.append('⚠️ TAR BORT:')
        lines += [f'• fil: {path}' for path in deleted]
        lines += [f'• {entry}' for entry in shrunk]
        lines.append('')
    lines.append(f"{len(info['files'])} filer (+{info['added']} −{info['removed']}):")
    for item in info['files']:
        counts = '' if item['added'] is None else f" (+{item['added']} −{item['removed']})"
        moved = f" från {item['from']}" if item['from'] else ''
        lines.append(f"• {item['path']}{moved} – {sign.get(item['status'], item['status'])}{counts}")
    lines += ['', 'Commits:'] + [f'• {commit}' for commit in info['commits']]
    full = readable_patch(info['patch'])
    patch = full
    if len(patch) > 2500:
        patch = patch[:2500].rsplit('\n', 1)[0]
        patch += f"\n… ({len(full.splitlines()) - len(patch.splitlines())} rader till)"
    lines += ['', 'Exakt ändring:', patch.strip(), '']
    lines.append(f"Pushas till {cfg['branch']}. viaeats.se och api.viaeats.se deployas automatiskt.")
    verb = 'GODKÄNN RADERING' if deleted or shrunk else 'GODKÄNN'
    lines.append(f"Svara: {verb} {request['id']} {code}")
    lines.append(f"Avbryt: NEJ {request['id']}")
    lines.append(f"Koden gäller i {cfg['ttl_s'] // 60} min.")
    return '\n'.join(lines)


# --- kommandon -----------------------------------------------------------------

def cmd_sync(cfg, _args):
    tip = sync(cfg)
    print(f"Grinden har senaste {cfg['branch']}: {tip[:9]}")


def cmd_request(cfg, args):
    title = ' '.join(args.title).strip()[:120]
    if not title:
        raise JourError('Ange en kort titel: viaeats-jour request "Rätta stavfel i kassan"')
    bundle = sys.stdin.buffer.read()
    if not bundle.startswith(b'# v2 git bundle') and not bundle.startswith(b'# v3 git bundle'):
        raise JourError('Ingen git-bundle på stdin. Kör via viaeats-jour i arbetskopian.')
    base = sync(cfg)
    request_id = ''.join(secrets.choice(ID_ALPHABET) for _ in range(4))
    with tempfile.NamedTemporaryFile(dir=cfg['home'], suffix='.bundle', delete=False) as handle:
        handle.write(bundle)
        bundle_path = handle.name
    try:
        git(cfg, 'bundle', 'verify', bundle_path)
        heads = [line.split(' ', 1) for line in git(cfg, 'bundle', 'list-heads', bundle_path).splitlines() if line.strip()]
        if len(heads) != 1:
            raise JourError('Bundlen ska innehålla exakt en gren.')
        git(cfg, 'fetch', '-q', bundle_path, f'{heads[0][1]}:refs/jour/{request_id}')
    finally:
        os.unlink(bundle_path)
    tip = git(cfg, 'rev-parse', f'refs/jour/{request_id}').strip()
    if not is_ancestor(cfg, base, tip):
        git(cfg, 'update-ref', '-d', f'refs/jour/{request_id}')
        raise JourError(f"Ändringen bygger inte på senaste {cfg['branch']} ({base[:9]}). Hämta origin, rebasa och försök igen.")

    info = analyse(cfg, base, tip)
    found = problems(cfg, info)
    if found:
        git(cfg, 'update-ref', '-d', f'refs/jour/{request_id}')
        raise JourError('Stoppad av grinden:\n- ' + '\n- '.join(found))

    code = f'{secrets.randbelow(10**6):06d}'
    salt = secrets.token_hex(16)
    request = {
        'id': request_id, 'title': title, 'base': base, 'tip': tip, 'status': 'pending',
        'createdAt': int(time.time()), 'expiresAt': int(time.time()) + cfg['ttl_s'],
        'attempts': 0, 'salt': salt, 'codeHash': hash_code(code, salt),
        'files': [item['path'] for item in info['files']], 'deletes': destructive(info)[0],
    }
    save_request(cfg, request)
    whatsapp(cfg, describe(cfg, request, info, code), 'request')
    audit(cfg, 'request', request, files=request['files'])
    deleted, shrunk = destructive(info)
    print(f"Begäran {request_id} skickad till användaren på WhatsApp, med en engångskod som bara användaren ser.")
    print(f"{len(info['files'])} filer (+{info['added']} −{info['removed']}): " + ', '.join(request['files']))
    if deleted or shrunk:
        print('Tar bort: ' + ', '.join(deleted + shrunk) + '. Användaren måste svara GODKÄNN RADERING.')
    print(f"Vänta på svaret. När användaren skrivit 'GODKÄNN {request_id} <kod>', kör: viaeats-jour approve {request_id} <kod>")
    print('Pusha aldrig på något annat sätt.')


def cmd_approve(cfg, args):
    request = load_request(cfg, args.id)
    if request['status'] != 'pending':
        raise JourError(f"Begäran {request['id']} är redan {request['status']}.")
    if time.time() > request['expiresAt']:
        request['status'] = 'expired'
        save_request(cfg, request)
        raise JourError(f"Koden för {request['id']} har gått ut. Skapa en ny begäran.")
    if not re.fullmatch(r'\d{6}', args.code or '') or not hmac.compare_digest(hash_code(args.code, request['salt']), request['codeHash']):
        request['attempts'] += 1
        left = cfg['max_attempts'] - request['attempts']
        if left <= 0:
            request['status'] = 'locked'
            save_request(cfg, request)
            audit(cfg, 'locked', request)
            whatsapp(cfg, f"🔒 JOUR {request['id']} spärrad efter {cfg['max_attempts']} fel koder. Inget pushades.", 'locked')
            raise JourError(f"Fel kod. {request['id']} är nu spärrad.")
        save_request(cfg, request)
        raise JourError(f'Fel kod. {left} försök kvar. Använd exakt den kod användaren skrev.')

    base = sync(cfg)
    tip = request['tip']
    if not is_ancestor(cfg, base, tip):
        request['status'] = 'stale'
        save_request(cfg, request)
        raise JourError(f"{cfg['branch']} har ändrats sedan begäran skapades. Inget pushades. Rebasa och skapa en ny begäran.")
    push_args = ['push', '--porcelain']
    if cfg['dry_run_push']:
        push_args.append('--dry-run')
    git(cfg, *push_args, cfg['push_url'], f"{tip}:refs/heads/{cfg['branch']}", push=True)
    request['status'] = 'pushed' if not cfg['dry_run_push'] else 'dry-run'
    request['pushedAt'] = int(time.time())
    save_request(cfg, request)
    git(cfg, 'update-ref', f"refs/heads/{cfg['branch']}", tip, check=False)
    audit(cfg, request['status'], request)
    note = ' (provkörning, inget ändrades på GitHub)' if cfg['dry_run_push'] else ''
    whatsapp(cfg, f"✅ JOUR {request['id']} pushad till {cfg['branch']}{note} ({tip[:9]}). Deployen startar nu. Vill du ångra: skriv \"ångra {request['id']}\".", 'pushed')
    print(f"Pushad: {request['id']} {tip[:9]} -> {cfg['branch']}{note}")


def cmd_deny(cfg, args):
    request = load_request(cfg, args.id)
    if request['status'] != 'pending':
        raise JourError(f"Begäran {request['id']} är redan {request['status']}.")
    request['status'] = 'cancelled'
    save_request(cfg, request)
    git(cfg, 'update-ref', '-d', f"refs/jour/{request['id']}", check=False)
    audit(cfg, 'cancelled', request)
    whatsapp(cfg, f"JOUR {request['id']} avbruten. Inget pushades.", 'cancelled')
    print(f"{request['id']} avbruten.")


def cmd_status(cfg, args):
    rows = []
    for path in sorted(requests_dir(cfg).glob('*.json')):
        request = json.loads(path.read_text(encoding='utf-8'))
        if args.all or request['status'] == 'pending':
            rows.append(f"{request['id']}  {request['status']:<9} {time.strftime('%d/%m %H:%M', time.localtime(request['createdAt']))}  {request['tip'][:9]}  {request['title']}")
    print('\n'.join(rows) if rows else 'Inga väntande jour-begäranden.')


def cmd_info(cfg, args):
    request = load_request(cfg, args.id)
    public = {key: value for key, value in request.items() if key not in ('salt', 'codeHash')}
    print(json.dumps(public, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(prog='viaeats-jour', description='Godkännandegrind för Hermes jour-ändringar.')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('sync', help='hämta senaste main till grinden')
    request = sub.add_parser('request', help='begär godkännande (bundle på stdin, via wrappern)')
    request.add_argument('title', nargs='+')
    approve = sub.add_parser('approve', help='pusha efter användarens kod')
    approve.add_argument('id')
    approve.add_argument('code')
    deny = sub.add_parser('deny', help='avbryt en begäran')
    deny.add_argument('id')
    status = sub.add_parser('status', help='väntande begäranden')
    status.add_argument('--all', action='store_true')
    info = sub.add_parser('info', help='detaljer om en begäran')
    info.add_argument('id')
    args = parser.parse_args()

    cfg = load_config()
    cfg['home'].mkdir(parents=True, exist_ok=True)
    with open(cfg['home'] / '.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            {'sync': cmd_sync, 'request': cmd_request, 'approve': cmd_approve, 'deny': cmd_deny,
             'status': cmd_status, 'info': cmd_info}[args.command](cfg, args)
        except JourError as error:
            print(f'viaeats-jour: {error}', file=sys.stderr)
            sys.exit(1)


if __name__ == '__main__':
    main()
