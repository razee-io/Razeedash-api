# Local Development Tools

This folder contains files for local development:
- `api/`: Scripts for manually testing the Razeedash-api GraphQL and REST APIs
- `compose/`: Scripts for starting Redis and Mongo for local development using Docker Compose (https://docs.docker.com/compose/)
- `podman/`: Scripts for starting Redis and Mongo for local development using Podman (https://podman.io/)

## Local Server

Once local MongoDB and Redis are available, via `podman/` (recommended) or `compose/` scripts, start the server:

1. Start Razeedash-api from the base directory (`../`)
```bash
export MONGO_URL=mongodb://meteor:secret@localhost:27117/meteor
export AUTH_MODEL=local
npm install
npm start
```
1. Verify Razeedash-api functionality from the `local-dev/api/` directory
```bash
cd local-dev/api
./userCreate.sh
export RAZEE_USER_TOKEN=[from userCreate.sh output]
./userGetOrgs.sh
export RAZEE_ORG_ID=[from userGetOrgs.sh output]
./clusterCreate.sh testcluster1
./clusterGetByName.sh testcluster1
./clusterDeleteById.sh [uuid from clusterCreate.sh or clusterGetByName.sh output]
```
