#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_HISTORY_UUID=${1:-${RAZEE_HISTORY_UUID:-pHistUuid}}
RAZEE_RESOURCE_LINK=${2:-${RAZEE_RESOURCE_LINK:-pResLink}}
RAZEE_CLUSTER_UUID=${3:-${RAZEE_CLUSTER_UUID:-pClusterUuid}}
RAZEE_ORG_ID=${4:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='
query(
  $orgId:String!, $clusterId:String!, $resourceSelfLink:String!, $histId:String
){
  resourceContent(orgId:$orgId, clusterId:$clusterId, resourceSelfLink:$resourceSelfLink, histId:$histId) {
    id, histId, updated, content
  }
}
'
RAZEE_QUERY=$(echo $RAZEE_QUERY | tr '
' ' ')
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","clusterId":"'"${RAZEE_CLUSTER_UUID}"'","resourceSelfLink":"'"${RAZEE_RESOURCE_LINK}"'","histId":"'"${RAZEE_HISTORY_UUID}"'"}'

echo "" && echo "GET resource content"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
