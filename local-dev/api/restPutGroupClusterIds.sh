#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

GROUP_UUID=${1:-pGroupUUID}
RAZEE_CLUSTER_UUID=${2:-${RAZEE_CLUSTER_UUID:-pClusterUuid}}

RAZEE_REST_URL=${RAZEE_REST_URL:-http://localhost:3333/api/v3}

echo "Updating GROUP ${GROUP_UUID} in orgId ${RAZEE_ORG_ID} with Clusters by PUT to ${RAZEE_REST_URL}"

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"

curl \
-X PUT \
-H "${AUTH_HEADER}" \
-H "Content-Type: application/json" \
-H "org-id: ${RAZEE_ORG_ID}" \
-w "HTTP: %{http_code}" \
--data '{ "clusters": [ "'"${RAZEE_CLUSTER_UUID}"'" ] }' \
${RAZEE_REST_URL}/groups/${GROUP_UUID}

retVal=$?

echo
echo "Code: $retVal"
