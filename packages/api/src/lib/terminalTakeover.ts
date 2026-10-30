/**
 * v2 tar över plattan från v1 (se routes/terminal.ts). Ren logik, testad i
 * contracts/terminalTakeover.test.ts. Klientens version skickas som
 * "versionName+versionCode", t.ex. "26.08.21.2+90" (v1) eller "2.0.0+200" (v2).
 */
type ClientInfo = { version?: string };

export const V2_MIN_VERSION_CODE = 200;

export function clientVersionCode(version?: string | null): number | null {
  const match = /\+(\d+)\s*$/.exec(String(version ?? ''));
  return match ? Number(match[1]) : null;
}

export function isLegacyAppOnTakenOverDevice(device: { appVersion?: string | null } | null, client?: ClientInfo): boolean {
  if (!device) return false;
  const stored = clientVersionCode(device.appVersion);
  const incoming = clientVersionCode(client?.version);
  return stored != null && stored >= V2_MIN_VERSION_CODE && incoming != null && incoming < V2_MIN_VERSION_CODE;
}

export function isTakeoverByV2(device: { appVersion?: string | null } | null, client?: ClientInfo): boolean {
  const incoming = clientVersionCode(client?.version);
  if (incoming == null || incoming < V2_MIN_VERSION_CODE) return false;
  const stored = clientVersionCode(device?.appVersion);
  return stored == null || stored < V2_MIN_VERSION_CODE;
}

/**
 * En v2-release (versionCode ≥ 200, eget paketnamn) erbjuds bara plattor som
 * redan kör v2. Plattor med v1 byts ut kontrollerat (via kabel), så de ska inte
 * få en uppdateringsruta som startar bytet på egen hand.
 */
export function offersReleaseToInstalled(releaseVersionCode: number, installedVersionCode: number): boolean {
  if (releaseVersionCode <= installedVersionCode) return false;
  return !(releaseVersionCode >= V2_MIN_VERSION_CODE && installedVersionCode < V2_MIN_VERSION_CODE);
}
