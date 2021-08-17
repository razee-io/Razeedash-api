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

let pluginName = process.env.MAINTENANCE_PLUGIN || 'maintenance-default';
const plugin = require( pluginName );

let maintenanceMode = plugin.maintenanceMode;

// Attempt to load featureflag from legacy mix-in code (this code will be removed once legacy featureflag mix-in code is converted to a plugin)
try {
  const { FeatureFlagClient } = require('../featureflag');
  const ffClient = FeatureFlagClient.getInstance();

  pluginName = 'featureflag';
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
  log.warn(`featureflag plugin was not loaded. Database write operations will be determined by plugin: ${pluginName}.`);
}

const maintenanceMessage = `The operation can not complete because the database is in maintenance mode (plugin: ${pluginName})`;

log.error(`maintenanceMode test: ${maintenanceMode('dummyflag', 'dummykey')}`);

module.exports = { maintenanceMode, maintenanceMessage };
