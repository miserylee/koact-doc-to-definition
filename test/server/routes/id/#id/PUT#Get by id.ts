import { IAPI } from 'koact';
import { $ } from 'schema.io';

export default {
  params: {
    id: $(String).required().explain('id'),
    id2: $(String).required().explain('id2'),
  },
  body: {
    username: $(String).required().explain('username'),
  },
} as IAPI<{
  id: string;
}>;
