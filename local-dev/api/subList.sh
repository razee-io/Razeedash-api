#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_ORG_ID=${1:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='query($orgId: String!) { subscriptions( orgId: $orgId ) { uuid, orgId, name, groupObjs { uuid, name }, channelUuid, channelName, version, versionUuid, versionObj { name, remote { parameters { key, value } } }, created, updated, rolloutStatus {errorCount, successCount}, owner { id, name }, identitySyncStatus { syncedCount, failedCount, unknownCount, pendingCount } } }'
#RAZEE_QUERY='query($orgId: String!) { subscriptions( orgId: $orgId ) { name orgId groups clusterId uuid channelUuid version versionUuid owner { id, name } SubscriptionType: __typename rolloutStatus {successCount, errorCount} remoteResources { cluster{clusterId, name} } } }'
#RAZEE_QUERY='query($orgId: String!) { subscriptions( orgId: $orgId ) { uuid name channelName channelUuid version kubeOwnerName owner { id name } rolloutStatus { errorCount successCount } } }'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'"}'

echo "" && echo "LIST subscriptions"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
