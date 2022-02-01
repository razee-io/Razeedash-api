#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_USER_NAME=${1:-pUserName@test.com}
RAZEE_USER_PASS=${2:-pUserPass}
RAZEE_ORG_NAME=${2:-pOrgName}

RAZEE_QUERY='mutation($userName: String!, $email: String!, $userPass: String!, $orgName: String!, $role: String!){ signUp( username: $userName email: $email password: $userPass orgName: $orgName role: $role ) { token } }'
RAZEE_VARIABLES='{"userName":"'"${RAZEE_USER_NAME}"'","email":"'"${RAZEE_USER_NAME}"'","userPass":"'"${RAZEE_USER_PASS}"'","orgName":"'"${RAZEE_ORG_NAME}"'","role":"ADMIN"}'

echo "" && echo "SIGNUP user"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"

# response will be like {"data":{"signUp":{"token":"TOKENVAL"}}}
