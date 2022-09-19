#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CLUSTER_UUID=${1:-${RAZEE_CLUSTER_UUID:-pTestClusterId}}
RAZEE_ORG_KEY=${2:-${RAZEE_ORG_KEY:-pOrgKey}}

RAZEE_HOSTPORT=${RAZEE_HOSTPORT:-localhost:3333}
RAZEE_API_URL="https://${RAZEE_HOSTPORT}/api/v1/channels"

echo
echo "CLUSTER_ID: ${CLUSTER_ID}"
echo

echo "GET to ${RAZEE_API_URL}/${RAZEE_CONFIG_NAME}/${RAZEE_VER_UUID}"
curl \
-X GET \
-H "razee-org-key: ${RAZEE_ORG_KEY}" \
-H "Content-Type: application/json" \
-w "HTTP: %{http_code}" \
-v \
${RAZEE_API_URL}/${RAZEE_CONFIG_NAME}/${RAZEE_VER_UUID}

retVal=$?

echo
echo "Code: $retVal"
