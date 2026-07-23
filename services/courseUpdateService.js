const axios = require('axios');
const pool = require('../config/database');

class CourseUpdateService {
    constructor() {
        this.baseUrl = 'https://paid-udemy-course-for-free.p.rapidapi.com';
        this.headers = {
            'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
            'X-RapidAPI-Host': 'paid-udemy-course-for-free.p.rapidapi.com'
        };
        this.maxCourses = 100; // Maximum number of courses to fetch
        this.categories = [
            'Development',
            'Business',
            'IT & Software',
            'Design',
            'Marketing',
            'Music',
            'Photography',
            'Health & Fitness',
            'Teaching & Academics',
            'Personal Development'
        ];
        this.pool = pool;
    }

    async getLastUpdatedCategory() {
        let connection;
        try {
            connection = await this.pool.getConnection();
            const [result] = await connection.query(
                'SELECT value FROM settings WHERE setting_key = "last_updated_category"'
            );
            return result[0]?.value || this.categories[0];
        } catch (error) {
            console.error('Error getting last updated category:', error);
            return this.categories[0];
        } finally {
            if (connection) connection.release();
        }
    }

    async setLastUpdatedCategory(category) {
        let connection;
        try {
            connection = await this.pool.getConnection();
            await connection.query(
                'INSERT INTO settings (setting_key, value) VALUES ("last_updated_category", ?) ON DUPLICATE KEY UPDATE value = ?',
                [category, category]
            );
        } catch (error) {
            console.error('Error setting last updated category:', error);
        } finally {
            if (connection) connection.release();
        }
    }

    async getNextCategory() {
        const lastCategory = await this.getLastUpdatedCategory();
        const currentIndex = this.categories.indexOf(lastCategory);
        const nextIndex = (currentIndex + 1) % this.categories.length;
        return this.categories[nextIndex];
    }

    // Helper method to format date for MySQL
    formatDateForMySQL(dateString) {
        if (!dateString) return null;
        // Convert ISO date to YYYY-MM-DD format
        return new Date(dateString).toISOString().split('T')[0];
    }

    async checkAndUpdateCourses() {
        let connection;
        try {
            connection = await this.pool.getConnection();
            // Check current number of courses in database
            const [countResult] = await connection.query('SELECT COUNT(*) as count FROM courses');
            const currentCount = countResult[0].count;

            if (currentCount >= this.maxCourses) {
                console.log(`Database already has ${currentCount} courses. No need to fetch more.`);
                return;
            }

            console.log(`Current course count: ${currentCount}. Fetching more courses...`);
            await this.updateCourses();
        } catch (error) {
            console.error('Error checking course updates:', error);
            throw error;
        } finally {
            if (connection) connection.release();
        }
    }

