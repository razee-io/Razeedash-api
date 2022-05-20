#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_ORG_ID=${1:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='query($orgId: String!){ orgKeys( orgId: $orgId ) { uuid, name, primary, created, updated, key } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "LIST OrgKeys"
RESPONSE=$(${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}")
echo "Result: $?"
echo "Response:"
echo ${RESPONSE} | jq --color-output
