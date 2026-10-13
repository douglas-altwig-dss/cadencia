#!/bin/sh
# Sign-in for the web app, wired from Docker secrets before nginx starts (see README, "Access").
#
#   cadencia_web_htpasswd  people sign in with a user and password (HTTP basic auth);
#   cadencia_api_token     nginx forwards it to the API, which refuses requests without it.
#
# The token is only forwarded behind a password: forwarding it to anyone who reaches this port
# would re-open the very API it protects. Empty or missing files leave the app open, as before.
set -eu

secrets="${CADENCIA_SECRETS_DIR:-/run/secrets}"
out="${CADENCIA_NGINX_DIR:-/etc/nginx/cadencia}"
htpasswd="$secrets/cadencia_web_htpasswd"
token_file="$secrets/cadencia_api_token"

mkdir -p "$out"
rm -f "$out"/*.conf "$out"/htpasswd

if [ -s "$htpasswd" ]; then
  # A bind-mounted secret keeps the host's owner and mode; nginx workers read the file per request,
  # so they get their own copy.
  cp "$htpasswd" "$out/htpasswd"
  if id nginx >/dev/null 2>&1; then chown nginx "$out/htpasswd"; fi
  chmod 600 "$out/htpasswd"
  printf 'auth_basic "Cadência";\nauth_basic_user_file %s;\n' "$out/htpasswd" > "$out/server-auth.conf"
  if [ -s "$token_file" ]; then
    token=$(tr -d '\r\n' < "$token_file")
    case "$token" in
      *[!A-Za-z0-9._~+/=-]*)
        # `$` or a quote would be read by nginx as a variable or end the string.
        echo "cadencia: $token_file has characters nginx cannot carry; use make auth to generate one" >&2
        exit 1
        ;;
    esac
    printf 'proxy_set_header Authorization "Bearer %s";\n' "$token" > "$out/api-auth.conf"
  fi
elif [ -s "$token_file" ]; then
  echo "cadencia: the API token is set but there is no password file; the web app will get 401 until" \
       "secrets/web_htpasswd exists (make auth LOGIN=<nome>)" >&2
fi
