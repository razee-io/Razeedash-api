#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_GROUP_UUID=${1:-pGroupId}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation($orgId: String! $uuid: String!) { removeGroup( orgId: $orgId, uuid: $uuid) { uuid success } }'
RAZEE_VARIABLES='{"uuid":"'"${RAZEE_GROUP_UUID}"'","orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "DELETE group by uuid"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
