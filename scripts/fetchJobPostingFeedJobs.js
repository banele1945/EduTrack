require('dotenv').config();
const JobPostingFeedService = require('../services/jobPostingFeedService');
const db = require('../config/database');
const winston = require('winston');

// Create a logger for this script
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/job-feed-fetch.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

async function fetchAndStoreJobPostingFeedJobs() {
    const jobPostingFeedService = new JobPostingFeedService(db);
    let apiCallsMade = 0;

    try {
        logger.info('Starting job fetch from Job Posting Feed API...');

        const storedCount = await jobPostingFeedService.fetchAndStoreJobs();
        apiCallsMade += jobPostingFeedService.apiCalls;

        logger.info(`Successfully fetched and stored ${storedCount} jobs from Job Posting Feed API.`);
        logger.info(`Total API calls for this run: ${apiCallsMade}`);

    } catch (error) {
        logger.error('Error in fetchJobPostingFeedJobs process:', error);
    } finally {
        // Ensure database connection is closed
        await db.end();
        logger.info('Database connection closed.');
    }
}

// Run the script
fetchAndStoreJobPostingFeedJobs()
    .then(() => {
        logger.info('Job Posting Feed API fetch process completed.');
        process.exit(0);
    })
    .catch(error => {
        logger.error('Job Posting Feed API fetch process failed:', error);
        process.exit(1);
    }); 