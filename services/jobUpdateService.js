const axios = require('axios');
const pool = require('../config/database');

class JobUpdateService {
    constructor() {
        this.apiKey = process.env.RAPIDAPI_KEY;
        this.apiHost = 'jsearch.p.rapidapi.com';
        this.maxJobs = 67; // Maximum number of jobs to fetch
        this.maxJobAgeDays = 30; // Maximum age of jobs in days
        this.categories = [
            'Development',
            'IT & Software',
            'Data Science',
            'Design',
            'Marketing',
            'Business',
            'Finance',
            'Healthcare',
            'Education',
            'Engineering'
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

    isValidJob(job) {
        // Essential fields validation
        if (!job.job_id || !job.job_title || !job.employer_name || !job.job_apply_link) {
            console.log(`Skipping job: Missing required fields - ${job.job_title || 'Unknown Title'}`);
            return false;
        }

        // Validate job title and company name
        if (job.job_title.length < 3 || job.employer_name.length < 2) {
            console.log(`Skipping job: Invalid title or company name - ${job.job_title}`);
            return false;
        }

        // Validate apply URL
        try {
            const url = new URL(job.job_apply_link);
            if (!url.protocol.startsWith('http')) {
                console.log(`Skipping job: Invalid apply URL - ${job.job_title}`);
                return false;
            }
        } catch (error) {
            console.log(`Skipping job: Invalid apply URL - ${job.job_title}`);
            return false;
        }

        // Validate job date and activity status
        try {
            const postedDate = new Date(job.job_posted_at_datetime_utc);
            const now = new Date();
            const daysOld = (now - postedDate) / (1000 * 60 * 60 * 24);

            // Skip if date is invalid (1970)
            if (postedDate.getFullYear() === 1970) {
                console.log(`Skipping job: Invalid date - ${job.job_title}`);
                return false;
            }

            // If job is older than 30 days, check if it's still active
            if (daysOld > this.maxJobAgeDays) {
                // Check if job is explicitly marked as expired
                if (job.job_is_expired) {
                    console.log(`Skipping job: Marked as expired - ${job.job_title}`);
                    return false;
                }
                // If not expired, we'll keep it but log a warning
                console.log(`Warning: Job is ${Math.round(daysOld)} days old but still active - ${job.job_title}`);
            }
        } catch (error) {
            console.log(`Skipping job: Invalid date format - ${job.job_title}`);
            return false;
        }

        // Validate job description (minimum length requirement)
        if (!job.job_description || job.job_description.length < 30) {
            console.log(`Skipping job: Description too short - ${job.job_title}`);
            return false;
        }

        // Validate employment type (if provided)
        if (job.job_employment_type) {
            const validEmploymentTypes = ['FULLTIME', 'PARTTIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY'];
            if (!validEmploymentTypes.includes(job.job_employment_type.toUpperCase())) {
                console.log(`Warning: Invalid employment type for job - ${job.job_title}`);
                // Don't skip the job, just log a warning
            }
        }

        // Location validation (if provided)
        if (job.job_city && job.job_country) {
            if (job.job_city.length < 2 || job.job_country.length < 2) {
                console.log(`Warning: Invalid location format for job - ${job.job_title}`);
                // Don't skip the job, just log a warning
            }
        }

        return true;
    }

    async fetchAndStoreJobs() {
        let connection;
        try {
            console.log('Starting job update...');
            const category = await this.getNextCategory();
            console.log(`Fetching jobs for category: ${category}`);
            
            let page = 1;
            let hasMore = true;
            let totalJobs = 0;
            let existingJobIds = new Set();

            // Get existing job IDs to prevent duplicates
            connection = await this.pool.getConnection();
            const [existingJobs] = await connection.query('SELECT job_id FROM jobs');
            existingJobs.forEach(job => existingJobIds.add(job.job_id));

            // Fetch jobs from JSearch API
            while (hasMore && totalJobs < this.maxJobs) {
                const response = await axios.get('https://jsearch.p.rapidapi.com/search', {
                    params: {
                        query: `${category} jobs in South Africa`,
                        page: page.toString(),
                        num_pages: '1'
                    },
                    headers: {
                        'X-RapidAPI-Key': this.apiKey,
                        'X-RapidAPI-Host': this.apiHost
                    }
                });

                const jobs = response.data.data;
                if (!jobs || jobs.length === 0) {
                    hasMore = false;
                    break;
                }

                for (const job of jobs) {
                    if (!existingJobIds.has(job.job_id) && this.isValidJob(job)) {
                        try {
                            await this.storeJob(job, connection);
                        existingJobIds.add(job.job_id);
                        totalJobs++;
                        console.log(`Stored job: ${job.job_title} (${totalJobs}/${this.maxJobs})`);
                        } catch (error) {
                            if (error.code === 'ER_DUP_ENTRY') {
                                console.log(`Skipping duplicate job: ${job.job_title}`);
                                continue;
                            }
                            throw error;
                        }
                    }
                }

                page++;
            }

            // Update the last updated category
            await this.setLastUpdatedCategory(category);
            console.log(`Completed updating jobs for category: ${category}`);
            return totalJobs;
        } catch (error) {
            console.error('Error updating jobs:', error);
            throw error;
        } finally {
            if (connection) connection.release();
        }
    }

    async storeJob(job, connection) {
        try {
            const postedDate = new Date(job.job_posted_at_datetime_utc);
            const location = job.job_city && job.job_country 
                ? `${job.job_city}, ${job.job_country}`
                : 'Location not specified';

            await connection.query(
                `INSERT INTO jobs (
                    job_id, title, company, location, job_type, 
                    salary, description, apply_url, posted_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    job.job_id,
                    job.job_title,
                    job.employer_name,
                    location,
                    job.job_employment_type || 'Not specified',
                    job.job_min_salary && job.job_max_salary 
                        ? `${job.job_min_salary} - ${job.job_max_salary} ${job.job_salary_currency}`
                        : 'Not specified',
                    job.job_description,
                    job.job_apply_link,
                    postedDate
                ]
            );
        } catch (error) {
            console.error('Error storing job:', error);
            throw error;
        }
    }
}

module.exports = { JobUpdateService }; 