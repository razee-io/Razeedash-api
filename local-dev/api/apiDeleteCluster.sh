#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

CLUSTER_ID=${1:-pTestClusterId}

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"

RAZEE_HOSTPORT=${RAZEE_HOSTPORT:-localhost:3333}
RAZEE_API_URL="https://${RAZEE_HOSTPORT}/api/v1/clusters"

echo
echo "CLUSTER_ID: ${CLUSTER_ID}"
echo

curl \
-X DELETE \
-H "${AUTH_HEADER}" \
-w "HTTP: %{http_code}" \
${RAZEE_API_URL}/$CLUSTER_ID

exit $?
