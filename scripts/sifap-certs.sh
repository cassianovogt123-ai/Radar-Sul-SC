#!/usr/bin/env bash
# Inclui no APK a cadeia de certificados da Defesa Civil SC (ICP-Brasil),
# que o Android não reconhece por padrão. Se nada puder ser baixado, o app
# usa só os certificados do sistema.
set -u
RAW=android/app/src/main/res/raw
XML=android/app/src/main/res/xml/network_security_config.xml
HOST=sifap.defesacivil.sc.gov.br
TMP=$(mktemp -d)
mkdir -p "$RAW"
: > "$TMP/all.pem"

openssl s_client -showcerts -connect "$HOST:443" -servername "$HOST" </dev/null 2>/dev/null \
  | awk '/BEGIN CERTIFICATE/,/END CERTIFICATE/' >> "$TMP/all.pem" || true

for v in v5 v10 v11 v12; do
  if curl -fsSL --max-time 25 "http://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasil${v}.crt" -o "$TMP/$v.crt"; then
    openssl x509 -in "$TMP/$v.crt" -inform DER -outform PEM >> "$TMP/all.pem" 2>/dev/null \
      || openssl x509 -in "$TMP/$v.crt" -outform PEM >> "$TMP/all.pem" 2>/dev/null || true
  fi
done

COUNT=$(grep -c "BEGIN CERTIFICATE" "$TMP/all.pem" || true)
echo "Certificados obtidos para $HOST: $COUNT"

if [ "${COUNT:-0}" -gt 0 ]; then
  cp "$TMP/all.pem" "$RAW/sifap_ca.pem"
  cat > "$XML" <<XML
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
    <domain-config>
        <domain includeSubdomains="true">defesacivil.sc.gov.br</domain>
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
            <certificates src="@raw/sifap_ca" />
        </trust-anchors>
    </domain-config>
</network-security-config>
XML
fi
