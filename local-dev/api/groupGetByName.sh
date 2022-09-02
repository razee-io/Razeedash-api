#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_GROUP_NAME=${1:-pGroupUuid}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='query($orgId: String! $name: String!) { groupByName( orgId: $orgId  name: $name) { uuid name owner { name } created subscriptionCount clusterCount subscriptions { uuid name version } clusters { clusterId registration } } }'
RAZEE_VARIABLES='{"name":"'"${RAZEE_GROUP_NAME}"'","orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "GET group by name"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
