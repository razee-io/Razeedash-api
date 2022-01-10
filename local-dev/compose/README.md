# Docker

For historical reasons, Compose files are located in [../../compose/](../../compose/)

### MacOS Quickstart

1. Install and start Docker Desktop
1. Create Mongo and Redis data directories:
```bash
mkdir -p /tmp/redisdata
mkdir -p /tmp/mongo-01/db
# Optional remove old data
rm -rf /tmp/mongo-01/db/*
```
1. Start Mongo and Redis (from `../../compose/`)
```bash
docker-compose -f mongo-local-01.yaml up -d
docker-compose -f redis-local.yaml up -d
```
1. Start the local sever (see [../README.md](../README.md))
