#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

LIMIT=${1:-999999}
SKIP=${2:-0}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='
query(
  $orgId: String!, $limit: Int, $skip: Int
)
{
  resources(
    orgId: $orgId, limit: $limit, skip: $skip
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
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","limit":'${LIMIT}',"skip":'${SKIP}'}'

echo "" && echo "LIST resources for org"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
