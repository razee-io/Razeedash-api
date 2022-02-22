#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_SUB_NAME=${1:-pSubName}
RAZEE_GROUP_NAME=${2:-${RAZEE_GROUP_NAME:-pGroupName}}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID:-pOrgId}}
RAZEE_CONFIG_UUID=${4:-${RAZEE_CONFIG_UUID:-pConfigUuid}}
RAZEE_VER_UUID=${5:-${RAZEE_VER_UUID:-pVerUuid}}

RAZEE_QUERY='mutation($orgId: String!, $name: String!, $groups: [String!]!, $channelUuid: String!, $versionUuid: String!) { addSubscription( orgId: $orgId, name: $name, groups: $groups, channelUuid: $channelUuid, versionUuid: $versionUuid ) { uuid } }'
RAZEE_VARIABLES='{"name":"'"${RAZEE_SUB_NAME}"'","orgId":"'"${RAZEE_ORG_ID}"'","groups":["'"${RAZEE_GROUP_NAME}"'"],"channelUuid":"'"${RAZEE_CONFIG_UUID}"'","versionUuid":"'"${RAZEE_VER_UUID}"'"}'

echo "" && echo "******************************************************************"
echo "" && echo "NOTE: addSubscription GraphQL API requires group NAMES, not UUIDs!"
echo "" && echo "NOTE: If a group with that does not exist it will be created!"
echo "" && echo "******************************************************************"

echo "" && echo "CREATE subscription by name"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
