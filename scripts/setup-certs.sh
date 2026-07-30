#!/usr/bin/env bash
# Lager et lokalt HTTPS-sertifikat for maskinens adresse i hjemmenettverket.
# Uten dette nekter Safari på iPhone å gi appen tilgang til kameraet.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert mangler. Installer det først:"
  echo ""
  echo "    brew install mkcert nss"
  echo ""
  exit 1
fi

LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
if [ -z "$LAN_IP" ]; then
  echo "Fant ikke maskinens IP-adresse. Er du koblet til wifi?"
  exit 1
fi

mkdir -p certs

# Å legge CA-en i systemets nøkkelring krever passordet ditt. Går det ikke,
# skal vi likevel lage sertifikatet: telefonene trenger det uansett, og
# hovedskjermen viser bare en advarsel man kan klikke seg forbi.
if mkcert -install 2>/dev/null; then
  TILLIT="ja"
else
  TILLIT="nei"
fi

mkcert -cert-file certs/cert.pem -key-file certs/key.pem \
  "$LAN_IP" localhost 127.0.0.1 ::1

if [ "$TILLIT" = "nei" ]; then
  echo ""
  echo "MERK: CA-en ble ikke lagt i systemets nøkkelring — det krever passord."
  echo "Kjør denne selv én gang, så slipper du advarsel i nettleseren her:"
  echo ""
  echo "    mkcert -install"
  echo ""
fi

echo ""
echo "Sertifikat laget for $LAN_IP."
echo ""
echo "På hver iPhone, én gang:"
echo "  1. Kjør 'mkcert -CAROOT' og send rootCA.pem til telefonen (AirDrop)."
echo "  2. Åpne den, godta profilen i Innstillinger > Profil lastet ned."
echo "  3. Innstillinger > Generelt > Om > Sertifikattillit: slå på mkcert."
echo ""
echo "Start så appen med: npm run dev"
echo "Telefonene går til: https://$LAN_IP:3000"
