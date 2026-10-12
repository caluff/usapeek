#!/bin/sh
set -eu

tls_directory=/etc/postgresql-custom/tls
mkdir -p "$tls_directory"

if [ ! -s "$tls_directory/server.key" ] || [ ! -s "$tls_directory/server.crt" ]; then
  umask 077
  openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
    -subj /CN=localhost \
    -addext subjectAltName=DNS:localhost,IP:127.0.0.1 \
    -keyout "$tls_directory/server.key" \
    -out "$tls_directory/server.crt"
fi

chown postgres:postgres "$tls_directory/server.key" "$tls_directory/server.crt"
chmod 600 "$tls_directory/server.key"
chmod 644 "$tls_directory/server.crt"

exec /usr/local/bin/docker-entrypoint.sh "$@"
