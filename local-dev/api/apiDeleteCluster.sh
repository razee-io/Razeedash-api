#!/bin/bash

RAZEE_URL=${RAZEE_URL:-http://localhost:3333/api/v1/clusters}

CLUSTER_ID=${1:-pTestClusterId}

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"

echo
echo "CLUSTER_ID: ${CLUSTER_ID}"
echo

curl \
-X DELETE \
-H "${AUTH_HEADER}" \
-w "HTTP: %{http_code}" \
${RAZEE_URL}/$CLUSTER_ID

exit $?
