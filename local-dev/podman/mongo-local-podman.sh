#!/bin/bash

NAME=mongo-server
IMAGE=mongo

podman kill $NAME && echo "$NAME stopped" || echo "$NAME was already stopped"
podman rm $NAME && echo "$NAME removed" || echo "$NAME was already removed"

# (Re) Create the mongo data dir in podman VM
if [ "$1" == "-f" ];
then
  echo "*****************************"
  echo "DELETING $NAME data directory"
  echo "*****************************"
  podman machine ssh sudo rm -rf /tmp/mongo-01/db
fi
podman machine ssh mkdir -p /tmp/mongo-01/db
cat ./mongo-user.sh | podman machine ssh "cat > /tmp/mongo-01/mongo-user.sh"
podman machine ssh chmod a+rx /tmp/mongo-01/mongo-user.sh

# Run the container
C_VOLUMES="--privileged -v /tmp/mongo-01/db:/data/db:rw -v /tmp/mongo-01/mongo-user.sh:/docker-entrypoint-initdb.d/mongo-user.sh:ro"
C_PORT="-p 27117:27017"
C_NAME="--name $NAME"
C_ENV="--env MONGO_INITDB_ROOT_USERNAME=${MONGO_INITDB_ROOT_USERNAME:-root} --env MONGO_INITDB_ROOT_PASSWORD=${MONGO_INITDB_ROOT_PASSWORD:-rootsecret} --env MONGO_INITDB_DATABASE=${MONGO_INITDB_DATABASE:-meteor} --env MONGO_NON_ROOT_USERNAME=${MONGO_NON_ROOT_USERNAME:-meteor} --env MONGO_NON_ROOT_PASSWORD=${MONGO_NON_ROOT_PASSWORD:-secret}"
podman run -d $C_NAME $C_PORT $C_VOLUMES $C_ENV $IMAGE
