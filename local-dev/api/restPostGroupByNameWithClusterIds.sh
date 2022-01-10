#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

GROUP_NAME=${1:-pGroup}
RAZEE_CLUSTER_UUID=${2:-${RAZEE_CLUSTER_UUID:-pClusterUuid}}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID}}

echo "Creating GROUP ${GROUP_NAME} in orgId ${RAZEE_ORG_ID} with Clusters"
echo "***********"
echo "THIS DOES NOT WORK AT THIS TIME! clusters ignored?"
echo "***********"
RAZEE_URL=${RAZEE_URL:-http://localhost:3333/api/v3/groups}

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"


curl \
-i \
-X POST \
-H "${AUTH_HEADER}" \
-H "Content-Type: application/json" \
-H "org-id: ${RAZEE_ORG_ID}" \
-w "HTTP: %{http_code}" \
--data '{ "name": "'"${GROUP_NAME}"'", "clusters": [ "'"${RAZEE_CLUSTER_UUID}"'" ] }' \
${RAZEE_URL}

retVal=$?

echo
echo "Code: $retVal"
