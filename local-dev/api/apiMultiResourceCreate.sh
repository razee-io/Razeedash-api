#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

COUNT=${1:-1000}
CLUSTER_ID=${2:-${RAZEE_CLUSTER_UUID:-pTestClusterId}}
RAZEE_ORG_KEY=${3:-${RAZEE_ORG_KEY:-pOrgKey}}

RAZEE_URL=${RAZEE_URL:-http://localhost:3333/graphql}
RAZEE_REST_URL=${RAZEE_URL/graphql/api/v2/clusters}

echo
echo "CLUSTER_ID: ${CLUSTER_ID}"
echo

echo "POST to ${RAZEE_REST_URL}/${CLUSTER_ID}/resources ${COUNT} times..."
for ((i=0;i<$COUNT;i++)); do
  curl \
  -X POST \
  -H "razee-org-key: ${RAZEE_ORG_KEY}" \
  -H "Content-Type: application/json" \
  -w "HTTP: %{http_code}" \
  --data '[
    {
      "type": "'"ADDED"'",
      "object": {
        "apiVersion": "v1",
        "kind": "ConfigMap",
        "metadata": {
            "creationTimestamp": "2022-04-18T17:21:38Z",
            "name": "sample-cm-"'"${i}"'"",
            "namespace": "default",
            "resourceVersion": "1000",
            "selfLink": "/api/v1/namespaces/default/configmaps/sample-cm-"'"${i}"'""
        },
        "data": {
            "version": "sample-ver-"'"${i}"'""
        }
      }
    }
  ]' \
  ${RAZEE_REST_URL}/${CLUSTER_ID}/resources
done

retVal=$?

echo
echo "Code: $retVal"
