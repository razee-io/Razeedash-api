#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_RESOURCE_FILTER=${1:-${RAZEE_RESOURCE_FILTER:-pFilter}}
RAZEE_ORG_ID=${2:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='subscription ($orgId: String!, $filter: String) { resourceUpdated (orgId: $orgId, filter: $filter) { resource { id orgId clusterId selfLink created } op }}'
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","filter":"'"${RAZEE_RESOURCE_FILTER}"'"}'

echo "" && echo "SUBSCRIBE resources ${RAZEE_VARIABLES}"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}" | jq --color-output
echo "Result: $?"
