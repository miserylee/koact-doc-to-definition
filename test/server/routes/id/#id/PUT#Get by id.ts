import { IAPI } from 'koact';
import { $ } from 'schema.io';

export default {
  params: {
    id: $(String).required().explain('id'),
    id2: $(String).required().explain('id2'),
  },
} as IAPI<{
  id: string;
}>;
