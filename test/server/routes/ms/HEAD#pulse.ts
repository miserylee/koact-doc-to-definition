import { IAPI } from 'koact';

export default {
  async handler() {
    console.log('Got pulse.');
    return 'OK';
  },
} as IAPI;
