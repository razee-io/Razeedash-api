/**
 * Copyright 2020, 2022 IBM Corp. All Rights Reserved.
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

const { ValidationError } = require('apollo-server');
const { DIRECTIVE_LIMITS } = require('../models/const');
const mongoSanitize = require('express-mongo-sanitize');

/*
Note: validation is no longer done by 'directives', see comments in ../index.js before `createApolloServer` for details
*/

const validateString = function( name, value ) {
  const MAXLEN = (name === 'content') ? DIRECTIVE_LIMITS.MAX_CONTENT_LENGTH : DIRECTIVE_LIMITS.MAX_STRING_LENGTH;
  const MINLEN = DIRECTIVE_LIMITS.MIN_STRING_LENGTH;

  if( value.length > MAXLEN || value.length < MINLEN ) {
    throw new ValidationError(`The ${name}'s value '${value}' should be longer than ${MINLEN} and less then ${MAXLEN}`);
  }

  if (name !== 'content') {
    if (DIRECTIVE_LIMITS.INVALID_PATTERN.test(value)) {
      throw new ValidationError(`The ${name}'s value '${value}' should avoid leading or trailing whitespace and characters such as these: ${DIRECTIVE_LIMITS.INVALID_CHARS.join('')}`);
    }
  }
};

const INVALID_NAME_PATTERN = /^\s|[^ a-zA-Z0-9\-\_\.]{1,}|\s$/;
const ALLOWED_NAME_SPECIALS = ['-', '_', '.'];
const validateName = function( name, value ) {
  if (INVALID_NAME_PATTERN.test(value)) {
    throw new ValidationError(`The ${name}'s value '${value}' should avoid leading or trailing whitespace and only contain alphabets, numbers, and these additional characters: ${ALLOWED_NAME_SPECIALS.join('')}`);
  }
  // Also validate string rules (length)
  validateString( name, value );
};

const parseTree = function( name, parent, totalAllowed ) {
  var hasNonLeafNodes = false;
  var childCount = 0;
  var keylen = 0;
  var valuelen = 0;
  if (totalAllowed <= 0) {
    throw new ValidationError(`The json object has more than ${DIRECTIVE_LIMITS.MAX_JSON_ITEMS} items.`);
  }
  for (var child in parent) {
    if (typeof parent[child] === 'object') {
      if (typeof child === 'string') {
        keylen = child.length;
        if (keylen > DIRECTIVE_LIMITS.MAX_JSON_KEY_LENGTH) {
          throw new ValidationError(`The json element ${child} exceeded the key length ${DIRECTIVE_LIMITS.MAX_JSON_KEY_LENGTH}.`);
        }
      }
      // Parse this sub-category:
      childCount += parseTree(name, parent[child], totalAllowed - childCount );
      if (childCount > DIRECTIVE_LIMITS.MAX_JSON_ITEMS) {
        throw new ValidationError(`The json object has more than ${DIRECTIVE_LIMITS.MAX_JSON_ITEMS} items.`);
      }
      // Set the hasNonLeafNodes flag (used below):
      hasNonLeafNodes = true;
    }else if(typeof parent[child] === 'string') {
      valuelen = parent[child].length;
      if (valuelen > DIRECTIVE_LIMITS.MAX_JSON_VALUE_LENGTH) {
        throw new ValidationError(`The json object element ${child} exceeded the value length ${DIRECTIVE_LIMITS.MAX_JSON_VALUE_LENGTH}`);
      }
      if (DIRECTIVE_LIMITS.INVALID_PATTERN.test(parent[child])) {
        throw new ValidationError(`The ${name} value ${parent[child]} should avoid leading or trailing whitespace and characters such as these: ${DIRECTIVE_LIMITS.INVALID_CHARS.join('')}`);
      }
    }
  }
  if (hasNonLeafNodes) {
    return childCount + 1; // including this parent node
  } else {
    // This is a leaf item, so return 1:
    return 1;
  }
};
const validateJson = function( name, value ) {
  if (value) {
    const hasProhibited = mongoSanitize.has(value);
    if (hasProhibited) {
      throw new ValidationError(`The json object ${name} contain illegal characters.`);
    }
    parseTree(name, value, DIRECTIVE_LIMITS.MAX_JSON_ITEMS);
  }
};

module.exports = { validateString, validateJson, validateName };
