import { Server } from 'http';
import Application = require('koa');
import koact from 'koact';
import * as path from 'path';

const app = new Application();

app.use(koact(path.resolve(__dirname, 'routes')));

let server: Server;

export async function startKoaServer() {
  if (server) {
    return;
  }
  return new Promise(resolve => {
    server = app.listen(3000, () => {
      console.log('Koa server started using koact.');
      resolve();
    });
  });
}

export async function stopKoaServer() {
  return new Promise(resolve => {
    server.close(() => {
      console.log('Koa server stopped.');
      resolve();
    });
  });
}
