#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CLUSTER_LIMIT=${1:-100}
RAZEE_CLUSTER_SKIP=${2:-0}
RAZEE_CLUSTER_FILTER=${3:-.*}
RAZEE_ORG_ID=${4:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='query($orgId: String! $filter: String $limit: Int $skip: Int) { clusterSearch( orgId: $orgId filter: $filter limit: $limit skip: $skip) { orgId, clusterId, created, updated, groups { uuid name }, metadata, registration, status, regState, syncedIdentities { id, syncStatus, syncMessage }, lastOrgKey { uuid, name } } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","filter":"'"${RAZEE_CLUSTER_FILTER}"'","limit":'${RAZEE_CLUSTER_LIMIT}',"skip":'${RAZEE_CLUSTER_SKIP}'}'

echo "" && echo "LIST clusters"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
