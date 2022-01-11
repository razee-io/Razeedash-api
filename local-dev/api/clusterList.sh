#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_ORG_ID=${1:-${RAZEE_ORG_ID:-pOrgId}}
RAZEE_CLUSTER_FILTER=${2}

RAZEE_QUERY='query($orgId: String! $filter: String $limit: Int) { clusterSearch( orgId: $orgId filter: $filter limit: $limit) { orgId clusterId created updated metadata registration status } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","filter":"'"${RAZEE_CLUSTER_FILTER}"'","limit":100}'

echo "" && echo "LIST clusters"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
