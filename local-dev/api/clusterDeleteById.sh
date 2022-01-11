#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CLUSTER_ID=${1:-pClusterId}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation($orgId: String! $clusterId: String!) { deleteClusterByClusterId( orgId: $orgId clusterId: $clusterId) { deletedClusterCount deletedResourceCount } }'
RAZEE_VARIABLES='{"clusterId":"'"${RAZEE_CLUSTER_ID}"'","orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "DELETE cluster by id"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
