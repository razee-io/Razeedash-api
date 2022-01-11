#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CLUSTER_ID=${1:-pClusterId}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='query($orgId: String! $clusterId: String!) { clusterByClusterId( orgId: $orgId clusterId: $clusterId) { orgId clusterId created updated metadata groups{ uuid name } status } }'
RAZEE_VARIABLES='{"clusterId":"'"${RAZEE_CLUSTER_ID}"'","orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "GET cluster by id"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
