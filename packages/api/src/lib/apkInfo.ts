import { inflateRawSync } from 'zlib';
import { createHash } from 'crypto';

/**
 * Läser versionCode/versionName direkt ur en uppladdad APK.
 *
 * Varför inte lita på ett formulärfält: Android uppgraderar BARA till en högre
 * versionCode. Skriver någon fel siffra i admin blir resultatet att plattorna
 * antingen inte ser uppdateringen alls, eller laddar ner den och möts av
 * "Appen är inte installerad" — ett fel som ser ut som ett signeringsproblem
 * och kostar en kväll att felsöka. Servern läser därför sanningen ur filen.
 *
 * Ingen tredjepartsberoende: en APK är en zip, och AndroidManifest.xml i den
 * är Androids binära XML (AXML). Båda formaten är stabila och små att läsa.
 */

export interface ApkInfo {
  packageName: string;
  versionCode: number;
  versionName: string;
  sha256: string;
  sizeBytes: number;
}

// ---------------------------------------------------------------- zip

/** Hämtar en fil ur zip-arkivet via central directory (inte local headers, som
 *  kan ha okända storlekar när arkivet skrivits strömmande). */
function readZipEntry(zip: Buffer, wanted: string): Buffer | null {
  // End of Central Directory: signatur 0x06054b50, ligger sist men kan ha upp
  // till 64 KB kommentar efter sig.
  const maxBack = Math.min(zip.length, 66 * 1024);
  let eocd = -1;
  for (let i = zip.length - 22; i >= zip.length - maxBack && i >= 0; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Filen är inte ett giltigt zip/APK-arkiv');

  let entries = zip.readUInt16LE(eocd + 10);
  let cdOffset = zip.readUInt32LE(eocd + 16);

  // Zip64: fälten står på 0xffff/0xffffffff och de riktiga värdena ligger i
  // zip64-posten. Stora APK:er (>4 GB) är orealistiska här, men en trunkerad
  // uppladdning kan råka se ut så — bättre att säga ifrån än att läsa skräp.
  if (entries === 0xffff || cdOffset === 0xffffffff) {
    throw new Error('Zip64-arkiv stöds inte — ladda upp en vanlig APK');
  }

  let p = cdOffset;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > zip.length || zip.readUInt32LE(p) !== 0x02014b50) break;
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString('utf8');

    if (name === wanted) {
      // Local header har egna (möjligt andra) längder för namn/extra.
      if (zip.readUInt32LE(localOffset) !== 0x04034b50) {
        throw new Error('Trasig zip: local header saknas');
      }
      const lNameLen = zip.readUInt16LE(localOffset + 26);
      const lExtraLen = zip.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const raw = zip.subarray(dataStart, dataStart + compSize);
      if (method === 0) return Buffer.from(raw);
      if (method === 8) return inflateRawSync(raw);
      throw new Error(`Zip-komprimering ${method} stöds inte`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

// ---------------------------------------------------------------- AXML

const RES_STRING_POOL = 0x0001;
const RES_XML_START_ELEMENT = 0x0102;
const UTF8_FLAG = 1 << 8;

/** Androids strängpool: antingen UTF-16LE eller (vanligare i nya APK:er) UTF-8,
 *  båda med längdprefix som kan vara ett eller två bytes/enheter. */
function parseStringPool(buf: Buffer, start: number): string[] {
  const stringCount = buf.readUInt32LE(start + 8);
  const flags = buf.readUInt32LE(start + 16);
  const stringsStart = buf.readUInt32LE(start + 20);
  const isUtf8 = (flags & UTF8_FLAG) !== 0;
  const out: string[] = [];

  for (let i = 0; i < stringCount; i++) {
    const offset = buf.readUInt32LE(start + 28 + i * 4);
    let p = start + stringsStart + offset;
    if (isUtf8) {
      // Två längder: teckenantal sedan bytelängd. Värden >0x7f använder två
      // bytes där den höga biten är en fortsättningsmarkering.
      let charLen = buf.readUInt8(p++);
      if (charLen & 0x80) charLen = ((charLen & 0x7f) << 8) | buf.readUInt8(p++);
      let byteLen = buf.readUInt8(p++);
      if (byteLen & 0x80) byteLen = ((byteLen & 0x7f) << 8) | buf.readUInt8(p++);
      out.push(buf.subarray(p, p + byteLen).toString('utf8'));
    } else {
      let charLen = buf.readUInt16LE(p); p += 2;
      if (charLen & 0x8000) { charLen = ((charLen & 0x7fff) << 16) | buf.readUInt16LE(p); p += 2; }
      out.push(buf.subarray(p, p + charLen * 2).toString('utf16le'));
    }
  }
  return out;
}

interface AxmlAttr { raw: number; type: number; data: number }

/** Plockar attributen på <manifest>-taggen ur den binära XML:en, tillsammans
 *  med strängpoolen som attributvärdena pekar in i. */
function parseManifestAttributes(axml: Buffer): { attrs: Map<string, AxmlAttr>; strings: string[] } {
  let strings: string[] = [];
  // Filhuvud: type u16, headerSize u16, size u32 — sedan chunkar på rad.
  let p = axml.readUInt16LE(2);

  while (p + 8 <= axml.length) {
    const type = axml.readUInt16LE(p);
    const size = axml.readUInt32LE(p + 4);
    if (size <= 0) break;

    if (type === RES_STRING_POOL) {
      strings = parseStringPool(axml, p);
    } else if (type === RES_XML_START_ELEMENT) {
      const headerSize = axml.readUInt16LE(p + 2);
      const nameIdx = axml.readUInt32LE(p + headerSize + 4);
      const attrStart = axml.readUInt16LE(p + headerSize + 8);
      const attrSize = axml.readUInt16LE(p + headerSize + 10);
      const attrCount = axml.readUInt16LE(p + headerSize + 12);

      if (strings[nameIdx] === 'manifest') {
        const attrs = new Map<string, AxmlAttr>();
        const base = p + headerSize + attrStart;
        for (let i = 0; i < attrCount; i++) {
          const a = base + i * attrSize;
          const attrName = strings[axml.readUInt32LE(a + 4)];
          attrs.set(attrName, {
            raw: axml.readInt32LE(a + 8),
            type: axml.readUInt8(a + 15),
            data: axml.readInt32LE(a + 16),
          });
        }
        return { attrs, strings };
      }
    }
    p += size;
  }
  throw new Error('Hittade ingen <manifest>-tagg i APK:ns AndroidManifest.xml');
}

const TYPE_STRING = 0x03;

export function readApkInfo(apk: Buffer): ApkInfo {
  const manifest = readZipEntry(apk, 'AndroidManifest.xml');
  if (!manifest) throw new Error('AndroidManifest.xml saknas — filen är ingen APK');

  const { attrs, strings: manifestStrings } = parseManifestAttributes(manifest);

  const pkg = attrs.get('package');
  const vc = attrs.get('versionCode');
  const vn = attrs.get('versionName');
  if (!vc) throw new Error('APK:n saknar versionCode');

  // versionCode är alltid ett heltal; versionName är en sträng och ligger då i
  // rawValue-index mot strängpoolen.
  const versionCode = vc.type === TYPE_STRING ? Number.NaN : vc.data;
  if (!Number.isFinite(versionCode) || versionCode <= 0) {
    throw new Error('Kunde inte läsa versionCode ur APK:n');
  }

  const readStr = (a?: AxmlAttr) =>
    a ? (a.raw >= 0 ? manifestStrings[a.raw] : (a.type === TYPE_STRING ? manifestStrings[a.data] : String(a.data))) : '';

  return {
    packageName: readStr(pkg) || '',
    versionCode,
    versionName: readStr(vn) || String(versionCode),
    sha256: createHash('sha256').update(apk).digest('hex'),
    sizeBytes: apk.length,
  };
}
