#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

if [ "$0" = "$BASH_SOURCE" ]; then
  echo "$0 can be sourced to automatically set the RAZEE_USER_TOKEN and RAZEE_ORG_ID variables"
fi

RAZEE_USER_NAME=${1:-pUserName@test.com}
RAZEE_USER_PASS=${2:-pUserPass}
RAZEE_ORG_NAME=${3:-pOrgName}

RAZEE_QUERY='mutation($userName: String!, $userPass: String!){ signIn( login: $userName password: $userPass ) { token } }'
RAZEE_VARIABLES='{"userName":"'"${RAZEE_USER_NAME}"'","userPass":"'"${RAZEE_USER_PASS}"'"}'

echo "" && echo "SIGNIN user"
unset RAZEE_USER_TOKEN
unset RAZEE_URL
RESPONSE=$(${SCRIPT_DIR}/graphqlPost.sh  "${RAZEE_QUERY}" "${RAZEE_VARIABLES}")
echo "Result: $?"

# response should be like {"data":{"signIn":{"token":"TOKENVAL"}}}
export RAZEE_USER_TOKEN=$(echo ${RESPONSE} | jq -r '.data.signIn.token')
#echo "RAZEE_USER_TOKEN: ${RAZEE_USER_TOKEN}"

if [ "${RAZEE_USER_TOKEN}" = "null" ]; then
  echo "" && echo "Error logging in: ${RESPONSE}"
  unset RAZEE_USER_TOKEN
else
  echo "SIGNIN successful"
  echo "RAZEE_USER_TOKEN: ${RAZEE_USER_TOKEN}"
  . ./userGetOrgs.sh
fi
