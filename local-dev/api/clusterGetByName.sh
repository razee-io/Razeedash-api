#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CLUSTER_NAME=${1:-${RAZEE_CLUSTER_NAME:-pClusterName}}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='query($orgId: String! $clusterName: String!) { clusterByName( orgId: $orgId clusterName: $clusterName) { orgId clusterId created updated metadata groups{ uuid name } status } }'
RAZEE_VARIABLES='{"clusterName":"'"${RAZEE_CLUSTER_NAME}"'","orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "GET cluster by name"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
