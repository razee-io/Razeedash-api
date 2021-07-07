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

const log = require('../log').createLogger('razeedash-api/app/utils/maintenance');

let maintenanceMode = () => false;

try {
  const { FeatureFlagClient } = require('../featureflag');
  const ffClient = FeatureFlagClient.getInstance();

  maintenanceMode = async (flag, key) => {
    if(!flag || !key) {
      log.debug('Maintenance flag and key are not defined. All database write operations are enabled.');
      return false;
    } else {
      try {
        const maintenanceModeEnabled = await ffClient.variation(flag, {'key': key}, false);
        log.debug(`Maintenance mode is set to: ${maintenanceModeEnabled} for flag ${flag} and user ${key}`);
        return maintenanceModeEnabled;
      } catch (error) {
        log.error('There was a problem reading from launch darkly so maintenance mode will not be enabled');
        log.error(error);
        return false;
      }
    }
  };
} catch (error) {
  log.debug('A maintenance mode plugin was not loaded. All database write operations are enabled.');
  log.error(error);
}

const maintenanceMessage = 'The operation can not complete because the database is in maintenance mode';

module.exports = { maintenanceMode, maintenanceMessage };
