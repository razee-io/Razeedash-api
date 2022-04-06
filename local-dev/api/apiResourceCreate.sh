#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CLUSTER_UUID=${1:-${RAZEE_CLUSTER_UUID:-pTestClusterUuid}}
RAZEE_ORG_KEY=${2:-${RAZEE_ORG_KEY:-pOrgKey}}

RAZEE_URL=${RAZEE_URL:-http://localhost:3333/api/v2/clusters}

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"

echo
echo "RAZEE_CLUSTER_UUID: ${RAZEE_CLUSTER_UUID}"
echo

echo "POST to ${RAZEE_URL}/${RAZEE_CLUSTER_UUID}/resources"
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
${RAZEE_URL}/${RAZEE_CLUSTER_UUID}/resources

retVal=$?

echo
echo "Code: $retVal"
