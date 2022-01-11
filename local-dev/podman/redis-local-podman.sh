#!/bin/bash

NAME=redis-server
IMAGE=redis

podman kill $NAME && echo "$NAME stopped" || echo "$NAME was already stopped"
podman rm $NAME && echo "$NAME removed" || echo "$NAME was already removed"

# (Re) Create the mongo data dir in podman VM
if [ "$1" == "-f" ];
then
  echo "*****************************"
  echo "DELETING $NAME data directory"
  echo "*****************************"
  podman machine ssh sudo rm -rf /tmp/redisdata
fi
podman machine ssh mkdir -p /tmp/redisdata

# Run the container
C_VOLUMES="--privileged -v /tmp/redisdata:/data:rw"
C_PORT="-p 6379:6379"
C_NAME="--name $NAME"
C_ENV=""
podman run -d $C_NAME $C_PORT $C_VOLUMES $C_ENV $IMAGE
