#!/bin/bash

CONTAINER_URL=${CONTAINER_URL:-https://containers.test.cloud.ibm.com/global/v2/applyRBAC}

RAZEE_QUERY=${1}
RAZEE_VARIABLES=${2}

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"

echo
# echo "AUTH_HEADER: ${AUTH_HEADER}"
echo "CONTAINER_URL: ${CONTAINER_URL}"
echo

# add '-v' for verbose
# -H "Origin: razeetest.com" \
# --ipv4 \

curl \
-X POST \
-H "Accept: application/json" \
-H "Content-Type: application/json" \
-H "${AUTH_HEADER}" \
-w "\nHTTP: %{http_code}\n" \
--data '{ "cluster": "'"DUMMYCLUSTERID"'" }' \
${CONTAINER_URL}

exit $?
