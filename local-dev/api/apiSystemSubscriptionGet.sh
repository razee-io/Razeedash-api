#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

SYSTEMSUBSCRIPTION=operators
RAZEE_ORG_KEY=${2:-${RAZEE_ORG_KEY:-pOrgKey}}

RAZEE_HOSTPORT=${RAZEE_HOSTPORT:-localhost:3333}
RAZEE_API_URL="https://${RAZEE_HOSTPORT}/api/v1/systemSubscriptions/${SYSTEMSUBSCRIPTION}"

echo "GET to ${RAZEE_API_URL}"
curl \
-X GET \
-H "razee-org-key: ${RAZEE_ORG_KEY}" \
-H "Content-Type: application/json" \
-w "HTTP: %{http_code}" \
${RAZEE_API_URL}

retVal=$?

echo
echo "Code: $retVal"
