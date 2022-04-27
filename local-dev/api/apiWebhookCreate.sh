#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CLUSTER_UUID=${1:-${RAZEE_CLUSTER_UUID:-pTestClusterUuid}}
RAZEE_ORG_KEY=${2:-${RAZEE_ORG_KEY:-pOrgKey}}

RAZEE_URL=${RAZEE_URL:-http://localhost:3333/graphql}
RAZEE_REST_URL=${RAZEE_URL/graphql/api/v2/asdf}

echo
echo "RAZEE_CLUSTER_UUID: ${RAZEE_CLUSTER_UUID}"
echo

echo "POST to ${RAZEE_REST_URL}"
curl \
-X POST \
-H "razee-org-key: ${RAZEE_ORG_KEY}" \
-H "Content-Type: application/json" \
-w "HTTP: %{http_code}" \
--data '{ "what": "goes here? it doesnt matter because this will always 404!" }' \
${RAZEE_REST_URL}

retVal=$?

echo
echo "Code: $retVal"
