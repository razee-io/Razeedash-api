#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

if [ "$0" = "$BASH_SOURCE" ]; then
  echo "$0 can be sourced to automatically set the RAZEE_ORG_ID variable"
fi

RAZEE_QUERY='query{ organizations { id name } }'
RAZEE_VARIABLES='{}'

echo "" && echo "GET organizations for current user"
unset RAZEE_ORG_ID
RESPONSE=$(${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}")
echo "Result: $?"
echo "Response:"
echo ${RESPONSE} | jq --color-output

# Response like {"data":{"organizations":[{"id":"[uuid]","name":"pOrgName"}]}}
export RAZEE_ORG_ID=$(echo ${RESPONSE} | jq -r '.data.organizations[0].id')
if [ "${RAZEE_ORG_ID}" = "null" ]; then
  echo "Unable to determine RAZEE_ORG_ID"
  unset RAZEE_ORG_ID
else
  echo "RAZEE_ORG_ID: ${RAZEE_ORG_ID}"
fi
