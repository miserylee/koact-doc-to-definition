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

let optionsArray = require(configFilePath) as IOptions | IOptions[];

if (!Array.isArray(optionsArray)) {
  optionsArray = [optionsArray];
}

(async () => {
  for (const [index, options] of optionsArray.entries()) {
    if (!options.destination) {
      throw new Error(`[Config_${index}] 'destination' should set in config file.`);
    }
    if (!options.url) {
      throw new Error(`[Config_${index}] 'url' should set in config file.`);
    }
    console.log(`[Config_${index}] Start generating api file from ${options.url}, destination is ${options.destination}`);
    await koactDocToDefinition(options);
    console.log(`[Config_${index}] Generate api files done!`);
    console.log();
  }
})().catch(e => {
  throw e;
});
