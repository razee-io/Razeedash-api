#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

RAZEE_HISTORY_UUID=${1:-${RAZEE_HISTORY_UUID:-pHistUuid}}
RAZEE_RESOURCE_ID=${2:-${RAZEE_RESOURCE_ID:-pResId}}
RAZEE_ORG_ID=${3:-${RAZEE_ORG_ID:-pOrgId}}

RAZEE_QUERY='
query(
  $orgId:String!, $id:String!, $histId:String
){
  resource(orgId:$orgId, id:$id, histId:$histId) {
    id, orgId, histId, selfLink, searchableData, created, updated, lastModified, cluster { clusterId, name }, subscription { uuid, name, channelName, channelUuid, version, versionUuid }
  }
}
'
RAZEE_QUERY=$(echo $RAZEE_QUERY | tr '
' ' ')
RAZEE_VARIABLES='{"orgId":"'"${RAZEE_ORG_ID}"'","id":"'"${RAZEE_RESOURCE_ID}"'","histId":"'"${RAZEE_HISTORY_UUID}"'"}'

echo "" && echo "GET resource by id"
${SCRIPT_DIR}/graphqlPost.sh "${RAZEE_QUERY}" "${RAZEE_VARIABLES}"
echo "" && echo "Result: $?"
