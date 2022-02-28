#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

COUNT=${1:-1000}
CLUSTER_ID=${2:-${RAZEE_CLUSTER_UUID:-pTestClusterId}}
RAZEE_ORG_KEY=${3:-${RAZEE_ORG_KEY:-pOrgKey}}

RAZEE_URL=${RAZEE_URL:-http://localhost:3333/api/v2/clusters}

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"

echo
echo "CLUSTER_ID: ${CLUSTER_ID}"
echo


echo "POST to ${RAZEE_URL}/${CLUSTER_ID}/resources ${COUNT} times..."
for ((i=0;i<$COUNT;i++)); do
  curl \
  -X POST \
  -H "${AUTH_HEADER}" \
  -H "razee-org-key: ${RAZEE_ORG_KEY}" \
  -H "Content-Type: application/json" \
  -w "HTTP: %{http_code}" \
  --data '[
  { "type": "'"MODIFIED"'", "object": { "metadata": { "selfLink": "'"multiResource-${i}"'" }, "dummykey": "'"$(date)"'", "status": { "razee-logs": { "error": { "0123456789abcdef": "Test Error." } } } } }
  ]' \
  ${RAZEE_URL}/${CLUSTER_ID}/resources
done

retVal=$?

echo
echo "Code: $retVal"
