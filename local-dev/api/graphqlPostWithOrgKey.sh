#!/bin/bash

RAZEE_URL=${RAZEE_URL:-http://localhost:3333/graphql}

RAZEE_QUERY=${1}
RAZEE_VARIABLES=${2}

[ ! -z "${RAZEE_ORG_KEY}" ] && AUTH_HEADER="razee-org-key: ${RAZEE_ORG_KEY}" || AUTH_HEADER="no-auth-available: asdf"

# Avoid extraneous echo statements so that results can be parsed, e.g. by `jq '.data'`.  Temporarily restore these lines if desired for debugging.
#echo
#echo "AUTH_HEADER: ${AUTH_HEADER}"
#echo "RAZEE_URL: ${RAZEE_URL}"
#echo "QUERY: ${RAZEE_QUERY}"
#echo "VARIABLES: ${RAZEE_VARIABLES}"
#echo

# add '-v' for verbose
# add '-w "HTTP: %{http_code}"' to see response code
curl \
-X POST \
-H "Content-Type: application/json" \
-H "${AUTH_HEADER}" \
-H "Origin: razeetest.com" \
--ipv4 \
--data '{ "query": "'"${RAZEE_QUERY}"'", "variables": '"${RAZEE_VARIABLES}"' }' \
${RAZEE_URL}

exit $?
