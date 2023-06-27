#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

if [ "$0" = "$BASH_SOURCE" ]; then
  echo "$0 can be sourced to automatically set the RAZEE_CONFIG_UUID and RAZEE_CONFIG_NAME variables"
fi

export RAZEE_CONFIG_NAME=${1:-pConfigName}
RAZEE_REMOTE_TYPE=${2:-github}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation ($orgId: String!, $name: String!, $contentType: String, $remote: ChannelRemoteInput) { addChannel(orgId: $orgId, name: $name, contentType: $contentType, remote: $remote) { uuid } }'
RAZEE_VARIABLES='{"name":"'"${RAZEE_CONFIG_NAME}"'","orgId":"'"${RAZEE_ORG_ID}"'","contentType":"'"remote"'","remote":{"remoteType":"'"${RAZEE_REMOTE_TYPE}"'","parameters":[{"key":"'"k1"'", "value":"'"v1"'"}]}}'

echo "" && echo "CREATE config by name (contentType: remote, remoteType: ${RAZEE_REMOTE_TYPE})"
unset RAZEE_CONFIG_UUID
unset RAZEE_CONFIG_NAME
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
