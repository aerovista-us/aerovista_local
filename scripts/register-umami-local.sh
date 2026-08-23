#!/usr/bin/env bash
set -euo pipefail

UMAMI_HOST="${UMAMI_HOST:-https://stats.aerocoreos.com}"
UMAMI_USER="${UMAMI_USER:-admin}"
UMAMI_HOST="${UMAMI_HOST%/}"
OUT_FILE="${OUT_FILE:-umami-local-websites.json}"

for cmd in curl python3; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Missing required command: $cmd" >&2
    exit 1
  }
done

echo "AeroVista Local -> Umami registration"
echo "Server: $UMAMI_HOST"
echo "User:   $UMAMI_USER"
echo

if [[ -z "${UMAMI_PASSWORD:-}" ]]; then
  read -r -s -p "Umami password: " UMAMI_PASSWORD
  echo
fi

login_json="$({ UMAMI_USER="$UMAMI_USER" UMAMI_PASSWORD="$UMAMI_PASSWORD" python3 - <<'PY'
import json, os
print(json.dumps({
    "username": os.environ["UMAMI_USER"],
    "password": os.environ["UMAMI_PASSWORD"],
}))
PY
})"

login_response="$(curl -fsS \
  -X POST "$UMAMI_HOST/api/auth/login" \
  -H 'Content-Type: application/json' \
  --data "$login_json")"

TOKEN="$(LOGIN_RESPONSE="$login_response" python3 - <<'PY'
import json, os, sys
try:
    data = json.loads(os.environ["LOGIN_RESPONSE"])
except Exception as e:
    print(f"Invalid login response: {e}", file=sys.stderr)
    sys.exit(1)
token = data.get("token")
if not token:
    print("Umami login did not return a token.", file=sys.stderr)
    sys.exit(1)
print(token)
PY
)"

unset UMAMI_PASSWORD login_json login_response

existing_response="$(curl -fsS \
  "$UMAMI_HOST/api/websites?pageSize=100" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json')"

# name|domain
TARGETS=(
  "AeroVista Local - CDA Fair Day|cdafair.aerovista.us"
  "AeroVista Local - Lake Day|lakeday.aerovista.us"
  "AeroVista Local - CDA Tonight|cdatonight.aerovista.us"
  "AeroVista Local - FireWatch|aerovista-us.github.io"
  "AeroVista Local - LotScope|lotscope.aerovista.us"
  "AeroVista Local - TrustScope|trustscope.aerovista.us"
)

results='[]'

for row in "${TARGETS[@]}"; do
  name="${row%%|*}"
  domain="${row#*|}"
  short_name="${name#AeroVista Local - }"

  match_json="$(EXISTING_RESPONSE="$existing_response" TARGET_NAME="$name" TARGET_DOMAIN="$domain" SHORT_NAME="$short_name" python3 - <<'PY'
import json, os
raw = json.loads(os.environ["EXISTING_RESPONSE"])
items = raw.get("data", raw if isinstance(raw, list) else [])
name = os.environ["TARGET_NAME"]
domain = os.environ["TARGET_DOMAIN"]
short = os.environ["SHORT_NAME"].lower()
match = None
for item in items:
    if item.get("name") == name:
        match = item
        break
for item in items:
    if match is None and item.get("domain") == domain and short in str(item.get("name", "")).lower():
        match = item
        break
print(json.dumps(match or {}))
PY
)"

  website_id="$(MATCH_JSON="$match_json" python3 - <<'PY'
import json, os
print(json.loads(os.environ["MATCH_JSON"]).get("id", ""))
PY
)"

  if [[ -n "$website_id" ]]; then
    status="existing"
    printf 'EXISTS  %-42s [%s]\n' "$name" "$website_id"
  else
    create_json="$(TARGET_NAME="$name" TARGET_DOMAIN="$domain" python3 - <<'PY'
import json, os
print(json.dumps({"name": os.environ["TARGET_NAME"], "domain": os.environ["TARGET_DOMAIN"]}))
PY
)"

    created="$(curl -fsS \
      -X POST "$UMAMI_HOST/api/websites" \
      -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/json' \
      --data "$create_json")"

    website_id="$(CREATED="$created" python3 - <<'PY'
import json, os, sys
obj = json.loads(os.environ["CREATED"])
wid = obj.get("id")
if not wid:
    print("Website creation response did not contain an id.", file=sys.stderr)
    sys.exit(1)
print(wid)
PY
)"

    status="created"
    printf 'CREATED %-42s [%s]\n' "$name" "$website_id"

    existing_response="$(EXISTING_RESPONSE="$existing_response" CREATED="$created" python3 - <<'PY'
import json, os
raw = json.loads(os.environ["EXISTING_RESPONSE"])
created = json.loads(os.environ["CREATED"])
if isinstance(raw, list):
    raw.append(created)
else:
    raw.setdefault("data", []).append(created)
print(json.dumps(raw))
PY
)"
  fi

  tracker="<script defer src=\"$UMAMI_HOST/script.js\" data-website-id=\"$website_id\"></script>"

  results="$(RESULTS="$results" TARGET_NAME="$name" TARGET_DOMAIN="$domain" WEBSITE_ID="$website_id" STATUS="$status" TRACKER="$tracker" python3 - <<'PY'
import json, os
rows = json.loads(os.environ["RESULTS"])
rows.append({
    "name": os.environ["TARGET_NAME"],
    "domain": os.environ["TARGET_DOMAIN"],
    "websiteId": os.environ["WEBSITE_ID"],
    "status": os.environ["STATUS"],
    "tracker": os.environ["TRACKER"],
})
print(json.dumps(rows))
PY
)"
done

RESULTS="$results" python3 - "$OUT_FILE" <<'PY'
import json, os, sys
path = sys.argv[1]
rows = json.loads(os.environ["RESULTS"])
with open(path, "w", encoding="utf-8") as f:
    json.dump(rows, f, indent=2)
    f.write("\n")
PY

unset TOKEN existing_response results

echo
echo "Done. Website IDs and tracker snippets saved to: $OUT_FILE"
echo "No password or API token was written to disk."
