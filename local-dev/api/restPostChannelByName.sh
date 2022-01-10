#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

CHANNEL_NAME=${1:-pChannel}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID}}

echo "Creating CHANNEL ${CHANNEL_NAME} in orgId ${RAZEE_ORG_ID}"
RAZEE_URL=${RAZEE_URL:-http://localhost:3333/api/v3/channels}

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"


curl \
-i \
-X POST \
-H "${AUTH_HEADER}" \
-H "Content-Type: application/json" \
-H "org-id: ${RAZEE_ORG_ID}" \
-w "HTTP: %{http_code}" \
--data '{ "name": "'"${CHANNEL_NAME}"'" }' \
${RAZEE_URL}

retVal=$?

echo
echo "Code: $retVal"
