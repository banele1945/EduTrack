require('dotenv').config();
const courseUpdateService = require('../services/courseUpdateService');

async function updateCourses() {
    try {
        console.log('Starting course update script...');
        await courseUpdateService.updateCourses();
        console.log('Course update completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error in course update script:', error);
        process.exit(1);
    }
}

updateCourses(); 