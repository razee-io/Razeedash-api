#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CONFIG_UUID=${1:-${RAZEE_CONFIG_UUID:-pConfigId}}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='query($orgId: String! $uuid: String!) { channel( orgId: $orgId uuid: $uuid) { uuid orgId name data_location contentType remote { remoteType parameters {key value} } created versions { uuid name description } subscriptions { uuid name version versionUuid versionObj { uuid name remote { parameters { key value } } } } } }'
RAZEE_VARIABLES='{"uuid":"'"${RAZEE_CONFIG_UUID}"'","orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "GET config by uuid"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
