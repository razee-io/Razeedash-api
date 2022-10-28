#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_SUB_UUID=${1:-${RAZEE_SUB_UUID:-pSubUuid}}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation($orgId: String!, $uuid: String!, $deleteVersion: Boolean) { removeSubscription( orgId: $orgId, uuid: $uuid, deleteVersion: $deleteVersion) { uuid success } }'
RAZEE_VARIABLES='{"uuid":"'"${RAZEE_SUB_UUID}"'","orgId":"'"${RAZEE_ORG_ID}"'","deleteVersion":true}'

echo "" && echo "DELETE subscription (with version) by uuid"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
