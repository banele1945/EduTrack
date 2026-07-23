require('dotenv').config();
const axios = require('axios');
const db = require('../config/database');
const fs = require('fs');
const path = require('path');

const API_KEY = 'a072644c84msh1fa724218b81c7fp1ce347jsna0a8d88c64aa';
const API_HOST = 'advance-course-finder.p.rapidapi.com';
const API_URL = 'https://advance-course-finder.p.rapidapi.com/course';
const MAX_REQUESTS_PER_RUN = 10; // 10 requests per day to stay within 300/month
const MAX_LIMIT = 50; // Assume 50 is the max allowed per request (adjust if API docs specify otherwise)
const LOGS_DIR = path.join(__dirname, '../logs');
const LOG_FILE = path.join(LOGS_DIR, `udemy-advanced-fetch-${new Date().toISOString().split('T')[0]}.log`);

if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR);
}
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    logStream.write(logMessage);
}

async function courseExists(courseId) {
    const [rows] = await db.query('SELECT id FROM courses WHERE id = ?', [courseId]);
    return rows.length > 0;
}

async function storeCourse(course) {
    try {
        if (await courseExists(course.id)) {
            log(`Course ${course.id} already exists, skipping.`);
            return false;
        }
        await db.query(
            `INSERT INTO courses (
                id, title, desc_text, pic, coupon, org_price, category, language, platform, rating, duration, expiry, savedtime, last_updated
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                course.id,
                course.title,
                course.desc_text,
                course.pic,
                course.coupon,
                course.org_price,
                course.category,
                course.language,
                course.platform,
                course.rating,
                course.duration,
                course.expiry,
                course.savedtime
            ]
        );
        log(`Stored new course: ${course.title} (${course.id})`);
        return true;
    } catch (error) {
        log(`Error storing course ${course.id}: ${error.message}`);
        return false;
    }
}

function mapApiCourseToDb(apiCourse) {
    return {
        id: apiCourse.course_id,
        title: apiCourse.course_name || 'Untitled',
        desc_text: `University: ${apiCourse.university_name || 'N/A'} | Country: ${apiCourse.country_name || 'N/A'} | GMAT: ${apiCourse.gmat || 'N/A'} | GRE: ${apiCourse.gre || 'N/A'} | TOEFL: ${apiCourse.toefl || 'N/A'} | IELTS: ${apiCourse.ielts || 'N/A'} | PTE: ${apiCourse.pte || 'N/A'} | Duolingo: ${apiCourse.duolingo || 'N/A'} | STEM: ${apiCourse.stem || 'N/A'} | Fall: ${apiCourse.fall || 'N/A'} | Spring: ${apiCourse.spring || 'N/A'} | Summer: ${apiCourse.summer || 'N/A'} | Views: ${apiCourse.course_views || 'N/A'}`,
        pic: '/public/images/course-placeholder.webp',
        coupon: apiCourse.course_url || apiCourse.app_url || '',
        org_price: 'N/A',
        category: apiCourse.catagory || apiCourse.category || 'Not specified',
        language: 'N/A',
        platform: 'Udemy Advanced',
        rating: 0,
        duration: 'N/A',
        expiry: null,
        savedtime: null
    };
}

async function fetchCoursesFromApi(params = {}) {
    try {
        const response = await axios.get(API_URL, {
            params: { ...params, limit: MAX_LIMIT },
            headers: {
                'x-rapidapi-key': API_KEY,
                'x-rapidapi-host': API_HOST
            }
        });
        if (response.data && Array.isArray(response.data)) {
            return response.data;
        }
        log('API returned unexpected response format.');
        return [];
    } catch (error) {
        log(`API error: ${error.message}`);
        return [];
    }
}

async function main() {
    log('Starting Udemy Advanced Course Finder fetch...');
    let requestsMade = 0;
    let totalStored = 0;
    // 1. Free South African courses
    if (requestsMade < MAX_REQUESTS_PER_RUN) {
        log('Fetching free South African courses...');
        const courses = await fetchCoursesFromApi({ country: 'South Africa', free: true });
        for (const apiCourse of courses) {
            if (requestsMade >= MAX_REQUESTS_PER_RUN) break;
            const course = mapApiCourseToDb(apiCourse);
            if (await storeCourse(course)) totalStored++;
        }
        requestsMade++;
    }
    // 2. Any free courses
    if (requestsMade < MAX_REQUESTS_PER_RUN) {
        log('Fetching any free courses...');
        const courses = await fetchCoursesFromApi({ free: true });
        for (const apiCourse of courses) {
            if (requestsMade >= MAX_REQUESTS_PER_RUN) break;
            const course = mapApiCourseToDb(apiCourse);
            if (await storeCourse(course)) totalStored++;
        }
        requestsMade++;
    }
    // 3. Any courses
    while (requestsMade < MAX_REQUESTS_PER_RUN) {
        log('Fetching any courses...');
        const courses = await fetchCoursesFromApi();
        for (const apiCourse of courses) {
            if (requestsMade >= MAX_REQUESTS_PER_RUN) break;
            const course = mapApiCourseToDb(apiCourse);
            if (await storeCourse(course)) totalStored++;
        }
        requestsMade++;
    }
    log(`Fetch complete. Total new courses stored: ${totalStored}`);
    logStream.end();
    process.exit(0);
}

main().catch(error => {
    log(`Fatal error: ${error.message}`);
    logStream.end();
    process.exit(1);
}); 