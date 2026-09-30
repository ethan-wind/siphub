import { CronJob } from 'cron';
import { AppEnv } from './env.mjs';
import { logger } from './logger.mjs';
import { tableSplit, deleteTable } from './db.mjs';

export function startCron() {
    const job = new CronJob(
        AppEnv.cronTime,
        async function () {
            logger.info('cron start')
            try {
                await tableSplit()
            } catch (error) {
                logger.error('cron tableSplit failed', error)
            }
            try {
                await deleteTable()
            } catch (error) {
                logger.error('cron deleteTable failed', error)
            }
            logger.info('cron tick complete')
        },
        function () {
            logger.info('cron complete')
        },
        true,
        AppEnv.timeZone
    );
}
