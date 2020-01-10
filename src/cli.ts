#!/usr/bin/env node
import * as program from 'commander';
import { existsSync } from 'fs';
import * as path from 'path';
import koactDocToDefinition, { IOptions } from './index';

program.version(require(path.resolve(__dirname, '../package.json')).version)
  .option('-c, --config [configFilePath]', 'Set config file path.', 'koact-api-generator.config.json')
  .parse(process.argv);

const configFilePath = path.resolve(process.cwd(), program.config);
if (!existsSync(configFilePath)) {
  throw new Error('No configuration found.');
}

const options = require(configFilePath) as IOptions;

if (!options.destination) {
  throw new Error('`destination` should set in config file.');
}
if (!options.url) {
  throw new Error('`url` should set in config file.');
}

koactDocToDefinition(options).then(() => {
  console.log('Generate api files done!');
}).catch(e => {
  throw e;
});
