#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_SSUB_NAME=${1:-${RAZEE_SSUB_NAME:-pServiceSubName}}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}
RAZEE_CLUSTER_UUID=${3:-${RAZEE_CLUSTER_UUID:-pClusterId}}
RAZEE_CONFIG_UUID=${3:-${RAZEE_CONFIG_UUID:-pConfigUuid}}
RAZEE_VER_UUID=${4:-${RAZEE_VER_UUID:-pVerUuid}}

RAZEE_QUERY='mutation($orgId: String!, $name: String!, $clusterId: String!, $channelUuid: String!, $versionUuid: String!) { addServiceSubscription(orgId: $orgId, name: $name, clusterId: $clusterId, channelUuid: $channelUuid, versionUuid: $versionUuid) }'
RAZEE_VARIABLES='{"name":"'"${RAZEE_SSUB_NAME}"'","orgId":"'"${RAZEE_ORG_ID}"'","clusterId":"'"${RAZEE_CLUSTER_UUID}"'","channelUuid":"'"${RAZEE_CONFIG_UUID}"'","versionUuid":"'"${RAZEE_VER_UUID}"'"}'

echo "" && echo "CREATE service subscription by name"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
