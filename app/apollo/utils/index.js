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

var _ = require('lodash');

const buildSearchForResources = (baseSearch, searchStr = '', fromTime, toTime, kinds = []) => {
  let ands = [];

  if (searchStr !== ''){
    const searchExp = { '$text': { '$search': searchStr, '$caseSensitive': false } };
    ands.push(searchExp);
  }

  if (fromTime && toTime) {
    ands.push({
      created: {
        $gte: new Date(fromTime),
        $lte: new Date(toTime),
      },
    });
  } else {
    if (fromTime) {
      ands.push({
        created: {
          $gte: new Date(fromTime),
        },
      });
    }
    if (toTime) {
      ands.push({
        created: {
          $lte: new Date(toTime),
        },
      });
    }
  }
  if(kinds.length > 0){
    ands.push({
      'searchableData.kind': { $in: kinds },
    });
  }

  if (ands.length < 1) {
    return baseSearch;
  }
  ands.push(baseSearch);
  const search = {
    $and: ands,
  };
  return search;
};

var convertStrToTextPropsObj = (str='')=>{
  var out = {};
  // converts 'aaa bbb:ccc ddd:"eee" fff' to { bbb: 'ccc', ddd: 'eee', '$text': 'aaa    fff' }
  var regex = /\b([a-z0-9_.-]+)\s*:\s*(["']?)([^\s]*)\2/ig;
  str = str.replace(regex, (z, key, quote, val)=>{
    if(!_.includes(convertStrToTextPropsObj.invalidFields, key)) {
      out[key] = val;
    }
    return ' ';
  });
  out.$text = _.trim(str);
  return out;
};
convertStrToTextPropsObj.invalidFields = [
  'orgId', 'org_id',
];

convertStrToTextPropsObj('aaa bbb:ccc ddd:"eee" fff');

module.exports = {
  buildSearchForResources, convertStrToTextPropsObj,
};
