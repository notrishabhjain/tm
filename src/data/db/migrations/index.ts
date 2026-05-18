// This file is auto-managed by drizzle-kit. Do not edit manually.
// Run `npm run db:generate` to regenerate after schema changes.
import migration0000 from './0000_initial.sql';

export default {
  journal: {
    version: '7',
    dialect: 'sqlite',
    entries: [
      {
        idx: 0,
        version: '7',
        when: 1747526400000,
        tag: '0000_initial',
        breakpoints: false,
      },
    ],
  },
  migrations: {
    '0000_initial': migration0000,
  },
};
