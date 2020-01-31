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

const buildSearchForResources = (baseSearch, searchStr = '', fromTime, toTime) => {
  let ands = [];
  const tokens = searchStr.split(/\s+/);
  if (tokens.length > 0) {
    ands = tokens.map(token => {
      let searchRegex = {$regex: token, $options: 'i',};
      let ors = [
        {cluster_id: searchRegex,},
        {selfLink: searchRegex},
        {'searchableData.kind': searchRegex,},
        {'searchableData.name': searchRegex,},
        {'searchableData.namespace': searchRegex,},
      ];
      let out = {
        $or: ors,
      };
      return out;
    });
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

  if (ands.length < 1) {
    return null;
  }
  ands.push(baseSearch);
  const search = {
    $and: ands,
  };
  return search;
};

module.exports = buildSearchForResources;
