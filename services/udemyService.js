const axios = require('axios');
const db = require('../config/database');

class UdemyService {
    constructor() {
        this.baseUrl = 'https://paid-udemy-course-for-free.p.rapidapi.com';
        this.headers = {
            'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
            'X-RapidAPI-Host': 'paid-udemy-course-for-free.p.rapidapi.com'
        };
    }

    async searchCourses(query = '', page = 0, pageSize = 12) {
        try {
            const offset = page * pageSize;
            const [dbCourses] = await db.query(
                `SELECT * FROM courses 
                WHERE (? = '' OR title LIKE ? OR desc_text LIKE ?)
                AND (? = '' OR category = ?)
                AND (? = '' OR language = ?)
                ORDER BY last_updated DESC
                LIMIT ? OFFSET ?`,
                [
                    query, `%${query}%`, `%${query}%`,
                    query, query,
                    query, query,
                    pageSize, offset
                ]
            );

            return {
                courses: dbCourses,
                hasMore: dbCourses.length === pageSize
            };
        } catch (error) {
            console.error('Error in searchCourses:', error);
            return { courses: [], hasMore: false };
        }
    }

    async getCourseDetails(courseId) {
        try {
            const [courses] = await db.query(
                'SELECT * FROM courses WHERE id = ?',
                [courseId]
            );

            if (courses.length === 0) {
                throw new Error('Course not found');
            }

            return courses[0];
        } catch (error) {
            console.error('Error fetching course details:', error);
            throw error;
        }
    }

    async fetchFromApi(query = '', page = 0) {
        try {
            if (!process.env.RAPIDAPI_KEY) {
                throw new Error('API key not configured');
            }

            const response = await axios.get(this.baseUrl, {
                params: {
                    page: page.toString(),
                    search: query
                },
                headers: this.headers
            });

            if (!response.data || !Array.isArray(response.data)) {
                throw new Error('Invalid response from Udemy API');
            }

            const courses = response.data.map(course => ({
                id: course.id,
                title: course.title,
                desc_text: course.desc_text,
                pic: course.pic,
                coupon: course.coupon,
                org_price: course.org_price,
                category: course.category,
                language: course.language,
                platform: course.platform,
                rating: course.rating || 0,
                duration: course.duration,
                expiry: course.expiry,
                savedtime: course.savedtime
            }));

            return {
                courses,
                hasMore: courses.length === 12
            };
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    async storeCourse(course) {
        try {
            const [existingCourse] = await db.query(
                'SELECT id FROM courses WHERE id = ?',
                [course.id]
            );

            if (existingCourse.length > 0) {
                await db.query(
                    `UPDATE courses SET 
                    title = ?, desc_text = ?, pic = ?, coupon = ?, 
                    org_price = ?, category = ?, language = ?, platform = ?,
                    rating = ?, duration = ?, expiry = ?, savedtime = ?
                    WHERE id = ?`,
                    [
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
                        course.expiry,
                        course.savedtime,
                        course.id
                    ]
                );
            } else {
                await db.query(
                    `INSERT INTO courses (
                        id, title, desc_text, pic, coupon, org_price,
                        category, language, platform, rating, duration,
                        expiry, savedtime
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                        course.expiry,
                        course.savedtime
                    ]
                );
            }
        } catch (error) {
            console.error('Error storing course:', error);
        }
    }

    getSampleCourses() {
        return [
            {
                id: '1',
                name: 'Python for Beginners',
                description: 'Learn Python programming from scratch',
                imageUrl: '/public/images/course-placeholder.webp',
                url: 'https://www.udemy.com/course/python-for-beginners/',
                rating: 4.5,
                ratingCount: 1234,
                instructor: 'John Doe',
                price: '$19.99',
                duration: '10h 30m',
                level: 'Beginner',
                category: 'Development'
            },
            {
                id: '2',
                name: 'Web Development Bootcamp',
                description: 'Complete web development course',
                imageUrl: '/public/images/course-placeholder.webp',
                url: 'https://www.udemy.com/course/web-development-bootcamp/',
                rating: 4.7,
                ratingCount: 2345,
                instructor: 'Jane Smith',
                price: '$29.99',
                duration: '15h 45m',
                level: 'Intermediate',
                category: 'Development'
            },
            {
                id: '3',
                name: 'Data Science Fundamentals',
                description: 'Master data science concepts',
                imageUrl: '/public/images/course-placeholder.webp',
                url: 'https://www.udemy.com/course/data-science-fundamentals/',
                rating: 4.6,
                ratingCount: 3456,
                instructor: 'Mike Johnson',
                price: '$24.99',
                duration: '12h 15m',
                level: 'Advanced',
                category: 'Data Science'
            }
        ];
    }

    getSampleCourseDetails(courseId) {
        const sampleCourses = {
            '1': {
                id: '1',
                name: 'Python for Beginners',
                description: 'Learn Python programming from scratch. This comprehensive course covers everything from basic syntax to advanced concepts.',
                imageUrl: 'https://img-c.udemycdn.com/course/480x270/394676_ce3d_5.jpg',
                url: 'https://www.udemy.com/course/python-for-beginners/',
                rating: 4.5,
                ratingCount: 1234,
                instructor: 'John Doe',
                price: '$19.99',
                duration: '10h 30m',
                level: 'Beginner',
                category: 'Development',
                objectives: [
                    'Understand Python syntax and basic concepts',
                    'Write your first Python program',
                    'Work with data structures and functions',
                    'Build simple applications'
                ],
                requirements: [
                    'No prior programming experience needed',
                    'Basic computer skills',
                    'A computer with Python installed'
                ],
                targetAudience: 'Complete beginners who want to learn programming',
                lastUpdated: '2024-03-07'
            }
        };
        return sampleCourses[courseId] || sampleCourses['1'];
    }
}

module.exports = new UdemyService(); 