#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_QUERY='query{ organizations { id name } }'
RAZEE_VARIABLES='{}'

echo "" && echo "GET organizations for current user"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"

# Response like {"data":{"organizations":[{"id":"[uuid]","name":"pOrgName"}]}}
