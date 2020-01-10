import * as assert from 'assert';
import Axios from 'axios';
import { existsSync } from 'fs';
import MSIO from 'msio';
import * as path from 'path';
import koactDocToDefinition from '../src';
import { startKoaServer, stopKoaServer } from './server/koa-server';

before(async () => {
  await startKoaServer();
});

const axiosDest = path.resolve(__dirname, 'apis');
const msioDest = path.resolve(__dirname, 'msio');
const baseUrl = 'http://localhost:3000';

describe('For Axios', () => {
  it('Generate api definition file should success.', async () => {
    await koactDocToDefinition({
      url: baseUrl,
      destination: axiosDest,
      docSecret: '123456',
      target: 'axios',
      pattern: ['**', '!/ms/*'],
    });
    const exists = existsSync(path.resolve(axiosDest, 'APIRoot.ts'));
    assert(exists, 'api file should exists.');
  });
  it('Access server using api file should success', async () => {
    const { default: APIRoot } = await import(path.resolve(axiosDest, 'APIRoot.ts'));
    const apiRoot = new APIRoot(Axios.create({
      baseURL: baseUrl,
    }));
    const foo = 'Hello world.';
    const result = await apiRoot.getRoot({ foo });
    console.log(result);
    assert(!!result, 'Access server failed.');
  });
});
describe('For MSIO', () => {
  it('Generate api definition file should success.', async () => {
    await koactDocToDefinition({
      url: `${baseUrl}/ms`,
      destination: msioDest,
      docSecret: '123456',
      target: 'msio',
    });
    const exists = existsSync(path.resolve(msioDest, 'IORoot.ts'));
    assert(exists, 'api file should exists.');
  });
  it('Access server using api file should success.', async () => {
    const { default: IORoot } = await import(path.resolve(msioDest, 'IORoot.ts'));
    const msio = new MSIO({
      service: 1, secret: '111',
      destinationSecrets: {
        0: '654321',
      },
    });
    const ioRoot = new IORoot(msio, { service: 0, baseURL: `${baseUrl}/ms` });
    const result = await ioRoot.giveMeResultFetcher({ id: 'foo' }).fetch();
    console.log(result);
    assert(!!result, 'Access server failed.');
    msio.destroy();
  });
});

after(async () => {
  await stopKoaServer();
});
