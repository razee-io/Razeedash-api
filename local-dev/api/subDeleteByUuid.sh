#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_SUB_UUID=${1:-${RAZEE_SUB_UUID:-pSubUuid}}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation($orgId: String! $uuid: String!) { removeSubscription( orgId: $orgId, uuid: $uuid) { uuid success } }'
RAZEE_VARIABLES='{"uuid":"'"${RAZEE_SUB_UUID}"'","orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "DELETE subscription by uuid"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
