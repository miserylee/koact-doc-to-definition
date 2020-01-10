import { IAPI } from 'koact';
import { $ } from 'schema.io';

export default {
  body: {
    key: Boolean,
  },
  res: $(String).optional(),
} as IAPI;
