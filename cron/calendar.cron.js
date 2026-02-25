import cron from 'node-cron';
import calendarModule from '../module/master-data/calendar.js';

export const initCalendarCron = () => {
    // Run at 01:00 on the 1st of every month
    cron.schedule('0 1 1 * *', async () => {
        try {
            console.log('[CRON] Starting Auto-Generate Calendar for +/- 5 years rolling window...');
            
            const currentYear = new Date().getFullYear();
            const startYear = currentYear - 5;
            const endYear = currentYear + 5;
            
            for (let y = startYear; y <= endYear; y++) {
                // Mock an express request object to feed into the module
                const mockReq = { 
                    params: { year: String(y) },
                    ip: '127.0.0.1',
                    headers: { 'user-agent': 'SYSTEM_CRON' }
                };
                
                // Call the existing generate logic
                const result = await calendarModule.generateYear(mockReq);
                if (result.status) {
                    console.log(`[CRON] Calendar generated for ${y}:`, result.data.total_generated, 'events');
                } else {
                    console.error(`[CRON] Failed to generate for ${y}:`, result.message || result.error);
                }
            }
            console.log('[CRON] Finished Auto-Generate Calendar.');
        } catch (error) {
            console.error('[CRON] Error in Calendar Generation:', error);
        }
    });
};
