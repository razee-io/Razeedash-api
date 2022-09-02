#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CLUSTER_UUID=${1:-${RAZEE_CLUSTER_UUID:-pClusterUuid}}

RAZEE_QUERY='query($clusterId: String!) { subscriptionsByClusterId(clusterId: $clusterId) { subscriptionName, subscriptionUuid, url, kubeOwnerName } }'
RAZEE_VARIABLES='{"clusterId":"'"${RAZEE_CLUSTER_UUID}"'"}'

echo "" && echo "GET subscriptions by CLUSTER"
${SCRIPT_DIR}/graphqlPostWithOrgKey.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
