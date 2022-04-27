#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CLUSTER_NAME=${1:-pClusterName}
RAZEE_CLUSTER_LOCATION=${2:-pLocation}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation ($orgId: String!, $registration: JSON!) { registerCluster(orgId: $orgId, registration: $registration) { url orgId orgKey clusterId regState registration } }'
RAZEE_VARIABLES='{"registration":{"name":"'"${RAZEE_CLUSTER_NAME}"'","location":"'"${RAZEE_CLUSTER_LOCATION}"'"},"orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "CREATE cluster with location"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
