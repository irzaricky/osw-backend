import { initCalendarCron } from './calendar.cron.js';

export const initCronJobs = () => {
    initCalendarCron();
    console.log('[CRON] All Background Jobs Initialized.');
};
