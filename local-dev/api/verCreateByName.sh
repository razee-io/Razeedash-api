#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_VER_NAME=${1:-pVerName}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}
RAZEE_CONFIG_UUID=${3:-${RAZEE_CONFIG_UUID:-pConfigUuid}}
RAZEE_VER_DESCR=${4:-pVerDescription}

RAZEE_QUERY='mutation($orgId: String!, $channelUuid: String!, $name: String!, $type: String!, $content: String!, $description: String) { addChannelVersion( orgId: $orgId channelUuid: $channelUuid name: $name type: $type content: $content description: $description ) { versionUuid success } }'
CONTENT="{ \\\"apiVersion\\\": \\\"v1\\\",\\\"kind\\\": \\\"ConfigMap\\\",\\\"name\\\": \\\"${RAZEE_VER_NAME}-configmap\\\",\\\"namespace\\\": \\\"default\\\",\\\"data\\\": {\\\"DUMMYKEY\\\": \\\"DUMMYVAL\\\"}}"
RAZEE_VARIABLES='{"name":"'"${RAZEE_VER_NAME}"'","orgId":"'"${RAZEE_ORG_ID}"'","channelUuid":"'"${RAZEE_CONFIG_UUID}"'","type":"application/yaml","content":"'"${CONTENT}"'","description":"'"${RAZEE_VER_DESCR}"'"}'

echo "" && echo "CREATE version by name"
echo "Variables: $RAZEE_VARIABLES"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
