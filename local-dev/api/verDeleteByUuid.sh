#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_VER_UUID=${1:-${RAZEE_VER_UUID:-pVerUuid}}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation($orgId: String! $uuid: String!) { removeChannelVersion( orgId: $orgId, uuid: $uuid) { uuid success } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","uuid":"'"${RAZEE_VER_UUID}"'"}'

echo "" && echo "DELETE version by uuid"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
