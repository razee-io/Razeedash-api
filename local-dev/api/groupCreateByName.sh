#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_GROUP_NAME=${1:-pGroupName}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation($orgId: String!, $name: String!){ addGroup( orgId: $orgId name: $name ) { uuid } }'
RAZEE_VARIABLES='{"name":"'"${RAZEE_GROUP_NAME}"'","orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "CREATE group by name"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
