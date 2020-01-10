import { IMeta } from 'koact';
import { MSInput } from 'msio';

export default {
  title: 'msio api',
  pre: [new MSInput({
    service: 0,
    secret: '654321',
  }).middleware()],
} as IMeta;
