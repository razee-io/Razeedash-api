#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CONFIG_NAME=${1:-pConfigName}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation ($orgId: String!, $name: String!, $data_location: String) { addChannel(orgId: $orgId, name: $name, data_location: $data_location) { uuid } }'
RAZEE_VARIABLES='{"name":"'"${RAZEE_CONFIG_NAME}"'","orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "CREATE config by name"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
