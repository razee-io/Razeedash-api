#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_ORG_KEY=${1:-${RAZEE_ORG_KEY:-pOrgKey}}

AUTH_HEADER="no-auth-available: asdf"

RAZEE_URL=${RAZEE_URL:-http://localhost:3333/api/v1/channels/dummychannel/dummyversion}

echo "GET to ${RAZEE_URL}"
curl \
-X GET \
-H "${AUTH_HEADER}" \
-H "razee-org-key: ${RAZEE_ORG_KEY}" \
-H "Content-Type: application/json" \
-w "HTTP: %{http_code}" \
${RAZEE_URL}

retVal=$?

echo
echo "Code: $retVal"
