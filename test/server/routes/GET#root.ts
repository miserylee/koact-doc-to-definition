import { IAPI } from 'koact';
import { $ } from 'schema.io';

export default {
  query: {
    foo: $(String).required().explain('Foo'),
  },
  res: $(String).required().explain('Bar'),
  async handler({ query }) {
    return `Foo:${query.foo}`;
  },
} as IAPI<{}, {
  foo: string;
}, {}, string>;
