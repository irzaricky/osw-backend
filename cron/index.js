import { initCalendarCron } from './calendar.cron.js';
import { initLineCapacityCron } from './line-capacity.cron.js';

export const initCronJobs = () => {
    initCalendarCron();
    initLineCapacityCron();
    console.log('[CRON] All Background Jobs Initialized.');
};
