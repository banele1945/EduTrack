require('dotenv').config();
const courseUpdateService = require('../services/courseUpdateService');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Set up logging
const logFile = path.join(logsDir, `course-update-${new Date().toISOString().split('T')[0]}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    logStream.write(logMessage);
}

async function fetchCourses() {
    try {
        log('Starting manual course fetch...');
        const result = await courseUpdateService.checkAndUpdateCourses();
        log(`Course fetch completed successfully. Updated ${result} courses.`);
        process.exit(0);
    } catch (error) {
        log(`Error fetching courses: ${error.message}`);
        if (error.stack) {
            log(`Stack trace: ${error.stack}`);
        }
        process.exit(1);
    } finally {
        logStream.end();
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    log(`Uncaught Exception: ${error.message}`);
    if (error.stack) {
        log(`Stack trace: ${error.stack}`);
    }
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    log(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
    process.exit(1);
});

fetchCourses(); 