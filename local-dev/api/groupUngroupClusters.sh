#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CLUSTER_UUID=${1:-${RAZEE_CLUSTER_UUID:-pClusterId}}
RAZEE_GROUP_UUID=${2:-${RAZEE_GROUP_UUID:-pGroupId}}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation($orgId: String!, $uuid: String!, $clusters: [String!]!){ unGroupClusters( orgId: $orgId, uuid: $uuid, clusters: $clusters ) { modified } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","uuid":"'"${RAZEE_GROUP_UUID}"'","clusters":["'"${RAZEE_CLUSTER_UUID}"'"]}'

echo "" && echo "UNGROUP clusters"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
