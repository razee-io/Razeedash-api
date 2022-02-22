#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_ORG_ID=${1:-${RAZEE_ORG_ID:-pOrgId}}
RAZEE_CLUSTER_UUID=${2:-${RAZEE_CLUSTER_UUID:-pClusterUuid}}

RAZEE_QUERY='query  ($clusterId:  String!) { subscriptionsByClusterId(clusterId: $clusterId) { subscriptionName subscriptionChannel subscriptionVersion subscriptionUuid url kubeOwnerName rolloutStatus { errorCount successCount } } }'
RAZEE_VARIABLES='{"clusterId":"'"${RAZEE_CLUSTER_UUID}"'"}'

echo "" && echo "LIST subscriptions"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
