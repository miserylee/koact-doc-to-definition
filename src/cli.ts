#!/usr/bin/env node
import * as program from 'commander';
import { existsSync } from 'fs';
import * as path from 'path';
import koactDocToDefinition from './index';

program.version(require(path.resolve(__dirname, '../package.json')).version)
  .option('-c, --config [configFilePath]', 'Set config file path.', 'koact-api-generator.config.json')
  .parse(process.argv);

const configFilePath = path.resolve(process.cwd(), program.config);
if (!existsSync(configFilePath)) {
  throw new Error('No configuration found.');
}

const { destination, url } = require(configFilePath) as { destination: string; url: string };

if (!destination) {
  throw new Error('`destination` should set in config file.');
}
if (!url) {
  throw new Error('`url` should set in config file.');
}

koactDocToDefinition({ destination, url }).then(() => {
  console.log('Generate api files done!');
}).catch(e => {
  throw e;
});
