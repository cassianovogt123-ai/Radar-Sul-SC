#!/usr/bin/env bash
# Inclui no APK a cadeia de certificados da Defesa Civil SC (o servidor não envia a
# intermediária, e o Android não a busca sozinho; ICP-Brasil incluída por segurança),
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

# O servidor só envia o certificado final; baixa as autoridades intermediárias (AIA)
# para o app continuar funcionando quando o certificado do site for renovado.
cur="$TMP/cur.pem"
awk '/BEGIN CERTIFICATE/{n++} n==1' "$TMP/all.pem" > "$cur"
for i in 1 2 3 4; do
  url=$(openssl x509 -in "$cur" -noout -text 2>/dev/null | grep -o 'CA Issuers - URI:[^ ]*' | head -1 | sed 's/CA Issuers - URI://')
  [ -z "$url" ] && break
  echo "Intermediária: $url"
  curl -fsSL --max-time 25 "$url" -o "$TMP/int$i" || break
  if openssl x509 -in "$TMP/int$i" -inform DER -outform PEM -out "$TMP/int$i.pem" 2>/dev/null \
     || openssl x509 -in "$TMP/int$i" -outform PEM -out "$TMP/int$i.pem" 2>/dev/null \
     || openssl pkcs7 -in "$TMP/int$i" -inform DER -print_certs -out "$TMP/int$i.pem" 2>/dev/null; then
    cat "$TMP/int$i.pem" >> "$TMP/all.pem"
    awk '/BEGIN CERTIFICATE/{n++} n==1' "$TMP/int$i.pem" > "$cur"
  else
    break
  fi
done

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
