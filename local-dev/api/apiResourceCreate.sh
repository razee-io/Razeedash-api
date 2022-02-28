#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

CLUSTER_ID=${1:-${RAZEE_CLUSTER_UUID:-pTestClusterId}}
RAZEE_ORG_KEY=${2:-${RAZEE_ORG_KEY:-pOrgKey}}

RAZEE_URL=${RAZEE_URL:-http://localhost:3333/api/v2/clusters}

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"

echo
echo "CLUSTER_ID: ${CLUSTER_ID}"
echo

echo "POST to ${RAZEE_URL}/${CLUSTER_ID}/resources"
curl \
-X POST \
-H "${AUTH_HEADER}" \
-H "razee-org-key: ${RAZEE_ORG_KEY}" \
-H "Content-Type: application/json" \
-w "HTTP: %{http_code}" \
--data '[{ "type": "'"ADDED"'", "object": { "metadata": { "selfLink": "'"dummySelfLink"'" }, "dummykey": "'"$(date)"'", "status": {
  "razee-logs": {
    "error": {
      "0123456789abcdef": "Test Error."
    }
  }
} } }]' \
${RAZEE_URL}/${CLUSTER_ID}/resources

retVal=$?

echo
echo "Code: $retVal"
