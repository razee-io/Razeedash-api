#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_ORGKEY_NAME=${1:-${RAZEE_ORGKEY_NAME:-pOrgKeyName}}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='query($orgId: String!, $name: String!){ orgKey( orgId: $orgId, name: $name ) { uuid, name, primary, created, updated, key } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","name":"'"${RAZEE_ORGKEY_NAME}"'"}'

echo "" && echo "GET OrgKey by Name"
RESPONSE=$(${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}")
echo "Result: $?"
echo "Response:"
echo ${RESPONSE} | jq --color-output
