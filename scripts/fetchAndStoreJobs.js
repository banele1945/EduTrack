const { JobUpdateService } = require('../services/jobUpdateService');
const pool = require('../config/database');
const winston = require('winston');

// Create a logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/job-fetch.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

async function fetchAndStoreJobs() {
    const jobUpdateService = new JobUpdateService();
    let connection;
    let apiCalls = 0;

    try {
        // Get a connection from the pool
        connection = await pool.getConnection();

        // Get initial job count
        const [initialCount] = await connection.query('SELECT COUNT(*) as count FROM jobs');
        logger.info(`Initial job count: ${initialCount[0].count}`);

        // Fetch and store new jobs
        logger.info('Starting job fetch process...');
        const newJobs = await jobUpdateService.fetchAndStoreJobs();
        logger.info(`Added ${newJobs} new jobs`);

        // Get final job count
        const [finalCount] = await connection.query('SELECT COUNT(*) as count FROM jobs');
        logger.info(`Final job count: ${finalCount[0].count}`);

        // Print summary
        logger.info('\n=== Job Fetch Summary ===');
        logger.info(`Total jobs in database: ${finalCount[0].count}`);
        logger.info(`New jobs added: ${newJobs}`);

        // Get job age distribution
        const [ageDistribution] = await connection.query(`
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

        // Get oldest and newest jobs
        const [oldestJobs] = await connection.query(`
            SELECT title, company_name, created_at
            FROM jobs
            ORDER BY created_at ASC
            LIMIT 1
        `);

        const [newestJobs] = await connection.query(`
            SELECT title, company_name, created_at
            FROM jobs
            ORDER BY created_at DESC
            LIMIT 1
        `);

        const oldestJob = oldestJobs[0];
        const newestJob = newestJobs[0];

        logger.info('\nOldest Job:');
        logger.info(`Title: ${oldestJob.title}`);
        logger.info(`Company: ${oldestJob.company_name}`);
        logger.info(`Created: ${oldestJob.created_at}`);

        logger.info('\nNewest Job:');
        logger.info(`Title: ${newestJob.title}`);
        logger.info(`Company: ${newestJob.company_name}`);
        logger.info(`Created: ${newestJob.created_at}`);

    } catch (error) {
        logger.error('Error in job fetch process:', error);
        throw error;
    } finally {
        // Release the connection back to the pool
        if (connection) {
            connection.release();
        }
    }
}

// Run the script
fetchAndStoreJobs()
    .then(() => {
        logger.info('Job fetch process completed successfully');
        process.exit(0);
    })
    .catch(error => {
        logger.error('Job fetch process failed:', error);
        process.exit(1);
    }); 