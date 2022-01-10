#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_ORG_ID=${1:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='query($orgId: String!) { groups( orgId: $orgId ) { uuid orgId name owner { id name } created } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "LIST groups"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
