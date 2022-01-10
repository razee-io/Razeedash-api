#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

TYPE=${1:-cluster}
ID=/${2}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID}}

echo "Getting ${TYPE}s${ID} in orgId ${RAZEE_ORG_ID}"
RAZEE_URL=${RAZEE_URL:-http://localhost:3333/api/v3/${TYPE}s${ID}}

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"

curl \
-X GET \
-H "${AUTH_HEADER}" \
-H "Content-Type: application/json" \
-H "xorg-id: ${RAZEE_ORG_ID}" \
-w "HTTP: %{http_code}" \
${RAZEE_URL}?orgId=${RAZEE_ORG_ID}

retVal=$?

echo
echo "Code: $retVal"
