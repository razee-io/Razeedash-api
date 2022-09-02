#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CLUSTER_UUID=${1:-${RAZEE_CLUSTER_UUID:-pClusterId}}
RAZEE_RESOURCE_LINK=${2:-${RAZEE_RESOURCE_LINK:-pResourceLink}}
LIMIT=${3:-999999}
SKIP=${4:-0}
RAZEE_ORG_ID=${5:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='
query (
  $orgId: String! $clusterId: String! $resourceSelfLink: String! $limit: Int $skip: Int
){
  resourceHistory(orgId: $orgId clusterId: $clusterId resourceSelfLink: $resourceSelfLink limit: $limit skip: $skip) {
    count
    items {
      id
      updated
    }
  }
}
'
RAZEE_QUERY=$(echo $RAZEE_QUERY | tr '\n' ' ')
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","clusterId":"'"${RAZEE_CLUSTER_UUID}"'","resourceSelfLink":"'"${RAZEE_RESOURCE_LINK}"'","limit":'${LIMIT}',"skip":'${SKIP}'}'

echo "" && echo "LIST resourceHistory"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
