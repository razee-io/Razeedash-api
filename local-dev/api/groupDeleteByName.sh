#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_GROUP_NAME=${1:-pGroupName}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation($orgId: String! $name: String!) { removeGroupByName( orgId: $orgId, name: $name) { uuid success } }'
RAZEE_VARIABLES='{"name":"'"${RAZEE_GROUP_NAME}"'","orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "DELETE group by name"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
