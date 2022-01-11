#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_SUB_UUID=${1:-${RAZEE_SUB_UUID:-pSubUuid}}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='query($orgId: String! $uuid: String!) { subscription(orgId: $orgId, uuid: $uuid) { name orgId groups satcluster: clusterId channelName channelUuid version versionUuid owner { id name } uuid created rolloutStatus { successCount errorCount } remoteResources { cluster { clusterId name } searchableData lastModified } } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'", "uuid":"'"${RAZEE_SUB_UUID}"'"}'

echo "" && echo "GET subscription"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