    async updateCourses() {
        let connection;
        try {
            connection = await this.pool.getConnection();
            console.log('Starting course update...');
            const category = await this.getNextCategory();
            console.log(`Fetching courses for category: ${category}`);
            
            let page = 0;
            let hasMore = true;
            let totalCourses = 0;
            let existingCourseIds = new Set();

            // Get existing course IDs to prevent duplicates
            const [existingCourses] = await connection.query('SELECT id FROM courses');
            existingCourses.forEach(course => existingCourseIds.add(course.id));

            // Priority 1: Free South African courses
            console.log('Priority 1: Fetching free South African courses...');
            const freeZaCourses = await this.fetchCoursesWithPriority(category, page, 'free_za');
            for (const course of freeZaCourses) {
                if (!existingCourseIds.has(course.id)) {
                    await this.storeCourse(course, connection);
                    existingCourseIds.add(course.id);
                    totalCourses++;
                    console.log(`Stored free South African course: ${course.title} (${totalCourses}/${this.maxCourses})`);
                }
            }

            // Priority 2: Other free courses
            if (totalCourses < this.maxCourses) {
                console.log('Priority 2: Fetching other free courses...');
                const freeCourses = await this.fetchCoursesWithPriority(category, page, 'free');
                for (const course of freeCourses) {
                    if (!existingCourseIds.has(course.id)) {
                        await this.storeCourse(course, connection);
                        existingCourseIds.add(course.id);
                        totalCourses++;
                        console.log(`Stored free course: ${course.title} (${totalCourses}/${this.maxCourses})`);
                    }
                }
            }

            // Priority 3: Paid South African courses
            if (totalCourses < this.maxCourses) {
                console.log('Priority 3: Fetching paid South African courses...');
                const zaCourses = await this.fetchCoursesWithPriority(category, page, 'za');
                for (const course of zaCourses) {
                    if (!existingCourseIds.has(course.id)) {
                        await this.storeCourse(course, connection);
                        existingCourseIds.add(course.id);
                        totalCourses++;
                        console.log(`Stored South African course: ${course.title} (${totalCourses}/${this.maxCourses})`);
                    }
                }
            }

            // Priority 4: Other courses
            if (totalCourses < this.maxCourses) {
                console.log('Priority 4: Fetching other courses...');
                while (hasMore && totalCourses < this.maxCourses) {
                    const response = await axios.get(this.baseUrl, {
                        params: {
                            page: page.toString(),
                            search: category
                        },
                        headers: this.headers
                    });

                    if (!response.data || !Array.isArray(response.data)) {
                        console.error('Invalid API response:', response.data);
                        break;
                    }

                    const courses = response.data;
                    if (courses.length === 0) {
                        hasMore = false;
                        break;
                    }

                    for (const course of courses) {
                        if (!existingCourseIds.has(course.id)) {
                            await this.storeCourse(course, connection);
                            existingCourseIds.add(course.id);
                            totalCourses++;
                            console.log(`Stored course: ${course.title} (${totalCourses}/${this.maxCourses})`);
                        }
                    }

                    page++;
                }
            }

            // Update the last updated category
            await this.setLastUpdatedCategory(category);
            console.log(`Completed updating courses for category: ${category}`);
            return totalCourses;
        } catch (error) {
            console.error('Error updating courses:', error);
            throw error;
        } finally {
            if (connection) connection.release();
        }
    }

    async fetchCoursesWithPriority(category, page, priority) {
        try {
            let searchQuery = category;
            
            // Add priority-specific search terms
            switch (priority) {
                case 'free_za':
                    searchQuery += ' free South Africa';
                    break;
                case 'free':
                    searchQuery += ' free';
                    break;
                case 'za':
                    searchQuery += ' South Africa';
                    break;
            }

            const response = await axios.get(this.baseUrl, {
                params: {
                    page: page.toString(),
                    search: searchQuery
                },
                headers: this.headers
            });

            if (!response.data || !Array.isArray(response.data)) {
                return [];
            }

            // Filter courses based on priority
            return response.data.filter(course => {
                switch (priority) {
                    case 'free_za':
                        return course.coupon && course.coupon.toLowerCase().includes('free') &&
                               (course.title.toLowerCase().includes('south africa') ||
                                course.desc_text.toLowerCase().includes('south africa'));
                    case 'free':
                        return course.coupon && course.coupon.toLowerCase().includes('free');
                    case 'za':
                        return course.title.toLowerCase().includes('south africa') ||
                               course.desc_text.toLowerCase().includes('south africa');
                    default:
                        return true;
                }
            });
        } catch (error) {
            console.error(`Error fetching ${priority} courses:`, error);
            return [];
        }
    }

    async storeCourse(course, connection) {
        try {
            // First check if course exists
            const [existingCourse] = await connection.query(
                'SELECT id FROM courses WHERE id = ?',
                [course.id]
            );

            if (existingCourse.length > 0) {
                console.log(`Course ${course.id} already exists, skipping...`);
                return false;
            }

            // Get the current total count of courses
            const [countResult] = await connection.query('SELECT COUNT(*) as total FROM courses');
            const nextCount = countResult[0].total + 1;

            // Format dates for MySQL
            const expiryDate = this.formatDateForMySQL(course.expiry);
            const savedTime = this.formatDateForMySQL(course.savedtime);

            // If course doesn't exist, insert it
            await connection.query(
                `INSERT INTO courses (
                    id, title, desc_text, pic, coupon, org_price,
                    category, language, platform, rating, duration,
                    expiry, savedtime, last_updated, course_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
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
                    course.rating || 0,
                    course.duration,
                    expiryDate,
                    savedTime,
                    nextCount
                ]
            );
            console.log(`Stored new course: ${course.title} (Course #${nextCount})`);
            return true;
        } catch (error) {
            console.error('Error storing course:', error);
            throw error;
        }
    }
}

module.exports = new CourseUpdateService(); 