const axios = require('axios');

class CourseraService {
    constructor() {
        // Using Coursera's public API endpoint
        this.baseUrl = 'https://api.coursera.com/ent';
    }

    async searchCourses(query = '') {
        try {
            console.log('Searching Coursera courses with query:', query);
            
            const response = await axios.get(this.baseUrl, {
                params: {
                    q: query,
                    limit: 20,
                    fields: 'id,name,description,photoUrl,partnerIds,startDate,workload,enrollmentCount,rating,level,primaryCategory,slug'
                },
                headers: {
                    'Accept': 'application/json',
                    'Authorization': 'Bearer public',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            console.log('Coursera API Response:', JSON.stringify(response.data, null, 2));

            // Check if we have the expected data structure
            if (!response.data || !response.data.elements) {
                console.log('Unexpected API response structure, using sample courses');
                return this.getSampleCourses();
            }

            // Get courses from the response
            const courses = response.data.elements;
            
            if (courses.length === 0) {
                console.log('No courses found in the response, using sample courses');
                return this.getSampleCourses();
            }

            const formattedCourses = courses.map(course => ({
                id: course.id,
                name: course.name,
                description: course.description,
                partner: course.partnerIds?.[0] || 'Coursera',
                imageUrl: course.photoUrl || '/images/course-placeholder.webp',
                rating: course.rating,
                enrollmentCount: course.enrollmentCount,
                level: course.level,
                category: course.primaryCategory,
                url: `https://www.coursera.org/learn/${course.slug}`
            }));

            return formattedCourses;
        } catch (error) {
            console.error('Error searching Coursera courses:', error.response?.data || error.message);
            console.log('Using sample courses due to API error');
            return this.getSampleCourses();
        }
    }

    // Fallback method to return sample courses when API is not available
    getSampleCourses() {
        return [
            {
                id: 'python-for-everybody',
                name: 'Python for Everybody',
                description: 'Learn to Program and Analyze Data with Python. Develop programs to gather, clean, analyze, and visualize data.',
                partner: 'University of Michigan',
                imageUrl: '/images/course-placeholder.webp',
                rating: 4.8,
                enrollmentCount: 1500000,
                level: 'Beginner',
                category: 'Computer Science',
                url: 'https://www.coursera.org/specializations/python'
            },
            {
                id: 'machine-learning',
                name: 'Machine Learning',
                description: 'Machine learning is the science of getting computers to act without being explicitly programmed.',
                partner: 'Stanford University',
                imageUrl: '/images/course-placeholder.webp',
                rating: 4.9,
                enrollmentCount: 2000000,
                level: 'Intermediate',
                category: 'Data Science',
                url: 'https://www.coursera.org/learn/machine-learning'
            },
            {
                id: 'data-science',
                name: 'Data Science Specialization',
                description: 'Learn the concepts and tools you\'ll need throughout the data science pipeline.',
                partner: 'Johns Hopkins University',
                imageUrl: '/images/course-placeholder.webp',
                rating: 4.7,
                enrollmentCount: 1800000,
                level: 'Beginner',
                category: 'Data Science',
                url: 'https://www.coursera.org/specializations/jhu-data-science'
            }
        ];
    }

    async getCourseDetails(courseId) {
        try {
            const response = await axios.get(`${this.baseUrl}/courses/${courseId}`);
            const course = response.data;

            return {
                id: course.courseId,
                name: course.name,
                description: course.description,
                imageUrl: course.photoUrl,
                partner: course.partnerName,
                startDate: course.startDate,
                workload: course.workload,
                enrollmentCount: course.enrollmentCount,
                rating: course.rating,
                url: `https://www.coursera.org/learn/${courseId}`,
                instructors: course.instructorIds,
                syllabus: course.syllabus,
                prerequisites: course.prerequisites
            };
        } catch (error) {
            console.error('Error fetching course details from Coursera:', error);
            throw new Error('Failed to fetch course details from Coursera');
        }
    }
}

module.exports = new CourseraService(); 