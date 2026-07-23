require('dotenv').config();
const LinkedInJobService = require('../services/linkedinJobService');
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
        new winston.transports.File({ filename: 'logs/linkedin-fetch.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

async function fetchLinkedInJobs() {
    const linkedInJobService = new LinkedInJobService();
    let apiCallsMade = 0;

    try {
        logger.info('Starting job fetch from LinkedIn Job Search API...');

        const storedCount = await linkedInJobService.fetchAndStoreJobs();
        apiCallsMade += linkedInJobService.apiCalls;

        logger.info(`Successfully fetched and stored ${storedCount} jobs from LinkedIn Job Search API.`);
        logger.info(`Total API calls for this run: ${apiCallsMade}`);

    } catch (error) {
        logger.error('Error in fetchLinkedInJobs process:', error);
    } finally {
        // Ensure database connection is closed
        await db.end();
        logger.info('Database connection closed.');
    }
}

// Run the script
fetchLinkedInJobs()
    .then(() => {
        logger.info('LinkedIn Job Search API fetch process completed.');
        process.exit(0);
    })
    .catch(error => {
        logger.error('LinkedIn Job Search API fetch process failed:', error);
        process.exit(1);
    }); 