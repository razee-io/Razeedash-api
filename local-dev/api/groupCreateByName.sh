#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

if [ "$0" = "$BASH_SOURCE" ]; then
  echo "$0 can be sourced to automatically set the RAZEE_GROUP_NAME and RAZEE_GROUP_UUID variables"
fi

RAZEE_GROUP_NAME=${1:-pGroupName}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation($orgId: String!, $name: String!){ addGroup( orgId: $orgId name: $name ) { uuid } }'
RAZEE_VARIABLES='{"name":"'"${RAZEE_GROUP_NAME}"'","orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "CREATE group by name"
unset RAZEE_GROUP_UUID
RESPONSE=$(${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}")
echo "Result: $?"
echo "Response:"
echo ${RESPONSE} | jq --color-output

export RAZEE_GROUP_NAME=${RAZEE_GROUP_NAME}
export RAZEE_GROUP_UUID=$(echo ${RESPONSE} | jq -r '.data.addGroup.uuid')
if [ "${RAZEE_GROUP_UUID}" = "null" ]; then
  echo "Unable to determine RAZEE_GROUP_UUID"
  unset RAZEE_GROUP_NAME
  unset RAZEE_GROUP_UUID
else
  echo "RAZEE_GROUP_NAME: ${RAZEE_GROUP_NAME}"
  echo "RAZEE_GROUP_UUID: ${RAZEE_GROUP_UUID}"
fi
