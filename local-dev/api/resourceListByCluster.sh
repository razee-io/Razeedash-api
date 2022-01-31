#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CLUSTER_ID=${1:-${RAZEE_CLUSTER_ID:-pClusterId}}
LIMIT=${2:-999999}
SKIP=${3:-0}
RAZEE_ORG_ID=${4:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='
query(
  $orgId: String!, $clusterId: String!, $limit: Int, $skip: Int
)
{
  resourcesByCluster(
    orgId: $orgId, clusterId: $clusterId, limit: $limit, skip: $skip
  ) {
    count
    totalCount
    resources {
      orgId
      selfLink
      clusterId
    }
  }
}
'
RAZEE_QUERY=$(echo $RAZEE_QUERY | tr '\n' ' ')
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","clusterId":"'"${RAZEE_CLUSTER_ID}"'","limit":'${LIMIT}',"skip":'${SKIP}'}'

echo "" && echo "LIST resources for cluster"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
