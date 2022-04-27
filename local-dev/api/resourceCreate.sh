#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CLUSTER_NAME=${1:-pClusterName}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}


echo "This script not implemented, maybe see apiResourceCreate.sh instead?"
exit -B 1


RAZEE_QUERY='mutation ($orgId: String!, $registration: JSON!) { registerCluster(orgId: $orgId, registration: $registration) { url orgId orgKey clusterId regState registration } }'
RAZEE_VARIABLES='{"registration":{"name":"'"${RAZEE_CLUSTER_NAME}"'"},"orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "CREATE cluster"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
