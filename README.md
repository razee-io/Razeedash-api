# razeedash-api

API for app.razee.io

## Requirements

Kubernetes Cluster

## IBM Cloud Sample Setup

This is an example deployment of razeedash-api to demonstrate basic setup. Mongo
requirement is just a stateful deployment.  In a production scenario it is
recommended to used a managed Mongo database service.

Requirement:

- IBM Cloud Account
- IBM Cloud CLI [Setting up the CLI and API](https://cloud.ibm.com/docs/containers?topic=containers-cs_cli_install)
- Deploy a cluster [Setting up clusters and workers](https://cloud.ibm.com/docs/containers?topic=containers-clusters#clusters)
- Mongo

### Mongo

If you have a managed MongoDB you can follow this
[guide](https://developer.ibm.com/tutorials/cl-deploy-mongodb-replica-set-using-ibm-cloud-container-service/)
to deploy mongodb to your kubernetes cluster for demo purposes.  Make
sure your worker pool has at least 3 nodes:

```bash
ibmcloud ks worker-pool-resize \
  --cluster <cluster-name> \
  --worker-pool default \
  --size-per-zone 3
```

### Create secret

razeedash-secret.yaml

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: razeedash-secret
  namespace: razee
type: Opaque
data:
  mongo_url: bW9uZ29kYjovL21vbmdv4oCRMC5tb25nbzoyNzAxNyxtb25nb+KAkTEubW9uZ286MjcwMTcsbW9uZ2/igJEyLm1vbmdvL215cHJvamVjdD9yZXBsaWNhU2V0PXJzMA==
```

Note the value of the `mongo_url` was generated via the following command:

<!--Markdownlint-disable MD013-->
```bash
echo -n "mongodb://mongo‑0.mongo:27017,mongo‑1.mongo:27017,mongo‑2.mongo/razeedash?replicaSet=rs0" | base64
```
<!--Markdownlint-enable MD013-->

If you are using your own managed mongodb system, make sure you
setup the secret properly.

Apply the secret to kubernetes:

```bash
kubectl apply -f razeedash-secret.yaml
```

## Local development Notes

### OS/X (Optional)

If you are testing ./build/process-template.sh you will need `brew` installed
and gettext.

```bash
brew update
brew install gettext
brew link --force gettext
```

### Build resource template

```bash
./build/process-template.sh kubernetes/razeedash-api/resource.yaml >/tmp/resource.yaml
```
