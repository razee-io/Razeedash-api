#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_ORG_ID=${1:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='
query($orgId: String!){resourcesCount(orgId: $orgId)}
'
RAZEE_QUERY=$(echo $RAZEE_QUERY | tr '\n' ' ')
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "COUNT resources"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
