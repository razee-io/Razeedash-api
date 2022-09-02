#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_URL=${RAZEE_URL:-http://localhost:3333/api-docs/}
echo "Getting swagger from ${RAZEE_URL}"

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"

curl \
-X GET \
-H "${AUTH_HEADER}" \
-H "Content-Type: application/json" \
-w "HTTP: %{http_code}" \
${RAZEE_URL}

retVal=$?

echo
echo "Code: $retVal"
