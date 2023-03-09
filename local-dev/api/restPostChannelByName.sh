#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

CHANNEL_NAME=${1:-pChannel}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID}}

RAZEE_REST_URL=${RAZEE_REST_URL:-http://localhost:3333/api/v3}

echo "Creating CHANNEL ${CHANNEL_NAME} in orgId ${RAZEE_ORG_ID} by POST to ${RAZEE_REST_URL}"

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"

curl \
-X POST \
-H "${AUTH_HEADER}" \
-H "Content-Type: application/json" \
-H "org-id: ${RAZEE_ORG_ID}" \
-w "HTTP: %{http_code}" \
--data '{ "name": "'"${CHANNEL_NAME}"'" }' \
${RAZEE_REST_URL}/channels

retVal=$?

echo
echo "Code: $retVal"
