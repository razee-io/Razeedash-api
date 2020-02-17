/**
* Copyright 2019 IBM Corp. All Rights Reserved.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

const deleteResource = async (req, res) => {
  try {
    const cluster_id = req.cluster.cluster_id;
    const Resources = req.db.collection('resources');
    await Resources.deleteMany({ org_id: req.org._id, cluster_id: cluster_id});
    req.log.info(`cluster ${cluster_id} resources deleted`);
    res.status(200).send('cluster resources removed');
  } catch (error) {
    req.log.error(error.message);
    return res.status(500).json({ status: 'error', message: error.message }); 
  }
};

module.exports = { deleteResource };
