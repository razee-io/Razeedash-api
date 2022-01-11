#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CONFIG_UUID=${1:-pConfigId}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation($orgId: String! $uuid: String!) { removeChannel( orgId: $orgId uuid: $uuid) { uuid success } }'
RAZEE_VARIABLES='{"uuid":"'"${RAZEE_CONFIG_UUID}"'","orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "DELETE config by id"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
