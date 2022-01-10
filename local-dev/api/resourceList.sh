#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_ORG_ID=${1:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='
query(
  $orgId: String!, $filter: String, $fromDate: Date, $toDate: Date, $kinds: [String!], $sort: [SortObj!], $limit: Int
)
{
  resources(
    orgId: $orgId, filter: $filter, fromDate: $fromDate, toDate: $toDate, kinds: $kinds, sort: $sort, limit: $limit
  ) {
    count
    resources {
      orgId
      selfLink
      clusterId
    }
  }
}
'
RAZEE_QUERY='
query(
  $orgId: String!
)
{
  resources(
    orgId: $orgId
  ) {
    resources {
      orgId
      selfLink
      clusterId
    }
  }
}
'
RAZEE_QUERY=$(echo $RAZEE_QUERY | tr '\n' ' ')
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'"}'
#,"limit":100

echo "" && echo "LIST resources (LIMIT 400)"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
