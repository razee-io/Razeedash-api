#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

if [ "$0" = "$BASH_SOURCE" ]; then
  echo "$0 can be sourced to automatically set the RAZEE_SSUB_UUID variable"
fi

RAZEE_SSUB_NAME=${1:-${RAZEE_SSUB_NAME:-pServiceSubName}}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}
RAZEE_CLUSTER_UUID=${3:-${RAZEE_CLUSTER_UUID:-pClusterId}}
RAZEE_CONFIG_UUID=${3:-${RAZEE_CONFIG_UUID:-pConfigUuid}}
RAZEE_VER_UUID=${4:-${RAZEE_VER_UUID:-pVerUuid}}

RAZEE_QUERY='mutation($orgId: String!, $name: String!, $clusterId: String!, $channelUuid: String!, $versionUuid: String!) { addServiceSubscription(orgId: $orgId, name: $name, clusterId: $clusterId, channelUuid: $channelUuid, versionUuid: $versionUuid) }'
RAZEE_VARIABLES='{"name":"'"${RAZEE_SSUB_NAME}"'","orgId":"'"${RAZEE_ORG_ID}"'","clusterId":"'"${RAZEE_CLUSTER_UUID}"'","channelUuid":"'"${RAZEE_CONFIG_UUID}"'","versionUuid":"'"${RAZEE_VER_UUID}"'"}'

echo "" && echo "CREATE service subscription by name"
unset RAZEE_SSUB_UUID
RESPONSE=$(${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}")
echo "Result: $?"
echo "Response:"
echo ${RESPONSE} | jq --color-output

export RAZEE_SSUB_UUID=$(echo ${RESPONSE} | jq -r '.data.addServiceSubscription')
if [ "${RAZEE_SSUB_UUID}" = "null" ]; then
  echo "Unable to determine RAZEE_SSUB_UUID"
  unset RAZEE_SSUB_UUID
else
  echo "RAZEE_SSUB_UUID: ${RAZEE_SSUB_UUID}"
fi
