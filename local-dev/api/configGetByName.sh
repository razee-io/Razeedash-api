#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CONFIG_NAME=${1:-pConfigName}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

#RAZEE_QUERY='query($orgId: String! $name: String!) { channelByName( orgId: $orgId name: $name) { uuid orgId name data_location created versions { uuid name description } subscriptions { uuid name version versionUuid groups } } }'

RAZEE_QUERY='query($orgId: String! $name: String!) { channelByName( orgId: $orgId, name: $name) { name uuid orgId data_location created versions { uuid name description location } subscriptions { uuid name version versionUuid groups } } } '


RAZEE_VARIABLES='{"name":"'"${RAZEE_CONFIG_NAME}"'","orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "GET config by name"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
