import { IAPI } from 'koact';
import { $ } from 'schema.io';

export default {
  body: {
    key: $(String),
  },
  async handler() {
    return 'OK';
  },
} as IAPI;
