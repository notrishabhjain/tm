// This file is auto-managed by drizzle-kit. Do not edit manually.
// Run `npm run db:generate` to regenerate after schema changes.
import migration0000 from './0000_initial.sql';
import migration0001 from './0001_add_due_date.sql';

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
      {
        idx: 1,
        version: '7',
        when: 1748217600000,
        tag: '0001_add_due_date',
        breakpoints: false,
      },
    ],
  },
  migrations: {
    '0000_initial': migration0000,
    '0001_add_due_date': migration0001,
  },
};
