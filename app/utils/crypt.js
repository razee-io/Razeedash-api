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

const CryptoJS = require('crypto-js');

const tokenCrypt = {
  encrypt: (str, token) => {
    console.log(44444, str, token);
    var out = CryptoJS.AES.encrypt(str, token).toString();
    return out;
  },
  decrypt: (str, token) => {
    var out = CryptoJS.AES.decrypt(str, token).toString(CryptoJS.enc.Utf8);
    return out;
  },
};
module.exports = tokenCrypt;
