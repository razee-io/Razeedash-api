#!/bin/bash

# Use this script to authenticate with the IBM Cloud and set appropriate environment variables
# Requires jq and ibmcloud cli
# Example usage (test cloud): `. ./cloudLogin.sh`
# Example usage (prod cloud): `. ./cloudLogin.sh prod jp-tok`

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

if [ "$0" = "$BASH_SOURCE" ]; then
  echo "This script must be run sourced ('. ./cloudLogin.sh')"
  exit 1
fi

CLOUDPREFIX=test.
CLOUDREGION=
if [[ "$1" == "prod" ]]; then
  CLOUDPREFIX=
  CLOUDREGION=$2.
fi

ibmcloud logout
ibmcloud login -a ${CLOUDPREFIX}cloud.ibm.com --sso

export RAZEE_USER_TOKEN=$(ibmcloud iam oauth-tokens --output json | jq --raw-output '.iam_token' | sed 's/^Bearer //')
export RAZEE_URL=https://config.${CLOUDREGION}satellite.${CLOUDPREFIX}cloud.ibm.com/graphql
export RAZEE_REST_URL=https://config.${CLOUDREGION}satellite.${CLOUDPREFIX}cloud.ibm.com/api/v3
export RAZEE_V2_URL=https://config.${CLOUDREGION}satellite.${CLOUDPREFIX}cloud.ibm.com/api/v2
export RAZEE_ORG_ID=$(ibmcloud target --output json | jq --raw-output '.account.guid')

echo "RAZEE_URL: $RAZEE_URL"
echo "RAZEE_ORG_ID: $RAZEE_ORG_ID"
#echo "RAZEE_USER_TOKEN: $RAZEE_USER_TOKEN"
echo "RAZEE_USER_TOKEN: [set]"
