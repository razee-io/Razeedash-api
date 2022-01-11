#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

GROUP_UUID=${1:-pGroupUUID}
RAZEE_CLUSTER_UUID=${2:-${RAZEE_CLUSTER_UUID:-pClusterUuid}}

echo "Updating GROUP ${GROUP_UUID} in orgId ${RAZEE_ORG_ID} with Clusters"
RAZEE_URL=${RAZEE_URL:-http://localhost:3333/api/v3/groups/${GROUP_UUID}}

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"

curl \
-X PUT \
-H "${AUTH_HEADER}" \
-H "Content-Type: application/json" \
-H "org-id: ${RAZEE_ORG_ID}" \
-w "HTTP: %{http_code}" \
--data '{ "clusters": [ "'"${RAZEE_CLUSTER_UUID}"'" ] }' \
${RAZEE_URL}

retVal=$?

echo
echo "Code: $retVal"
