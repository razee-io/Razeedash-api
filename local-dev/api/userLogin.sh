#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_USER_NAME=${1:-pUserName@test.com}
RAZEE_USER_PASS=${2:-pUserPass}
RAZEE_ORG_NAME=${3:-pOrgName}

RAZEE_QUERY='mutation($userName: String!, $userPass: String!){ signIn( login: $userName password: $userPass ) { token } }'
RAZEE_VARIABLES='{"userName":"'"${RAZEE_USER_NAME}"'","userPass":"'"${RAZEE_USER_PASS}"'"}'

RAZEE_USER_TOKEN=

echo "" && echo "SIGNIN user"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"

# response will be like {"data":{"signUp":{"token":"TOKENVAL"}}}