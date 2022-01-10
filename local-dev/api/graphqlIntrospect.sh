#!/bin/bash

RAZEE_URL=${RAZEE_URL:-http://localhost:3333/graphql}

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"

echo "THIS DOES NOT CURRENTLY WORK"
exit -B 1

curl \
-X POST \
-H "Content-Type: application/json" \
-H "${AUTH_HEADER}" \
-w "HTTP: %{http_code}" \
--data '{ __schema { types { name } } }' \
${RAZEE_URL}

exit $?
