// This file is auto-managed by drizzle-kit. Do not edit manually.
// Run `npm run db:generate` to regenerate after schema changes.
import migration0000 from './0000_initial.sql';
import migration0001 from './0001_add_due_date.sql';
import migration0002 from './0002_signal_engine.sql';
import migration0003 from './0003_notification_key.sql';

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
      {
        idx: 2,
        version: '7',
        when: 1748476800000,
        tag: '0002_signal_engine',
        breakpoints: false,
      },
      {
        idx: 3,
        version: '7',
        when: 1748736000000,
        tag: '0003_notification_key',
        breakpoints: false,
      },
    ],
  },
  migrations: {
    '0000_initial': migration0000,
    '0001_add_due_date': migration0001,
    '0002_signal_engine': migration0002,
    '0003_notification_key': migration0003,
  },
};
