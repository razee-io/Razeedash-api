#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_ORGKEY_UUID=${1:-${RAZEE_ORGKEY_UUID:-pOrgKeyUuid}}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='query($orgId: String!, $uuid: String!){ orgKey( orgId: $orgId, uuid: $uuid ) { uuid, name, primary, created, updated, key } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","uuid":"'"${RAZEE_ORGKEY_UUID}"'"}'

echo "" && echo "GET OrgKey by UUID"
RESPONSE=$(${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}")
echo "Result: $?"
echo "Response:"
echo ${RESPONSE} | jq --color-output
