#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

if [ "$0" = "$BASH_SOURCE" ]; then
  echo "$0 can be sourced to automatically set the RAZEE_CONFIG_UUID and RAZEE_CONFIG_NAME variables"
fi

export RAZEE_CONFIG_NAME=${1:-pConfigName}
RAZEE_VER_NAME=${2:-pVerName}
RAZEE_SUB_NAME=${3:-pSubName}
RAZEE_ORG_ID=${4:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='mutation ($orgId: String!, $name: String!, $contentType: String, $remote: ChannelRemoteInput, $versions: [VersionInput!], $subscriptions: [SubscriptionInput!]) { addChannel(orgId: $orgId, name: $name, contentType: $contentType, remote: $remote, versions: $versions, subscriptions: $subscriptions) { uuid } }'
RAZEE_VARIABLES='{"name":"'"${RAZEE_CONFIG_NAME}"'","orgId":"'"${RAZEE_ORG_ID}"'","contentType":"'"remote"'","remote":{"remoteType":"'"github"'","parameters":[{"key":"'"k1"'", "value":"'"v1"'"}]}, "versions":[{"name":"'"${RAZEE_VER_NAME}"'", "type":"'"application/yaml"'", "remote": {"parameters":[]} }], "subscriptions":[{"name":"'"${RAZEE_SUB_NAME}"'", "versionName":"'"${RAZEE_VER_NAME}"'", "groups": []}]}'

echo "" && echo "CREATE config by name (contentType: remote) WITH A VERSION AND SUBSCRIPTION"
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
