#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CLUSTER_LIMIT=${1:-100}
RAZEE_CLUSTER_FILTER=${2:-.*}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='query($orgId: String! $filter: String $limit: Int) { clusterSearch( orgId: $orgId filter: $filter limit: $limit) { orgId clusterId created updated metadata registration status } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","filter":"'"${RAZEE_CLUSTER_FILTER}"'","limit":'${RAZEE_CLUSTER_LIMIT}'}'

echo "" && echo "LIST clusters"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
