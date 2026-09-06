#!/usr/bin/env bash
# ==============================================================================
# SnapHost CLI Deployment Script (Bash for Linux / macOS)
# ==============================================================================
set -e

PATH_ARG="${1:-.}"
SLUG_ARG=""
TTL_ARG="24h"
TYPE_ARG="auto"
PASSWORD_ARG=""
SERVER="{{SERVER_URL}}"
TOKEN="${DEPLOY_TOKEN}"

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --slug) SLUG_ARG="$2"; shift ;;
        --ttl) TTL_ARG="$2"; shift ;;
        --type) TYPE_ARG="$2"; shift ;;
        --password) PASSWORD_ARG="$2"; shift ;;
        --token) TOKEN="$2"; shift ;;
    esac
    shift
done

if [ -z "$TOKEN" ]; then
    read -p "Bitte DEPLOY_TOKEN / API-Key eingeben: " TOKEN
fi

if [[ "$PATH_ARG" == *.html || "$PATH_ARG" == *.htm ]]; then
    UPLOAD_FILE="$PATH_ARG"
else
    UPLOAD_FILE="/tmp/deploy_$RANDOM.zip"
    echo "Packe $PATH_ARG in Archiv..."
    (cd "$PATH_ARG" && zip -q -r "$UPLOAD_FILE" . -x "node_modules/*" ".git/*")
fi

echo "Lade zu $SERVER hoch..."
RESPONSE=$(curl -sS -X POST "$SERVER/api/deploy" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$UPLOAD_FILE" \
  -F "slug=$SLUG_ARG" \
  -F "ttl=$TTL_ARG" \
  -F "type=$TYPE_ARG" \
  -F "password=$PASSWORD_ARG")

if [[ "$UPLOAD_FILE" != "$PATH_ARG" && -f "$UPLOAD_FILE" ]]; then
    rm -f "$UPLOAD_FILE"
fi

echo "$RESPONSE"
