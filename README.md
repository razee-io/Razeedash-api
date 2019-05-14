# razeedash-api

Razeedash-API is the interface used by

- app.razee.io
- [watch-keeper](https://github.com/razee-io/watch-keeper)

## Requirements

- Kubernetes CLI Tools
- Kubernetes Cluster
- MongoDB

### OS/X

gettext package is default on most Linux systems.  If you are using OS/X for
local development you may need to install it in order to generate a deployment
YAML.

If you are testing ./build/process-template.sh you will need `brew` installed
and gettext.

```bash
brew update
brew install gettext
brew link --force gettext
```

## Install on Kubernetes

Setup so you can use `kubectl` commands on the target cluster.  For IBM Cloude
Kubernetes Service the following command will get the KUBECONFIG for your
Kubernetes cluster and export the KUBECONFIG variable.

```bash
ibmcloud ks cluster-config <cluster name>
```

### Create secrets and deploy

Generate a base64 encoding for the `mongo_url` to be used in the
razeedash-secret. The following is an example of local mongo deployment.
Not recommended for production use.

<!--Markdownlint-disable MD013-->
```bash
echo -n "mongodb://mongo‑0.mongo:27017,mongo‑1.mongo:27017,mongo‑2.mongo/razeedash?replicaSet=rs0" | base64
```
<!--Markdownlint-enable MD013-->

Create file razeedash-secret.yaml using the generated string provided from the
previous command.

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

If you are using your own managed mongodb system, make sure you
setup the `mongo_url` secret properly.

Apply the secret to kubernetes, build the resource.yml and apply to cluster:

```bash
kubectl apply -f razeedash-secret.yaml
./build/process-template.sh kubernetes/razeedash-api/resource.yaml >/tmp/resource.yaml
kubectl apply -f /tmp/resource.yaml
```

Check logs on all deployed pods to make sure there are no errors.

```bash
for i in `kubectl get pods -n razee --selector=app=razeedash-api | \
  grep razeedash-api | \
  awk '{print $1}'`; do kubectl logs ${i} -n razee --since 5m; done
```

## Example deployment using IBM Cloud

This will deploy the razeedash-api and mongo on a 3 node cluster using IBM
Cloud Kubernetes Service.  

*Note: In a production scenario it is recommended to used a managed Mongo
database service.*

Requirements:

- jq [jq is a lightweight and flexible command-line JSON processor](https://stedolan.github.io/jq/)
- IBM Cloud Account [IBM Cloud](https://www.ibm.com/cloud/)
- IBM Cloud CLI [Setting up the CLI and API](https://cloud.ibm.com/docs/containers?topic=containers-cs_cli_install)
- Kubernetes CLI [Install and Set Up kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/)

### Create Cluster

Cluster must have a minimum of 3 nodes in order to statisfy Mongo.  You can follow
the guide [Setting up clusters and workers](https://cloud.ibm.com/docs/containers?topic=containers-clusters#clusters)
to deploy a clusteer or use a utility script ic_create_cluster.sh located in
[kube-cloud-scripts](https://github.com/razee-io/kube-cloud-scripts).

```bash
ic_create_cluster.sh --name razeetest --workers 3
```

if you have an existing cluster and need to resize

```bash
ibmcloud ks worker-pool-resize \
  --cluster <cluster-name> \
  --worker-pool default \
  --size-per-zone 3
```

Once the cluster (`ibmcloud ks clusters`) is created and in a `normal` state, we
need to get Kubernetes config.

```bash
ibmcloud ks cluster-config razeetest
```

Example

```bash
ibmcloud ks cluster-config razeetest
OK
The configuration for razeetest was downloaded successfully.

Export environment variables to start using Kubernetes.

export KUBECONFIG=~/.bluemix/plugins/container-service/clusters/razeetest/kube-config-wdc07-razeetest.yml
```

### Deploy components

Deploy MongoDB and set up replica sets.  This is based on the guide
[Deploy a MongoDB replica set using IBM Cloud Kubernetes Service](https://developer.ibm.com/tutorials/cl-deploy-mongodb-replica-set-using-ibm-cloud-container-service/)

```bash
# Add razee namespace
kubectl create -f samples/razee-namespace.json
# Deploy MongoDB
kubectl apply -f samples/mongo/mongo-headless-service.yaml
```

Wait until mongo pods are ready.  You can check the status via:

```bash
kubectl get pods
```

Once pods are in a `Running` state continue with the setup process

```bash
# Setup MongoDB replicas
kubectl exec -it mongo-0 -- mongo <samples/mongo/replica.mongo
# Add razeedash secret for mongo_url
kubectl apply -f samples/mongo/secret.yaml
# Get latest release of razeedash-api and deploy
curl -o /tmp/resource.yml -L \
  $(curl -s https://api.github.com/repos/razee-io/razeedash-api/releases/latest \
  | jq .assets[0].browser_download_url | sed -e 's/"//g')
kubectl apply -f /tmp/resource.yaml
```

Check logs across pods using `kc_logs.sh` script from
[kube-cloud-scripts](https://github.com/razee-io/kube-cloud-scripts)

```bash
kc_logs.sh razee razeedash-api 1m
```
