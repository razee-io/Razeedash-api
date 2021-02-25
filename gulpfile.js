#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * IBM Confidential
 * Licensed Materials - Property of IBM
 * IBM Cloud Container Service, 5737-D43
 * (C) Copyright IBM Corp. 2020 All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */

const args = require('args');
const fs = require('fs-extra');
const Parser = require('i18next-parser').gulp;
const jsonEditor = require('gulp-json-editor');
const gulp = require('gulp');
const gulpif = require('gulp-if');
const del = require('del');
const path = require('path');

args
  .option(
    'files',
    'Glob patterns for files containing translation strings, separated by commas',
    './**/*.*'
  )
  .option('namespace', 'The i18n namespace', 'armada')
  .option('dry', 'Perform a dry run for testing')
  .option('output', 'Path to output location', './locales');

const flags = args.parse(process.argv);
const files = flags.files.split(',');
const locales = [
  'de',
  'en',
  'es',
  'fr',
  'it',
  'ja',
  'ko',
  'pt-br',
  'zh-cn',
  'zh-tw',
];

const parserConfig = {
  locales,
  createOldCatalogs: false,
  keepRemoved: false,
  defaultNamespace: flags.namespace,
  // Output relative to where gulp.dest is putting the tmp folder
  output: './$LOCALE/$NAMESPACE-resources.json',
  // We don't use namespace or key separators since the key is the fallback
  namespaceSeparator: false,
  keySeparator: false,
};

console.log('Parsing files...');
gulp
  .src(files)
  // Run each file through the i18n parser to extract the strings
  .pipe(new Parser(parserConfig))
  // Sort and validate the strings
  .pipe(
    jsonEditor(jsonObject => {
      const sortedBundle = {};
      const invalidKeys = [];
      Object.keys(jsonObject)
        .sort((a, b) => a.localeCompare(b))
        .forEach(key => {
          // Verify string substitution
          if (/\${.*}/.test(key)) invalidKeys.push(key);
          // We don't want the plurals since the key is the fallback
          if (!/_plural$/.test(key)) sortedBundle[key] = jsonObject[key];
        });
      if (invalidKeys.length > 0) {
        const formattedInvalidKeys = invalidKeys
          .map(k => `- "${k}"`)
          .join('\n\t');
        throw new Error(
          `Invalid string substitution found for namespace: ${flags.namespace}\n\t${formattedInvalidKeys}`
        );
      }
      return sortedBundle;
    })
  )
  // Write the updated string bundle back to the tmp folder
  .pipe(gulpif(!flags.dry, gulp.dest(path.join(flags.output, 'tmp'))))
  .on('finish', () => {
    if (flags.dry) console.log('Looks good!');
  })
  .on('end', () => {
    // This event will only get triggered after gulp.dest is complete, so this path
    // is not taken if --dry is specified.
    console.log('Writing locale bundles...');
    locales.forEach(locale => {
      const tmpBundlePath = path.join(
        flags.output,
        'tmp',
        locale,
        `${flags.namespace}-resources.json`
      );
      const bundlePath = path.join(
        flags.output,
        locale,
        `${flags.namespace}-resources.json`
      );
      const newBundle = fs.readJsonSync(tmpBundlePath);
      if (fs.existsSync(bundlePath)) {
        const oldBundle = fs.readJsonSync(bundlePath);
        Object.keys(newBundle).forEach(key => {
          if (oldBundle[key]) newBundle[key] = oldBundle[key];
          else if (!newBundle[key]) newBundle[key] = key;
        });
        fs.writeJsonSync(bundlePath, newBundle, { spaces: 2 });
      } else {
        fs.createFileSync(bundlePath);
        fs.writeJsonSync(bundlePath, newBundle, { spaces: 2 });
      }
      console.log(`Bundle created: ${bundlePath}`);
    });
    del(path.join(flags.output, 'tmp'));
    console.log('Done!');
  });