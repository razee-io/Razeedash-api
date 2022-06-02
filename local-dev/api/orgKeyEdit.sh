#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_ORGKEY_UUID=${1:-${RAZEE_ORGKEY_UUID:-pOrgKeyUuid}}
RAZEE_ORGKEY_NAME=${2:-${RAZEE_ORGKEY_NAME:-pOrgKeyName}}
PRIMARY=${3:-false}}
RAZEE_ORG_ID=${4:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation($orgId: String!, $uuid: String!, $name: String, $primary: Boolean) { editOrgKey( orgId: $orgId, uuid: $uuid, name: $name, primary: $primary) { modified } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","uuid":"'"${RAZEE_ORGKEY_UUID}"'","name":"'"${RAZEE_ORGKEY_NAME}"'","primary":true}'

echo "" && echo "Edit OrgKey"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
