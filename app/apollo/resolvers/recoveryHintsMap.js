/**
 * Copyright 2020 IBM Corp. All Rights Reserved.
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

// api method name to reveryHints map. We will populate this map later.
const recoveryHintsMap = {
  resources: {
    ForbiddenError: 'You do not have enough permission to list all the Kubernetes resources in the account. Scope your request with the cluster or subscription for resources that you do have permissions to list, and try again.',
  }
};

module.exports = recoveryHintsMap;