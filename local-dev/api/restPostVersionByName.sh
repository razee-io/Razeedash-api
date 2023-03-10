#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

CHANNEL_UUID=${1:-pChannelId}
VER_NAME=${2:-pVerName}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID}}

RAZEE_REST_URL=${RAZEE_REST_URL:-http://localhost:3333/api/v3}

echo "Creating VERSION ${VER_NAME} on channel ${CHANNEL_UUID} in orgId ${RAZEE_ORG_ID} by POST to ${RAZEE_REST_URL}"

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"

curl \
-X POST \
-H "${AUTH_HEADER}" \
-H "Content-Type: application/json" \
-H "org-id: ${RAZEE_ORG_ID}" \
-w "HTTP: %{http_code}" \
--data '{ "name": "'"${VER_NAME}"'", "type": "'"application/yaml"'", "content": "'"dummycontent"'" }' \
${RAZEE_REST_URL}/channels/${CHANNEL_UUID}/versions

retVal=$?

echo
echo "Code: $retVal"
