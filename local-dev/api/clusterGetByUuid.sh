#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CLUSTER_UUID=${1:-${RAZEE_CLUSTER_UUID:-pClusterId}}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='query($orgId: String! $clusterId: String!) { clusterByClusterId( orgId: $orgId clusterId: $clusterId) { orgId, clusterId, created, updated, metadata, groups { uuid name }, status, syncedIdentities { id syncStatus syncMessage } } }'
RAZEE_VARIABLES='{"clusterId":"'"${RAZEE_CLUSTER_UUID}"'","orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "GET cluster by UUID $RAZEE_CLUSTER_UUID"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
