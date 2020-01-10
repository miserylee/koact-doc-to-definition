import { IAPI } from 'koact';

export default {
  query: {
    id: String,
  },
  res: {
    username: String,
  },
  async handler({ query }) {
    return {
      username: `id:${query.id}`,
    };
  },
} as IAPI;
