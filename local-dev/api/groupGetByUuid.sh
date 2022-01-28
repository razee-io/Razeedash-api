#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_GROUP_UUID=${1:-${RAZEE_GROUP_UUID:-pGroupUuid}}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='query($orgId: String! $uuid: String!) { group( orgId: $orgId  uuid: $uuid) { uuid name subscriptions { uuid name version } clusters { clusterId registration } } }'
RAZEE_VARIABLES='{"uuid":"'"${RAZEE_GROUP_UUID}"'","orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "GET group by uuid"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
