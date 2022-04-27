#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

if [ "$0" = "$BASH_SOURCE" ]; then
  echo "$0 can be sourced to automatically set the RAZEE_USER_TOKEN and RAZEE_ORG_ID variables"
fi

RAZEE_USER_NAME=${1:-pUserName@test.com}
RAZEE_USER_PASS=${2:-pUserPass}
RAZEE_ORG_NAME=${2:-pOrgName}

RAZEE_QUERY='mutation($userName: String!, $email: String!, $userPass: String!, $orgName: String!, $role: String!){ signUp( username: $userName email: $email password: $userPass orgName: $orgName role: $role ) { token } }'
RAZEE_VARIABLES='{"userName":"'"${RAZEE_USER_NAME}"'","email":"'"${RAZEE_USER_NAME}"'","userPass":"'"${RAZEE_USER_PASS}"'","orgName":"'"${RAZEE_ORG_NAME}"'","role":"ADMIN"}'

echo "" && echo "SIGNUP user"
unset RAZEE_USER_TOKEN
RESPONSE=$(${SCRIPT_DIR}/graphqlPost.sh  "${RAZEE_QUERY}" "${RAZEE_VARIABLES}")
echo "Result: $?"

# response should be like {"data":{"signUp":{"token":"TOKENVAL"}}}
export RAZEE_USER_TOKEN=$(echo ${RESPONSE} | jq -r '.data.signUp.token')
#echo "RAZEE_USER_TOKEN: ${RAZEE_USER_TOKEN}"

if [ "${RAZEE_USER_TOKEN}" = "null" ]; then
  echo "" && echo "Error creating user: ${RESPONSE}"
  unset RAZEE_USER_TOKEN
else
  echo "SIGNUP successful"
  echo "RAZEE_USER_TOKEN: ${RAZEE_USER_TOKEN}"
  . ./userGetOrgs.sh
fi
