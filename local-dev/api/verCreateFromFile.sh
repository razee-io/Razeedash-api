#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"


echo ""
echo "This script is not functional (file upload will take a bit more work)"
echo ""
if [ "$0" = "$BASH_SOURCE" ]; then
  exit 1
else
  return 1
fi


if [ "$0" = "$BASH_SOURCE" ]; then
  echo "$0 can be sourced to automatically set the RAZEE_VER_UUID variable"
fi

RAZEE_VER_NAME=${1:-pVerName}
UPLOADFILE=${2:-versionFile.yaml}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID:-pOrgId}}
RAZEE_CONFIG_UUID=${4:-${RAZEE_CONFIG_UUID:-pConfigUuid}}
RAZEE_VER_DESCR=${5:-pVerDescription}

RAZEE_QUERY='mutation($orgId: String!, $channelUuid: String!, $name: String!, $type: String!, $file: Upload!, $description: String) { addChannelVersion( orgId: $orgId, channelUuid: $channelUuid, name: $name, type: $type, file: $file, description: $description ) { versionUuid success } }'
RAZEE_VARIABLES='{"name":"'"${RAZEE_VER_NAME}"'","orgId":"'"${RAZEE_ORG_ID}"'","channelUuid":"'"${RAZEE_CONFIG_UUID}"'","type":"application/yaml","file":"'"${UPLOADFILE}"'","description":"'"${RAZEE_VER_DESCR}"'"}'

echo "" && echo "CREATE version by name"
unset RAZEE_VER_UUID
RESPONSE=$(${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}")
echo "Result: $?"
echo "Response:"
echo ${RESPONSE} | jq --color-output

export RAZEE_VER_UUID=$(echo ${RESPONSE} | jq -r '.data.addChannelVersion.versionUuid')
if [ "${RAZEE_VER_UUID}" = "null" ]; then
  echo "Unable to determine RAZEE_VER_UUID"
  unset RAZEE_VER_UUID
else
  echo "RAZEE_VER_UUID: ${RAZEE_VER_UUID}"
fi
