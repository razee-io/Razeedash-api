#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

if [ "$0" = "$BASH_SOURCE" ]; then
  echo "$0 can be sourced to automatically set the RAZEE_CLUSTER_UUID variable"
fi

RAZEE_CLUSTER_NAME=${1:-pClusterName}
RAZEE_DATA_LOCATION=${2:-pDataLocation}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation ($orgId: String!, $registration: JSON!) { registerCluster(orgId: $orgId, registration: $registration) { url orgId orgKey clusterId regState registration } }'
RAZEE_VARIABLES='{"registration":{"name":"'"${RAZEE_CLUSTER_NAME}"'","data_location":"'"${RAZEE_DATA_LOCATION}"'"},"orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "CREATE cluster with data_location"
unset RAZEE_CLUSTER_UUID
RESPONSE=$(${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}")
echo "Result: $?"
echo "Response:"
echo ${RESPONSE} | jq --color-output

export RAZEE_CLUSTER_UUID=$(echo ${RESPONSE} | jq -r '.data.registerCluster.clusterId')
if [ "${RAZEE_CLUSTER_UUID}" = "null" ]; then
  echo "Unable to determine RAZEE_CLUSTER_UUID"
  unset RAZEE_CLUSTER_UUID
else
  echo "RAZEE_CLUSTER_UUID: ${RAZEE_CLUSTER_UUID}"
fi
