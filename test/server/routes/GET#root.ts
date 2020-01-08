import { IAPI } from 'koact';
import { $ } from 'schema.io';

export default {
  query: {
    foo: $(String).required().explain('Foo'),
  },
  res: $({
    bar: $(String).required().explain('bar'),
  }).required().explain('Bar'),
  async handler({ query }) {
    return {
      bar: `Foo:${query.foo}`,
    };
  },
} as IAPI<{}, {
  foo: string;
}, {}, {
  bar: string;
}>;
