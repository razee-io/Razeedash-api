/**
 * Copyright 2021 IBM Corp. All Rights Reserved.
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

/*
This module provides support for add-in auth modules.
The `EXTERNAL_AUTH_MODELS` environment variable must be a JSON string that provides the modules to load and use for a non-builtin `AUTH_MODEL` value.
E.g. to support setting `AUTH_MODEL` to `iam`, the JSON string would be:
{
  "iam": {
    "classPath": "[path]/auth_iam.js",
    "modelPath": "[path]/user.iam.schema.js",
    "initPath": "[path]/init.iam.js",
    "orgPath": "[path]/organization.iam.schema.js"
  }
}
*/

const ExternalAuthModels = process.env.EXTERNAL_AUTH_MODELS ? JSON.parse(process.env.EXTERNAL_AUTH_MODELS) : {};

console.log( `External Auth Models: ${JSON.stringify(ExternalAuthModels, null, 4)}` );

module.exports = {
  ExternalAuthModels: ExternalAuthModels
}
