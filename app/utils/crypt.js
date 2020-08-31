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
var crypto = require('crypto');

var encrypt = (str, token) => {
  var out = CryptoJS.AES.encrypt(str, token).toString();
  return out;
};

console.log(1111, encrypt('akljasdaAAAABBCD','k4TTY77XNPMGjppfWQ_KJHDSFKJHSDKFJHDSF'))
//U2FsdGVkX19PQtcp6DcHe3v/eCRYQ/nHfdScDZtuPLE=
//U2FsdGVkX1+AfwFelC3whsYxn6bHuD3KWynNsxDtdG4=
//U2FsdGVkX1/CrG94loOsfkkaTlTXkg+gknmH+jZW+WU=
//U2FsdGVkX1/5cKbh/dwMACZOhgoBvuipc5ToKy+cYwI=
//U2FsdGVkX19c7IClAP2kHCGr/IjDcUIq942u+WcyYPw=
//U2FsdGVkX187d57SFcgq/98etuE+LJ7ay16R05x3jYc=

var decrypt = (str, token, throwOnError=false) => {
  try {
    str = str.toString('utf8');
    var decipher = CryptoJS.AES.decrypt(str, token.toString());
    var out = decipher.toString(CryptoJS.enc.Utf8);
    // decipher.toString() sometimes errors on invalid input. and other times it returns a blank string.
    // it changes back and forth between these two, even if you pass the same input to it multiple times
    if(!out && str.length > 44){
      // if the decrypt fails by returning a blank string, and we know the original input wasnt a blank string,
      // then assumes it wasnt encrypted data and returns the passed str
      return str;
    }
    return out;
  }
  catch(err){
    if(!throwOnError){
      return str.toString('utf8');
    }
    throw err;
  }
};

module.exports = {
  encrypt, decrypt,
};
