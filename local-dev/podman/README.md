# Podman

Podman (https://podman.io/) is a free container engine.  It is suitable for running Razeedash-api locally for development purposes, as a replacement for Docker / Docker Compose (see `../compose`).

This directory contains scripts to easily start Redis and MongoDB prior to starting local Razeedash-api.

Usage:

- `./redis-local-podman.sh [-f]`
- `./mongo-local-podman.sh [-f]`

The `-f` argument instructs the script to reset any persisted data, i.e. **overwrite all persisted Mongo data**.  Use with care.

### Volumes

Note that Podman executes containers inside a Fedora CoreOS VM and mounts volumes _from the VM_, not from the system hosting the VM.  To mount local files, they must first be copied into the file system of the VM.

Use `podman machine ssh` to get a terminal session inside the VM and CRUD files and directories to be mounted.  The scripts in this directory do this automatically.

### MacOS Quickstart

1. Install and start Podman:
```bash
brew install podman
podman machine init
podman machine start
# Optional: use podman for any docker cli commands (e.g. `docker ps`)
alias docker=podman
```
1. Start Mongo and Redis:
```bash
./redis-local-podman.sh -f
./mongo-local-podman.sh -f
```
1. Start the local sever (see [../README.md](../README.md))
