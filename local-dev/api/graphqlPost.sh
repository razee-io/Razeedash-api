#!/bin/bash

RAZEE_URL=${RAZEE_URL:-http://localhost:3333/graphql}

RAZEE_QUERY=${1}
RAZEE_VARIABLES=${2}

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"

echo
#echo "AUTH_HEADER: ${AUTH_HEADER}"
echo "RAZEE_URL: ${RAZEE_URL}"
echo "QUERY: ${RAZEE_QUERY}"
echo "VARIABLES: ${RAZEE_VARIABLES}"
echo

# add '-v' for verbose
curl \
-X POST \
-H "Content-Type: application/json" \
-H "${AUTH_HEADER}" \
-H "Origin: razeetest.com" \
-w "HTTP: %{http_code}" \
--ipv4 \
--data '{ "query": "'"${RAZEE_QUERY}"'", "variables": '"${RAZEE_VARIABLES}"' }' \
${RAZEE_URL}

exit $?
