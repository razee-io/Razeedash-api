#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_CLUSTER_UUID=${1:-${RAZEE_CLUSTER_UUID:-pTestClusterUuid}}
RAZEE_ORG_KEY=${2:-${RAZEE_ORG_KEY:-pOrgKey}}

RAZEE_V2_URL=${RAZEE_V2_URL:-http://localhost:3333/api/v2}

echo "POST one resource to ${RAZEE_V2_URL}/clusters/${RAZEE_CLUSTER_UUID}/resources"
curl \
-X POST \
-H "razee-org-key: ${RAZEE_ORG_KEY}" \
-H "Content-Type: application/json" \
-w "HTTP: %{http_code}" \
--data '
[{
    "type": "'"ADDED"'",
    "object": {
      "apiVersion": "v1",
      "kind": "ConfigMap",
      "metadata": {
          "name": "sample-cm",
          "namespace": "default",
          "resourceVersion": "1000",
          "selfLink": "/api/v1/namespaces/default/configmaps/sample-cm"
      },
      "data": {
          "version": "sample-ver-1"
      }
    }
}]' \
${RAZEE_V2_URL}/clusters/${RAZEE_CLUSTER_UUID}/resources

retVal=$?

echo
echo "Code: $retVal"
