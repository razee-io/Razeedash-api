#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

TYPE=${1:-channel}
ID=${2:-pChannelId}
CHILD_TYPE=${3:-version}
CHILD_ID=${4:-pVersionId}
RAZEE_ORG_ID=${5:-${RAZEE_ORG_ID}}

RAZEE_REST_URL=${RAZEE_REST_URL:-http://localhost:3333/api/v3}

echo "Getting ${TYPE}s/${ID}/${CHILD_TYPE}s/${CHILD_ID} in orgId ${RAZEE_ORG_ID} by GET to ${RAZEE_REST_URL}"

[ ! -z "${RAZEE_USER_TOKEN}" ] && AUTH_HEADER="Authorization: Bearer ${RAZEE_USER_TOKEN}" || AUTH_HEADER="no-auth-available: asdf"

curl \
-X GET \
-H "${AUTH_HEADER}" \
-H "Content-Type: application/json" \
-H "org-id: ${RAZEE_ORG_ID}" \
-w "HTTP: %{http_code}" \
${RAZEE_REST_URL}/${TYPE}s/${ID}/${CHILD_TYPE}s/${CHILD_ID}

retVal=$?

echo
echo "Code: $retVal"
