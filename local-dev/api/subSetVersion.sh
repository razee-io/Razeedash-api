#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_SUB_UUID=${2:-${RAZEE_SUB_UUID:-pSubUuid}}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID:-pOrgId}}
RAZEE_VER_UUID=${6:-${RAZEE_VER_UUID:-pVerUuid}}

RAZEE_QUERY='mutation($orgId: String!, $uuid: String!, $versionUuid: String!) { setSubscription( orgId: $orgId, uuid: $uuid, versionUuid: $versionUuid ) { uuid success } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","uuid":"'"${RAZEE_SUB_UUID}"'","versionUuid":"'"${RAZEE_VER_UUID}"'"}'

echo "" && echo "SET subscription version"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"