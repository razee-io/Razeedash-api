#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

if [ "$0" = "$BASH_SOURCE" ]; then
  echo "$0 can be sourced to automatically set the RAZEE_SUB_UUID variable"
fi

RAZEE_SUB_NAME=${1:-pSubName}
RAZEE_GROUP_NAME=${2:-${RAZEE_GROUP_NAME:-pGroupName}}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID:-pOrgId}}
RAZEE_CONFIG_UUID=${4:-${RAZEE_CONFIG_UUID:-pConfigUuid}}
RAZEE_VER_UUID=${5:-${RAZEE_VER_UUID:-pVerUuid}}

RAZEE_QUERY='mutation( $orgId: String!, $name: String!, $groups: [String!]!, $channelUuid: String!, $version: VersionInput ) { addSubscription( orgId: $orgId, name: $name, groups: $groups, channelUuid: $channelUuid, version: $version ) { uuid } }'
RAZEE_VARIABLES='{"name":"'"${RAZEE_SUB_NAME}"'","orgId":"'"${RAZEE_ORG_ID}"'","groups":["'"${RAZEE_GROUP_NAME}"'"],"channelUuid":"'"${RAZEE_CONFIG_UUID}"'","version":{ "name":"'"version-${RAZEE_SUB_NAME}"'","type":"application/yaml","remote":{"parameters":[{"key":"'"k1"'", "value":"'"ver1"'"}]},"description":"'"Version for ${RAZEE_SUB_NAME}"'" } }'

echo "" && echo "******************************************************************"
echo "" && echo "NOTE: addSubscription GraphQL API requires group NAMES, not UUIDs!"
echo "" && echo "NOTE: If a group with that does not exist it will be created!"
echo "" && echo "******************************************************************"

echo "" && echo "CREATE subscription by name with remote version"
unset RAZEE_SUB_UUID
RESPONSE=$(${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}")
echo "Result: $?"
echo "Response:"
echo ${RESPONSE} | jq --color-output

export RAZEE_SUB_UUID=$(echo ${RESPONSE} | jq -r '.data.addSubscription.uuid')
if [ "${RAZEE_SUB_UUID}" = "null" ]; then
  echo "Unable to determine RAZEE_SUB_UUID"
  unset RAZEE_SUB_UUID
else
  echo "RAZEE_SUB_UUID: ${RAZEE_SUB_UUID}"
fi
