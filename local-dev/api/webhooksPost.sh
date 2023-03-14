#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_ORG_ID=${1:-${RAZEE_ORG_ID:-pOrgId}}
RAZEE_ORG_KEY=${2:-${RAZEE_ORG_KEY:-pOrgKey}}

RAZEE_V2_URL=${RAZEE_V2_URL:-http://localhost:3333/api/v2}

echo "POST webhook to ${RAZEE_REST_URL}"

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"

curl \
-X POST \
-H "${AUTH_HEADER}" \
-H "Content-Type: application/json" \
-H "razee-org-key: ${RAZEE_ORG_KEY}" \
-H "org-id: ${RAZEE_ORG_ID}" \
-w "HTTP: %{http_code}" \
--data '{ "dummykey": "dummyvalue" }' \
${RAZEE_V2_URL}/webhooks

retVal=$?

echo
echo "Code: $retVal"
