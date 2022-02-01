#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

CHANNEL_UUID=${1:-pChannelId}
VER_NAME=${2:-pVerName}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID}}

echo "Creating VERSION ${VER_NAME} on channel ${CHANNEL_UUID} in orgId ${RAZEE_ORG_ID}"
RAZEE_URL=${RAZEE_URL:-http://localhost:3333/api/v3/channels/${CHANNEL_UUID}/versions}

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"


curl \
-i \
-X POST \
-H "${AUTH_HEADER}" \
-H "Content-Type: application/json" \
-H "org-id: ${RAZEE_ORG_ID}" \
-w "HTTP: %{http_code}" \
--data '{ "name": "'"${VER_NAME}"'", "type": "'"application/yaml"'", "content": "'"dummycontent"'" }' \
${RAZEE_URL}

retVal=$?

echo
echo "Code: $retVal"
