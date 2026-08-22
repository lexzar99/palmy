#!/usr/bin/env python3
"""
Genererar QR-koden som gör en fabriksåterställd platta till en låst
ViaEats-terminal — utan kabel.

Så här används den: fabriksåterställ plattan, tryck SEX gånger på den första
välkomstskärmen, och scanna koden. Android laddar då ner partner-appen från
vår server, verifierar att den är signerad med rätt nyckel, och sätter den som
device owner. Lockdownen lägger sig på plats vid första starten.

Varför den vägen finns: Sunmis egen fjärrhantering kan spärra USB-felsökning,
och då är adb inte tillgängligt. Provisionering vid uppstart bryr sig varken
om kabel eller adb — och fabriksåterställningen rensar samtidigt bort Sunmis
device admin, som annars blockerar vår egen.

  python3 make-provisioning-qr.py --apk <sökväg> [--wifi-ssid X --wifi-password Y]
"""

import argparse
import base64
import json
import pathlib
import re
import subprocess
import sys
from typing import Optional

DEFAULT_DOWNLOAD_URL = "https://api.viaeats.se/api/terminal-download/provision/sunmi.apk"
ADMIN_COMPONENT = (
    "com.matgo.restaurant/"
    "com.matgo.restaurant.nativeapp.dpc.PartnerDeviceAdminReceiver"
)


def find_apksigner() -> Optional[str]:
    for base in pathlib.Path("/opt/homebrew/share/android-commandlinetools/build-tools").glob("*"):
        candidate = base / "apksigner"
        if candidate.is_file():
            return str(candidate)
    return None


def signature_checksum(apk: pathlib.Path) -> str:
    """
    Androids PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM: SHA-256 över
    signeringscertifikatet, base64url utan padding.

    Läses ur APK:n i stället för att hårdkodas — hårdkodad checksumma som inte
    matchar filen ger ett obegripligt avbrott mitt i provisioneringen.
    """
    signer = find_apksigner()
    if not signer:
        sys.exit("apksigner hittades inte — kan inte läsa signaturen ur APK:n.")
    out = subprocess.run(
        [signer, "verify", "--print-certs", str(apk)],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        sys.exit(f"apksigner kunde inte läsa {apk.name}:\n{out.stderr.strip()}")
    match = re.search(r"certificate SHA-256 digest:\s*([0-9a-fA-F]{64})", out.stdout)
    if not match:
        sys.exit("Hittade ingen SHA-256 för signeringscertifikatet i APK:n.")
    return base64.urlsafe_b64encode(bytes.fromhex(match.group(1))).decode().rstrip("=")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apk", required=True, help="Den signerade partner-APK:n")
    parser.add_argument("--download-url", default=DEFAULT_DOWNLOAD_URL)
    parser.add_argument("--wifi-ssid", help="Utelämnas: plattan frågar efter nät i guiden")
    parser.add_argument("--wifi-password")
    parser.add_argument("--out", default="tools/terminals/provisioning-qr.png")
    args = parser.parse_args()

    apk = pathlib.Path(args.apk)
    if not apk.is_file():
        sys.exit(f"APK saknas: {apk}")

    checksum = signature_checksum(apk)

    payload = {
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": ADMIN_COMPONENT,
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": checksum,
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": args.download_url,
        # Plattorna har inget känsligt lokalt — kryptering skulle bara lägga
        # på flera minuter och en omstart per enhet vid utrullning.
        "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": True,
        "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": True,
    }

    if args.wifi_ssid:
        payload["android.app.extra.PROVISIONING_WIFI_SSID"] = args.wifi_ssid
        if args.wifi_password:
            payload["android.app.extra.PROVISIONING_WIFI_PASSWORD"] = args.wifi_password
            payload["android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE"] = "WPA"

    try:
        import segno
    except ImportError:
        sys.exit("segno saknas. Installera med: pip install segno")

    data = json.dumps(payload, separators=(",", ":"))
    out_path = pathlib.Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    # Hög felkorrigering: koden scannas av en plattas kamera, ofta i dålig
    # restaurangbelysning och mot en skärm som speglar.
    segno.make(data, error="h").save(str(out_path), scale=8, border=4)

    print(f"APK:            {apk.name}")
    print(f"Signaturcheck:  {checksum}")
    print(f"Nedladdning:    {args.download_url}")
    print(f"Wi-Fi i koden:  {args.wifi_ssid or '— (väljs i guiden)'}")
    print(f"QR sparad:      {out_path}")


if __name__ == "__main__":
    main()
