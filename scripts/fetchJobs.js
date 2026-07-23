require('dotenv').config();
const { JobUpdateService } = require('../services/jobUpdateService');
const jobUpdateService = new JobUpdateService();
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Set up logging
const logFile = path.join(logsDir, `job-update-${new Date().toISOString().split('T')[0]}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    logStream.write(logMessage);
}

async function fetchAndStoreJobs() {
    try {
        log('Starting job fetch process...');
        const totalJobs = await jobUpdateService.fetchAndStoreJobs();
        log(`Successfully fetched and stored ${totalJobs} jobs.`);
        process.exit(0);
    } catch (error) {
        log(`Error in fetchAndStoreJobs: ${error.message}`);
        if (error.stack) {
            log(`Stack trace: ${error.stack}`);
        }
        process.exit(1);
    } finally {
        logStream.end();
    }
}

fetchAndStoreJobs(); 