#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

if [ "$0" = "$BASH_SOURCE" ]; then
  echo "$0 can be sourced to automatically set the RAZEE_CONFIG_UUID variable"
fi

RAZEE_CONFIG_NAME=${1:-pConfigName}
RAZEE_CONFIG_UUID=${2:-${RAZEE_CONFIG_UUID:-pConfigId}}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation ($orgId: String!, $uuid: String!, $name: String!) { editChannel(orgId: $orgId, uuid: $uuid, name: $name) { success } }'
RAZEE_VARIABLES='{"name":"'"${RAZEE_CONFIG_NAME}"'","uuid":"'"${RAZEE_CONFIG_UUID}"'","orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "EDIT config with new name"
unset RAZEE_CONFIG_UUID
RESPONSE=$(${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}")
echo "Result: $?"
echo "Response:"
echo ${RESPONSE} | jq --color-output
