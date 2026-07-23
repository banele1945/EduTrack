const { JobCleanupService } = require('../services/jobCleanupService');
const { db } = require('../config/database');
const winston = require('winston');

// Create a logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/job-cleanup.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

async function cleanupExpiredJobs() {
    const jobCleanupService = new JobCleanupService(db);
    let apiCalls = 0;

    try {
        // Get initial job count
        const initialCount = await db.query('SELECT COUNT(*) as count FROM jobs');
        logger.info(`Initial job count: ${initialCount[0].count}`);

        // Clean up expired jobs
        logger.info('Starting cleanup process...');
        const removedJobs = await jobCleanupService.cleanupExpiredJobs();
        apiCalls += jobCleanupService.apiCalls;
        logger.info(`Removed ${removedJobs.length} expired jobs`);

        // Get final job count
        const finalCount = await db.query('SELECT COUNT(*) as count FROM jobs');
        logger.info(`Final job count: ${finalCount[0].count}`);

        // Print summary
        logger.info('\n=== Job Cleanup Summary ===');
        logger.info(`Total jobs in database: ${finalCount[0].count}`);
        logger.info(`Jobs removed: ${removedJobs.length}`);
        logger.info(`API calls made: ${apiCalls}`);

        // Get job age distribution
        const ageDistribution = await db.query(`
            SELECT 
                CASE 
                    WHEN TIMESTAMPDIFF(DAY, created_at, NOW()) = 0 THEN 'Today'
                    WHEN TIMESTAMPDIFF(DAY, created_at, NOW()) = 1 THEN 'Yesterday'
                    WHEN TIMESTAMPDIFF(DAY, created_at, NOW()) <= 7 THEN 'This week'
                    WHEN TIMESTAMPDIFF(DAY, created_at, NOW()) <= 30 THEN 'This month'
                    ELSE 'Older'
                END as age,
                COUNT(*) as count
            FROM jobs
            GROUP BY age
            ORDER BY FIELD(age, 'Today', 'Yesterday', 'This week', 'This month', 'Older')
        `);

        logger.info('\nJob Age Distribution:');
        ageDistribution.forEach(row => {
            logger.info(`${row.age}: ${row.count} jobs`);
        });

        // Get category distribution
        const categoryDistribution = await db.query(`
            SELECT category, COUNT(*) as count
            FROM jobs
            GROUP BY category
            ORDER BY count DESC
        `);

        logger.info('\nCategory Distribution:');
        categoryDistribution.forEach(row => {
            logger.info(`${row.category}: ${row.count} jobs`);
        });

        // Get oldest and newest jobs
        const [oldestJob] = await db.query(`
            SELECT title, company_name, created_at
            FROM jobs
            ORDER BY created_at ASC
            LIMIT 1
        `);

        const [newestJob] = await db.query(`
            SELECT title, company_name, created_at
            FROM jobs
            ORDER BY created_at DESC
            LIMIT 1
        `);

        logger.info('\nOldest Job:');
        logger.info(`Title: ${oldestJob.title}`);
        logger.info(`Company: ${oldestJob.company_name}`);
        logger.info(`Created: ${oldestJob.created_at}`);

        logger.info('\nNewest Job:');
        logger.info(`Title: ${newestJob.title}`);
        logger.info(`Company: ${newestJob.company_name}`);
        logger.info(`Created: ${newestJob.created_at}`);

    } catch (error) {
        logger.error('Error in cleanup process:', error);
        throw error;
    } finally {
        // Close the database connection
        await db.end();
    }
}

// Run the script
cleanupExpiredJobs()
    .then(() => {
        logger.info('Cleanup process completed successfully');
        process.exit(0);
    })
    .catch(error => {
        logger.error('Cleanup process failed:', error);
        process.exit(1);
    }); 