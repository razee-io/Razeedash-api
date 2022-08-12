#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_ORG_KEY=${1:-${RAZEE_ORG_KEY:-pOrgKey}}

AUTH_HEADER="no-auth-available: asdf"

RAZEE_URL=${RAZEE_URL:-https://${RAZEE_HOSTPORT}/api/v1/channels/${RAZEE_CONFIG_NAME:-pConfigName}/${RAZEE_VER_UUID:-dummyversionuuid}}

echo "GET to ${RAZEE_URL}"
curl \
-X GET \
-v \
-H "${AUTH_HEADER}" \
-H "razee-org-key: ${RAZEE_ORG_KEY}" \
-H "Content-Type: application/json" \
-w "HTTP: %{http_code}" \
${RAZEE_URL}

retVal=$?

echo
echo "Code: $retVal"
