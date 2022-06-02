#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

if [ "$0" = "$BASH_SOURCE" ]; then
  echo "$0 can be sourced to automatically set the RAZEE_ORGKEY_UUID variable"
fi

RAZEE_ORGKEY_NAME=${1:-pOrgKey}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation($orgId: String!, $name: String!, $primary: Boolean!){ addOrgKey( orgId: $orgId, name: $name, primary: $primary ) { uuid, key } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","name":"'"${RAZEE_ORGKEY_NAME}"'","primary":true}'

echo "" && echo "CREATE OrgKey"
unset RAZEE_ORGKEY_UUID
RESPONSE=$(${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}")
echo "Result: $?"
echo "Response:"
echo ${RESPONSE} | jq --color-output

export RAZEE_ORGKEY_UUID=$(echo ${RESPONSE} | jq -r '.data.addOrgKey.uuid')
if [ "${RAZEE_ORGKEY_UUID}" = "null" ]; then
  echo "Unable to determine RAZEE_ORGKEY_UUID"
  unset RAZEE_ORGKEY_UUID
else
  echo "RAZEE_ORGKEY_UUID: ${RAZEE_ORGKEY_UUID}"
fi
