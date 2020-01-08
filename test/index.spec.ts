import * as assert from 'assert';
import Axios from 'axios';
import { existsSync } from 'fs';
import * as path from 'path';
import koactDocToDefinition from '../src';
import { startKoaServer, stopKoaServer } from './server/koa-server';

before(async () => {
  await startKoaServer();
});

const destination = path.resolve(__dirname, 'apis');
const baseUrl = 'http://localhost:3000';

describe('Main', () => {
  it('Generate api definition file should success.', async () => {
    await koactDocToDefinition({
      url: baseUrl,
      destination,
    });
    const exists = existsSync(path.resolve(destination, 'APIRoot.ts'));
    assert(exists, 'api file should exists.');
  });
  it('Access server using api file should success', async () => {
    const { default: APIRoot } = await import(path.resolve(destination, 'APIRoot.ts'));
    const apiRoot = new APIRoot(Axios.create({
      baseURL: baseUrl,
    }));
    const foo = 'Hello world.';
    const result = await apiRoot.getRoot({ foo });
    console.log(result);
    assert(!!result, 'Access server failed.');
  });
});

after(async () => {
  await stopKoaServer();
});
