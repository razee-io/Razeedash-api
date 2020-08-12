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

const { ValidationError } = require('apollo-server');
const { SchemaDirectiveVisitor } = require('apollo-server-express');
const { assert } = require('chai');
const { DIRECTIVE_LIMITS } = require('../models/const');

class Sanitizer {
  constructor(name, arg) {
    this.name = name;
    this.arg = arg;
  }

  sanitize() {
  }
}

// in schema add following: might require granphql-tools 4.0.3+
// directive @identifier(min: Int, max: Int) on ARGUMENT_DEFINITION
// addGroup(orgId: String! name: String! @identifier(min: 3, max: 32)): AddGroupReply!
class IdentifierSanitizer extends Sanitizer {

  constructor(arg, minLength, maxLength) {
    super(`Identifer_${minLength}_${maxLength}`, arg);
    this.minLength = minLength;
    this.maxLength = maxLength;
  }

  sanitize( args) {
    const value = args[this.arg];
    if (value) {
      if (value instanceof Array) {
        if (((this.arg === 'clusters' || this.arg === 'clusterIds') && value.length > DIRECTIVE_LIMITS.MAX_CLUSTER_ARRAY_LEN) || ((this.arg === 'groupUuids' || this.arg === 'groups') && value.length > DIRECTIVE_LIMITS.MAX_GROUP_ARRAY_LEN)) {
          throw new ValidationError(`The array ${this.arg}'s length '${value.length}' exceeded the allowed limit`);
        }
        value.forEach(element => {
          this.validateSting(element);
        });
      } else {
        this.validateSting(value);
      }
    }

  }

  validateSting(value) {
    var MAXLEN = DIRECTIVE_LIMITS.MAX_STRING_LENGTH;
    var MINLEN = DIRECTIVE_LIMITS.MIN_STRING_LENGTH;
    const pattern = /[<>$%&!#]{1,}/;
    if (this.arg === 'content')  MAXLEN = 10000;
    if (this.maxLength !== undefined) MAXLEN = this.maxLength;
    if (this.minLength !== undefined) MINLEN = this.minLength;
    try {
      assert.isAtMost(value.length, MAXLEN);
      assert.isAtLeast(value.length, MINLEN);
    } catch (e) {
      throw new ValidationError(`The ${this.arg}'s value '${value}' should be longer than ${MINLEN} and less then ${MAXLEN}`);
    }
    if (this.arg !== 'content' && this.arg !== 'description') {
      if (pattern.test(value)) {
        throw new ValidationError(`The ${this.arg}'s value '${value}' should only contain alphabets, numbers, underscore and hyphen`);
      }
    }
  }
}

class IdentifierDirective extends SchemaDirectiveVisitor {
  visitArgumentDefinition(param, details) {
    const sanitizer = new IdentifierSanitizer(param.name, this.args.min, this.args.max);
    const field = details.field;
    if (!field.sanitizers) {
      field.sanitizers = [];
      const { resolve } = field;
      field.resolve = async function (
        source,
        args,
        context,
        info,
      ) {
        for(const s of field.sanitizers) {
          s.sanitize(args);
        }
        return resolve.call(this, source, args, context, info);
      };
    }
    field.sanitizers.push(sanitizer);
  }
}


class JsonSanitizer extends Sanitizer {

  constructor(arg) {
    super('Json_', arg);
  }

  parseTree(parent) {
    var hasNonLeafNodes = false;
    var childCount = 0; 
    var keylen = 0; 
    var valuelen = 0;
    for (var child in parent) {
      if (typeof parent[child] === 'object') {
        if (typeof child === 'string') {
          keylen = child.length;
        }
        // Parse this sub-category:
        childCount += this.parseTree(parent[child]);
        try {
          assert.isAtMost(keylen, DIRECTIVE_LIMITS.MAX_JSON_KEY_LENGTH);
          assert.isAtMost(childCount, DIRECTIVE_LIMITS.MAX_JSON_ITEMS);
        } catch (e) {
          throw new ValidationError(`The json object ${this.arg} has more than ${DIRECTIVE_LIMITS.MAX_JSON_ITEMS} items or exceeded the key length`);
        }
        // Set the hasNonLeafNodes flag (used below):
        hasNonLeafNodes = true;
      }else if(typeof parent[child] === 'string') {
        valuelen = parent[child].length;
        try {
          assert.isAtMost(valuelen, DIRECTIVE_LIMITS.MAX_JSON_VALUE_LENGTH);
        } catch (e) {
          throw new ValidationError(`The json object ${this.arg} has more than ${DIRECTIVE_LIMITS.MAX_JSON_ITEMS} items or exceeded the key length`);
        }
      }
    }
    if (hasNonLeafNodes) {
      return childCount;
    } else {
      // This is a leaf item, so return 1:
      return 1;
    }
  }


  sanitize( args) {
    const value = args[this.arg];
    if (value) {
      this.parseTree(value);
    }
  }
}

class JsonDirective extends SchemaDirectiveVisitor {
  visitArgumentDefinition(param, details) {
    const sanitizer = new JsonSanitizer(param.name);
    const field = details.field;
    if (!field.sanitizers) {
      field.sanitizers = [];
      const { resolve } = field;
      field.resolve = async function (
        source,
        args,
        context,
        info,
      ) {
        for(const s of field.sanitizers) {
          s.sanitize(args);
        }
        return resolve.call(this, source, args, context, info);
      };
    }
    field.sanitizers.push(sanitizer);
  }
}

module.exports = { IdentifierDirective, JsonDirective };