# razeedash-api

[![Build Status](https://travis-ci.com/razee-io/Razeedash-api.svg?branch=master)](https://travis-ci.com/razee-io/Razeedash-api) [![Greenkeeper badge](https://badges.greenkeeper.io/razee-io/Razeedash-api.svg)](https://greenkeeper.io/)

Razeedash-API is the interface used by

- app.razee.io
- [watch-keeper](https://github.com/razee-io/watch-keeper)

## Requirements

- Kubernetes CLI Tools
- Kubernetes Cluster
- MongoDB

## Environment Variables
<!--Markdownlint-disable MD013-->
| Name | Required | Default Value |
| ---- | -------- | ------------- |
| MONGO_URL              | yes                    | 'mongodb://localhost:3001/meteor' |
| MONGO_DB_NAME          | yes                    | 'meteor' |
| S3_ENDPOINT            | no                     | n/a |
| S3_ACCESS_KEY_ID       | if S3_ENDPOINT defined | n/a |
| S3_SECRET_ACCESS_KEY   | if S3_ENDPOINT defined | n/a |
| S3_LOCATION_CONSTRAINT | no                     | 'us-standard'|

If S3_ENDPOINT is defined then encrypted cluster YAML is stored in S3 otherwise
it will be stored in the mongoDB.

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
echo -n "mongodb://mongo:27017" | base64
```

Note:
Production MongoDB usually is a minimum of 3 nodes using replica sets.  That
definition would look something like:

```bash
echo -n "mongodb://mongo‑0:27017,mongo‑1:27017,mongo‑2/razeedash?replicaSet=rs0" | base64
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
  mongo_url: bW9uZ29kYjovL21vbmdvOjI3MDE3L3JhemVlZGFzaAo=
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
URL:  http://localhost:3333/api-docs/

## Web hooks

Implemented web hooks so data in Razeedash can be augmented by third-party
services such as test suites and vulnerability scanners.

Components are:

- Web hook creation
- Web hook deletion
- Trigger by resource ID
- Trigger by Regex
- Callback response

### Web hook definition

`POST /v2/webhook/` will create a web hook and the header must contain the `razee-org-key`

JSON body for web hook triggered by cluster change:

```json
{
          "cluster_id": "ID of the cluster",
          "trigger": "cluster",
          "kind": "Deployment",
          "field": "searchableData.name",
          "filter": "regex string example to match, `(watch-keeper)`",
          "service_url": "URL of service to POST upon triggering"
}
```

**Note: field and filter are optional. If not defined the above will fire if a
`deployment` resource kind is changed**

JSON body for web hook triggered by image change:

```json
{
          "trigger": "image",
          "kind": "image",
          "field": "name",
          "filter": "regex string example, `(quay.io\\/mynamespace)`",
          "service_url": "URL of service to POST upon triggering"
}
```

**Note:** field and filter are optional. If not defined the above will fire if
any new image is deployed on an organization's clusters

- kind: Kind would be the type of resource or in a special case, images
- trigger: cluster, image
- id: ID of the resource used in trigger OR
- field: field dot-notation into JSON to apply a filter
- filter: regex parameter to match if the trigger should fire or not if field
  is defined
- service URL:  URL to call if the web hook is triggered

### Web hook deletion

`DELETE /v2/webhook/:id` will delete the web hook.   Current badge data will not
 be affected by the deletion.   If a callback for that webhook_id  occurs then
 the badge would be removed from the resource and 404 sent back to the calling
 service.

### Trigger Logic

Trigger points will be added to Razeedash API for when:

- New image is deployed
- A resource kind is deployed or modified on a specific cluster

Trigger will also have to pass regex filter in order to fire the web hook.  If
determine to call the web hook the service URL is called and relevant data
posted along with a callback URL.  The called service can augment the data by
calling the callback URL.

Razeedash API will look up the resource to make sure it is still being used and
if not, return a 404 indicating to the calling service it should no longer
provide updates on this web hook.   If found the badge information will added
to resource.

Calling the service by cluster trigger POSTs:

```json
{
  "cluster_id": "ID of the cluster",
  "cluster_metadata": "JSON array for the cluster metadata",
  "resource_id": "ID of the resource to badge",
  "resource_kind": "What kind of resource",
  "resource": "JSON of the resource object",
  "webhook_id": "ID of the webhook definition",
  "callback_url":  "URL to POST badge data"
}
```

Calling the service by image trigger POSTs:

```json
{
  "image_id": "ID of the image",
  "image_name": "Image name",
  "webhook_id": "ID of the webhook definition",
  "callback_url":  "URL to POST badge data"
}
```

**Scenario:** Trigger by resource ID

User defines a web hook that if a deployment changes or something new is added
to call a web hook to run integration tests.

```json
{
  "kind": "Deployment",
  "trigger": "cluster",
  "id": "fb56c61b676844d292f1f18e719c31f2",
  "service_url": "https://my.testingservice.com/run_integration"
}
```

New deployment is rolled out to cluster designated as the "staging" cluster
environment.  Web hook is called to service_url and the deployment.yaml, org_id,
cluster_id are all posted along with a a call back URL.

The testing service calls the callback with badge data:

- badge: URL of a running man
- description: "Running tests"
- link: (link to the live tests being run)
- status: info

Testing service runs integration tests on the staging cluster and and calls the
callback with badge data:

- badge: URL of a green circle
- description: "All tests completed successfully"
- link: (link to the test logs)
- status: info

**Scenario:**  Trigger by regex

User defines a web hook that if a deployment changes or something new is added
to call a web hook to run integration tests.

```json
{
  "kind": "image",
  "trigger": "image",
  "field": "name",
  "filter": "(quay.io\/mynamespace)",
  "service_url": "https://my.quayscanner.com/check"
}
```

When a new image is deployed, the name of the image is checked against the
filter, if defined, and then the service_url is called with image name, image
ID, org_id and callback URL.

The scanner service calls the callback with badge data:

- badge: URL image of binoculars
- description: "Looking for vulnerabilities"
- link: (link to service of that image being checked)
- status: info

Razeedash API checks to see if the image is still in use and returns a 201

The image is scanned and shown clean and will be rechecked by the service in 24
hours.  In the meantime it calls the callback with badge data:

- badge: URL image of green circle
- description: "no vulnerabilities"
- link: (link to service of that image results)
- status: info

Razeedash API checks to see if the image is still in use and returns a 201

24 hours later a minor vulnerabilities is discovered and the service calls the
callback again with badge data:

- badge: URL image of yellow circle
- description: "minor vulnerabilities detected"
- link: (link to service of that image results)
- status: warning

Razeedash API checks to see if the image is still in use and returns a 201

24 hours later a major vulnerability is discovered and the service calls the
callback again with badge data:

- badge: URL image of red circle
- description: "major vulnerabilities detected"
- link: (link to service of that image results)
- status: error

Razeedash API checks to see if the image is still in use and finds it is not and
returns a 404 to the vulnerability service.  The vulnerability service should
then stop reporting that image security issues from now on.

**Scenario:** Filter a specific resource

User defines a web hook that filters for a specific resource.  In this case we
are looking for new or changed deployments where the field `metadata.name`
matches `watch-keeper` on a specific cluster to trigger the web hook.

```json
{
  "kind": "Deployment",
  "field": "metadata.name",
  "filter": "(watch-keeper)",
  "trigger": "cluster",
  "id": "fb56c61b676844d292f1f18e719c31f2",
  "service_url": "https://my.testingservice.com/run_integration"
}
```

New deployment is rolled out to cluster designated as the "staging" cluster
environment.  Web hook is called to service_url and the deployment.yaml, org_id,
cluster_id are all posted along with a a call back URL.

### Callback response from remote service

When the remote service wants to add a badge as a result of the web hook call,
the POST to /v2/callback should have the following body:

Header should contain the `razee-org-key`

```json
{
    "webhook_id": "id of the webhook from initial call to service",
    "url": "URL of the badge image",
    "description": "short description of badge",
    "link": "URL link for details",
    "status": "info | error | warning"
}
```

Razeedash API will accept the callback URL and make sure the webhook and
resource is still valid.  If the resource is no longer in use or the webhook
was deleted then the callback response will return a 404.  If valid it will add
the augmented data to the resource.

The resource will have a new attribute `badges`.  The badge will replace any
existing badge with the same webhook_id or if it does not exist, add to the array.
