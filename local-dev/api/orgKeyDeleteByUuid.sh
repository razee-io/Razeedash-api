#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_ORGKEY_UUID=${1:-${RAZEE_ORGKEY_UUID:-pOrgKeyUuid}}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation($orgId: String!, $uuid: String!) { removeOrgKey( orgId: $orgId, uuid: $uuid) { success } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","uuid":"'"${RAZEE_ORGKEY_UUID}"'"}'

echo "" && echo "DELETE OrgKey by UUID"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
