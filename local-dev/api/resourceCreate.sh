#!/bin/bash

echo "This script not fully implemented, maybe see apiResourceCreate.sh instead?"
exit -B 1

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

if [ "$0" = "$BASH_SOURCE" ]; then
  echo "$0 can be sourced to automatically set the RAZEE_RESOURCE_UUID variable"
fi

RAZEE_CLUSTER_NAME=${1:-pClusterName}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation ($orgId: String!, $registration: JSON!) { seeThisIsWrong(orgId: $orgId, registration: $registration) { uuid } }'
RAZEE_VARIABLES='{"registration":{"name":"'"${RAZEE_CLUSTER_NAME}"'"},"orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "CREATE resource"
unset RAZEE_RESOURCE_UUID
RESPONSE=$(${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}")
echo "Result: $?"
echo "Response:"
echo ${RESPONSE} | jq --color-output

export RAZEE_RESOURCE_UUID=$(echo ${RESPONSE} | jq -r '.data.seeThisIsWrong.uuid')
if [ "${RAZEE_RESOURCE_UUID}" = "null" ]; then
  echo "Unable to determine RAZEE_RESOURCE_UUID"
  unset RAZEE_RESOURCE_UUID
else
  echo "RAZEE_CONFIG_UUID: ${RAZEE_RESOURCE_UUID}"
fi
