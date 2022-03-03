#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CLUSTER_UUID=${1:-${RAZEE_CLUSTER_UUID:-pClusterId}}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation($orgId: String! $clusterId: String!) { deleteClusterByClusterId( orgId: $orgId clusterId: $clusterId) { deletedClusterCount deletedResourceCount deletedResourceYamlHistCount deletedServiceSubscriptionCount } }'
RAZEE_VARIABLES='{"clusterId":"'"${RAZEE_CLUSTER_UUID}"'","orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "DELETE cluster by id"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
