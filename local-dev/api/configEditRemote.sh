#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

if [ "$0" = "$BASH_SOURCE" ]; then
  echo "$0 can be sourced to automatically set the RAZEE_CONFIG_UUID and RAZEE_CONFIG_NAME variables"
fi

export RAZEE_CONFIG_UUID=${1:-${RAZEE_CONFIG_UUID:-pConfigUuid}}
export RAZEE_CONFIG_NAME=${2:-${RAZEE_CONFIG_NAME:-pConfigName}}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation ($orgId: String!, $uuid: String!, $name: String!, $remote: ChannelRemoteInput) { editChannel(orgId: $orgId, uuid: $uuid, name: $name, remote: $remote) { uuid } }'
RAZEE_VARIABLES='{"name":"'"${RAZEE_CONFIG_NAME}"'","orgId":"'"${RAZEE_ORG_ID}"'","uuid":"'"${RAZEE_CONFIG_UUID}"'","remote":{"parameters":[{"key":"'"k2"'", "value":"'"v2"'"}]}}'

echo "" && echo "EDIT config by UUID (new name, new remote params)"
RESPONSE=$(${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}")
echo "Result: $?"
echo "Response:"
echo ${RESPONSE} | jq --color-output

export RAZEE_CONFIG_UUID=$(echo ${RESPONSE} | jq -r '.data.addChannel.uuid')
if [ "${RAZEE_CONFIG_UUID}" = "null" ]; then
  echo "Unable to determine RAZEE_CONFIG_UUID"
  unset RAZEE_CONFIG_UUID
  unset RAZEE_CONFIG_NAME
else
  echo "RAZEE_CONFIG_UUID: ${RAZEE_CONFIG_UUID}"
  echo "RAZEE_CONFIG_NAME: ${RAZEE_CONFIG_NAME}"
fi
