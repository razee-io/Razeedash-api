# razeedash-api

[![Build Status](https://travis-ci.com/razee-io/Razeedash-api.svg?branch=master)](https://travis-ci.com/razee-io/Razeedash-api)
[![Dependabot Status](https://api.dependabot.com/badges/status?host=github&repo=razee-io/Razeedash-api)](https://dependabot.com)

Razeedash-API is the interface used by

- [Razeedash](https://github.com/razee-io/Razeedash)
- [watch-keeper](https://github.com/razee-io/watch-keeper)

## Requirements

- Kubernetes CLI Tools
- Kubernetes Cluster
- MongoDB

## Environment Variables
<!--Markdownlint-disable MD013-->
| Name | Required | Default Value |
| ---- | -------- | ------------- |
| MONGO_URL               | yes                    | 'mongodb://localhost:3001/meteor' |
| MONGO_DB_NAME           | yes                    | 'meteor' |
| S3_ENDPOINT             | no                     | n/a |
| S3_ACCESS_KEY_ID        | if S3_ENDPOINT defined | n/a |
| S3_SECRET_ACCESS_KEY    | if S3_ENDPOINT defined | n/a |
| S3_LOCATION_CONSTRAINT  | no                     | 'us-standard'|
| S3_CHANNEL_BUCKET       | no                     | 'razee'|
| S3_RESOURCE_BUCKET      | no                     | S3_CHANNEL_BUCKET or 'razee'|
| ORG_ADMIN_KEY           | no                     | n/a |
| ADD_CLUSTER_WEBHOOK_URL | no                     | n/a |
| AUTH_MODEL              | no                     | 'default' [default, local, passport.local] are supported |

If S3_ENDPOINT is defined then encrypted cluster YAML is stored in S3 otherwise
it will be stored in the mongoDB.

ORG_ADMIN_KEY is required if you plan on adding organizations using the api/v2/orgs endpoint

ADD_CLUSTER_WEBHOOK_URL signifies the webhook endpoint to hit when a cluster is added.
Razee will do a POST request to this url with json data `{ org_id, cluster_id, cluster_name }`.
If a `razeedash-add-cluster-webhook-headers-secret` exists in the namespace, its key-value
pairs will be used as headers in the request.
For instance, if you would like to send an Authorization header in the request to verify that
razee is sending the webhook, you can create a secret like so:

```yaml
apiVersion: v1
kind: Secret
metadata:
  namespace: razee
  name: razeedash-add-cluster-webhook-headers-secret
stringData:
  Authorization: SOME_APIKEY
```

For local development, put the headers as files in the
`/var/run/secrets/razeeio/razeedash-api/add-cluster-webhook-headers` directory.  
For instance:  
`echo "SOME_APIKEY" > /var/run/secrets/razeeio/razeedash-api/add-cluster-webhook-headers/Authorization`  
(you may need sudo to perform this operation).

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

## Run locally for development

To run Razeedash-api locally, Redis and MongoDB can be easily run in containers:

- Podman (recommended): See [./local-dev/podman/README.md](./local-dev/podman/README.md)
- Docker / Docker Compose: See [./local-dev/compose/README.md](./local-dev/compose/README.md)

Once Redis and MongoDB are running, execute:

```bash
export MONGO_URL=mongodb://meteor:secret@localhost:27117/meteor
export AUTH_MODEL=local
npm install
npm start
```

## Install on Kubernetes

Setup so you can use `kubectl` commands on the target cluster.  For IBM Cloud
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
echo -n "mongodb://mongo:27017" | base64
```

Note:
Production MongoDB usually is a minimum of 3 nodes using replica sets.  That
definition would look something like:

```bash
echo -n "mongodb://mongo‑0:27017,mongo‑1:27017,mongo‑2/razeedash?replicaSet=rs0&tls=true" | base64
```

`tls=true` should be at the end of your connection string when connecting to a hosted mongo.

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
  mongo_url: bW9uZ29kYjovL21vbmdvOjI3MDE3L3JhemVlZGFzaAo=
```

Add org_admin_key to the data section of `razeedash-secret` in order to control
organizations using the `api/v2/orgs` endpoint

<!--Markdownlint-disable MD013-->
```bash
echo -n abcdefghijklmnop012345678 | base64
# outputs YWJjZGVmZ2hpamtsbW5vcDAxMjM0NTY3OA==
```

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: razeedash-secret
  namespace: razee
type: Opaque
data:
  mongo_url: bW9uZ29kYjovL21vbmdvOjI3MDE3L3JhemVlZGFzaAo=
  org_admin_key: YWJjZGVmZ2hpamtsbW5vcDAxMjM0NTY3OA==
```

If you are using your own managed mongodb system, make sure you
setup the `mongo_url` secret properly.  For example, your mongo_url
connection string might look something like this:

```bash
echo -n "mongodb://mongo‑0:27017,mongo‑1:27017,mongo‑2/razeedash?replicaSet=rs0&tls=true" | base64
# bW9uZ29kYjovL21vbmdv4oCRMDoyNzAxNyxtb25nb+KAkTE6MjcwMTcsbW9uZ2/igJEyL3JhemVlZGFzaD9yZXBsaWNhU2V0PXJzMCZ0bHM9dHJ1ZQ==
```

Note that `tls=true` should be at the end of your connection string.

You will also need to add `mongo_cert`
to `razeedash-secret`.  This will contain a base64 encoded copy of the tls
certificate used to access your managed mongodb.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: razeedash-secret
  namespace: razee
type: Opaque
data:
  mongo_url: bW9uZ29kYjovL21vbmdv4oCRMDoyNzAxNyxtb25nb+KAkTE6MjcwMTcsbW9uZ2/igJEyL3JhemVlZGFzaD9yZXBsaWNhU2V0PXJzMCZ0bHM9dHJ1ZQ==
  mongo_cert: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCnlvdXIgbW9uZ28gY2VydCBnb2VzIGhlcmUKLS0tLS1FTkQgQ0VSVElGSUNBVEUtLS0tLQo=
```

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
database service, like [IBM Cloud Databases for MongoDB](https://cloud.ibm.com/catalog/services/databases-for-mongodb).*

Requirements:

- jq [jq is a lightweight and flexible command-line JSON processor](https://stedolan.github.io/jq/)
- IBM Cloud Account [IBM Cloud](https://www.ibm.com/cloud/)
- IBM Cloud CLI [Setting up the CLI and API](https://cloud.ibm.com/docs/containers?topic=containers-cs_cli_install)
- Kubernetes CLI [Install and Set Up kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/)

### Create Cluster

You can use a utility script ic_create_cluster.sh located in
[kube-cloud-scripts](https://github.com/razee-io/kube-cloud-scripts) or
follow the [(IBM Containers CLI plugin documentation](https://cloud.ibm.com/docs/containers?topic=containers-cli-plugin-cs_cli_reference#cs_cluster_create)
to create a cluster.

```bash
ic_create_cluster.sh --name razeetest
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

Note: Setup 3 node MongoDB
Cluster must have a minimum of 3 nodes in order to statisfy Mongo.  You can follow
the guide [Setting up clusters and workers](https://cloud.ibm.com/docs/containers?topic=containers-clusters#clusters)
to deploy a 3 node MongoDB replica set.

### Deploy components

Deploy MongoDB and set up replica sets.  This is based on the guide
[Deploy a MongoDB replica set using IBM Cloud Kubernetes Service](https://developer.ibm.com/tutorials/cl-deploy-mongodb-replica-set-using-ibm-cloud-container-service/)
Individually

```bash
# Add razee namespace, single mongo, razeedash secret
kubectl apply -f samples/namespace.yaml
kubectl apply -f samples/persistentVolume.yaml
kubectl apply -f samples/persistentVolumeClaim.yaml
kubectl apply -f samples/mongo.yaml
kubectl apply -f samples/service.yaml
kubectl apply -f samples/secret.yaml
```

or All in one command

```bash
# Add razee namespace, single mongo, razeedash secret
kubectl apply -f samples/allinone.yaml
```

Wait until mongo pods are ready.  You can check the status via:

```bash
kubectl get pods
```

Once pods are in a `Running` state continue with the setup process

```bash
# Get latest release of razeedash-api and deploy
kubectl apply -f "https://github.com/razee-io/razeedash-api/releases/latest/download/resource.yaml"
```

Check logs across pods using `kc_logs.sh` script from
[kube-cloud-scripts](https://github.com/razee-io/kube-cloud-scripts)

```bash
kc_logs.sh razee razeedash-api 1m
```

## Swagger API

Swagger UI is available and if started locally can be accessed via the following
URL:  [http://localhost:3333/api-docs/](http://localhost:3333/api-docs/)

## GraphQL for local development

```shell
export AUTH_MODEL=local
```

Then start the razeedash-api server, you will see a message like bellow from the console

```shell
🏄 Apollo server listening on http://[::]:3333/graphql
```

the graphql playground is enabled and could be accessed at [http://localhost:3333/graphql](http://localhost:3333/graphql)  
if `NODE_ENV` is not equal to `production`. For `local` authorization model, signUp graphql  
API is provided to sign-up a user, for example:

```graphql
mutation {
  signUp(
    username: "test@test.com"
    email: "test@test.com"
    password: "password123"
    org_name: "test_org"
    role: "ADMIN"
  ) {
    token
  }
}
```

If a user is already signed up, then signIn api could be used to sign-in a user, for example:

```graphql
mutation {
  signIn(login: "test@test.com" password:"password123") {
    token
  }
}
```

Both APIs return a JWT token, which you could use to query other graphql APIs. e.g. Following
graphql query, will return organizations a user belongs to:

```graphql
query {organizations {
  _id
  name
}}
```

With the following HTTP Header:

```json
{"Authorization": "Bearer <the token value returned from signUp or signIn>"}
```

You could also query registrationUrl for the user, e.g.

```graphql
query {
  registrationUrl(org_id: "<the orgnization_id returned from organizations graphql api >") {
    url
  }
}
```

With the following HTTP Header:

```json
{"Authorization": "Bearer <the token value returned from signUp or signIn>"}
```

For all other supported graphql APIs, please click `DOCS` or `SCHEMA` from the graphql play-ground
