import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export type SwishTlsFixtures = {
  leaf: string;
  intermediate: string;
  root: string;
  serverRoot: string;
  key: string;
  wrongKey: string;
  fullChain: string;
  issuerChain: string;
  cleanup: () => void;
};

/** Real X.509 fixtures, generated outside the repo so no test private key is committed. */
export function createSwishTlsFixtures(): SwishTlsFixtures {
  const directory = mkdtempSync(join(tmpdir(), 'viaeats-swish-tls-'));
  const file = (name: string) => join(directory, name);
  const openssl = (...args: string[]) => {
    const result = spawnSync('openssl', args, { encoding: 'utf8' });
    if (result.status !== 0) {
      rmSync(directory, { recursive: true, force: true });
      throw new Error(`Kunde inte skapa Swish TLS-testfixture: ${String(result.stderr || '').trim()}`);
    }
  };

  openssl(
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', file('root-key.pem'), '-out', file('root.pem'), '-days', '3650',
    '-subj', '/CN=ViaEats-Test-Root',
    '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
  );
  openssl(
    'req', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', file('intermediate-key.pem'), '-out', file('intermediate.csr'),
    '-subj', '/CN=ViaEats-Test-Intermediate',
    '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
  );
  openssl(
    'x509', '-req', '-in', file('intermediate.csr'),
    '-CA', file('root.pem'), '-CAkey', file('root-key.pem'), '-CAcreateserial',
    '-out', file('intermediate.pem'), '-days', '3000', '-copy_extensions', 'copy',
  );
  openssl(
    'req', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', file('leaf-key.pem'), '-out', file('leaf.csr'),
    '-subj', '/CN=1231234567',
    '-addext', 'basicConstraints=critical,CA:FALSE',
    '-addext', 'keyUsage=critical,digitalSignature,keyEncipherment',
    '-addext', 'extendedKeyUsage=clientAuth',
  );
  openssl(
    'x509', '-req', '-in', file('leaf.csr'),
    '-CA', file('intermediate.pem'), '-CAkey', file('intermediate-key.pem'), '-CAcreateserial',
    '-out', file('leaf.pem'), '-days', '2000', '-copy_extensions', 'copy',
  );
  openssl(
    'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048',
    '-out', file('wrong-key.pem'),
  );
  openssl(
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', file('server-root-key.pem'), '-out', file('server-root.pem'), '-days', '3650',
    '-subj', '/CN=ViaEats-Test-Server-Root',
    '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
  );

  const read = (name: string) => readFileSync(file(name), 'utf8');
  const leaf = read('leaf.pem');
  const intermediate = read('intermediate.pem');
  const root = read('root.pem');
  return {
    leaf,
    intermediate,
    root,
    serverRoot: read('server-root.pem'),
    key: read('leaf-key.pem'),
    wrongKey: read('wrong-key.pem'),
    fullChain: [leaf, intermediate, root].join('\n'),
    issuerChain: [intermediate, root].join('\n'),
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}
