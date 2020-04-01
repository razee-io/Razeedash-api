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

const _ = require('lodash');

const { ACTIONS, TYPES } = require('../models/const');
const { whoIs, validAuth } = require ('./common');


const resourceResolvers = {
    Query: {
        channels: async(parent, { org_id }, { models, me, req_id, logger }) => {
            const queryName = 'channels';
            logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
            await validAuth(me, org_id, ACTIONS.READ, TYPES.CHANNEL, models, queryName, req_id, logger);
            try{
                var channels = await models.Channel.find({ org_id });
            }catch(err){
                logger.error(err);
                throw err;
            }
            return channels;
        },
    },
};

module.exports = resourceResolvers;
