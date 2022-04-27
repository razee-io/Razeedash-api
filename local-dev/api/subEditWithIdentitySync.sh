#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_SUB_NAME=${1:-${RAZEE_SUB_NAME:-pSubName}}
RAZEE_SUB_UUID=${2:-${RAZEE_SUB_UUID:-pSubUuid}}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID:-pOrgId}}
RAZEE_GROUP_NAME=${4:-${RAZEE_GROUP_NAME:-pGroupName}}
RAZEE_CONFIG_UUID=${5:-${RAZEE_CONFIG_UUID:-pConfigUuid}}
RAZEE_VER_UUID=${6:-${RAZEE_VER_UUID:-pVerUuid}}

RAZEE_QUERY='mutation($orgId: String!, $uuid: String!, $name: String!, $groups: [String!]!, $channelUuid: String!, $versionUuid: String!, $updateClusterIdentity: Boolean) { editSubscription( orgId: $orgId, uuid: $uuid, name: $name, groups: $groups, channelUuid: $channelUuid, versionUuid: $versionUuid, updateClusterIdentity: $updateClusterIdentity ) { uuid } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","uuid":"'"${RAZEE_SUB_UUID}"'","name":"'"${RAZEE_SUB_NAME}"'","groups":["'"${RAZEE_GROUP_NAME}"'"],"channelUuid":"'"${RAZEE_CONFIG_UUID}"'","versionUuid":"'"${RAZEE_VER_UUID}"'","updateClusterIdentity":true}'

echo "" && echo "EDIT subscription and sync my identity"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
