const axios = require('axios');
const db = require('../config/database');

class JobService {
    constructor() {
        this.apiKey = process.env.RAPIDAPI_KEY;
        this.apiHost = 'jsearch.p.rapidapi.com';
        this.defaultLogo = 'https://via.placeholder.com/150'; // Default logo URL
    }

    async searchJobs(query = '', page = 0, pageSize = 12, category = '', location = '') {
        try {
            console.log('Searching jobs with params:', { query, page, pageSize, category, location });
            const offset = page * pageSize;
            
            // First try to get jobs from database
            let sql = 'SELECT * FROM jobs WHERE 1=1';
            const params = [];

            if (query) {
                sql += ' AND (title LIKE ? OR company LIKE ? OR description LIKE ?)';
                const searchTerm = `%${query}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }

            if (category) {
                sql += ' AND category = ?';
                params.push(category);
            }

            if (location) {
                sql += ' AND location LIKE ?';
                params.push(`%${location}%`);
            }

            // Prioritize South African jobs if no specific location is provided
            if (!location) {
                sql += ' ORDER BY CASE WHEN location LIKE \'%South Africa%\' THEN 0 ELSE 1 END, posted_date DESC';
            } else {
                sql += ' ORDER BY posted_date DESC';
            }
            
            sql += ' LIMIT ? OFFSET ?';
            params.push(pageSize, offset);

            const [jobs] = await db.query(sql, params);
            console.log('Found jobs in database:', jobs.length);

            // If we have enough jobs from database, return them
            if (jobs.length >= pageSize) {
                let countSql = 'SELECT COUNT(*) as total FROM jobs WHERE 1=1';
                const countParams = [];
                if (query) {
                    countSql += ' AND (title LIKE ? OR company LIKE ? OR description LIKE ?)';
                    countParams.push(params[0], params[1], params[2]);
                }
                if (category) {
                    countSql += ' AND category = ?';
                    countParams.push(category);
                }
                if (location) {
                    countSql += ' AND location LIKE ?';
                    countParams.push(`%${location}%`);
                }

                const [countResult] = await db.query(countSql, countParams);
                return {
                    jobs,
                    hasMore: offset + jobs.length < countResult[0].total,
                    total: countResult[0].total
                };
            }

            // If we don't have enough jobs, try to fetch from API
            console.log('Not enough jobs in database, fetching from API...');
            const apiJobs = await this.fetchJobsFromAPI(query, page, pageSize, category, location);
            
            // Store new jobs in database
            for (const job of apiJobs) {
                try {
                    const [existing] = await db.query(
                        'SELECT id FROM jobs WHERE job_id = ?',
                        [job.job_id]
                    );

                    if (existing.length === 0) {
                        await this.storeJob(job);
                    }
                } catch (error) {
                    console.error(`Error storing job ${job.job_id}:`, error);
                }
            }

            // Combine database and API jobs
            const combinedJobs = [...jobs, ...apiJobs].slice(0, pageSize);
            
            return {
                jobs: combinedJobs,
                hasMore: apiJobs.length === pageSize,
                total: jobs.length + apiJobs.length
            };
        } catch (error) {
            console.error('Error searching jobs:', error);
            throw error;
        }
    }

    async fetchJobsFromAPI(query = '', page = 0, pageSize = 12, category = '', location = '') {
        try {
            let apiQuery = query;
            if (category) {
                apiQuery = `${category} ${apiQuery}`.trim();
            }
            if (!location || location.toLowerCase().includes('south africa') || location.toLowerCase().includes('za')) {
                apiQuery = `${apiQuery} in South Africa`.trim();
            }
            
            const response = await axios.get('https://jsearch.p.rapidapi.com/search', {
                params: {
                    query: apiQuery || 'jobs',
                    page: (page + 1).toString(),
                    num_pages: '1'
                },
                headers: {
                    'X-RapidAPI-Key': this.apiKey,
                    'X-RapidAPI-Host': this.apiHost
                }
            });

            return response.data.data || [];
        } catch (error) {
            console.error('Error fetching jobs from API:', error);
            return [];
        }
    }

    async storeJob(job) {
        try {
            // Add organization_logo here if available from JSearch API, otherwise use default
            const organizationLogo = job.employer_logo || this.defaultLogo;

            await db.query(
                `INSERT INTO jobs (
                    job_id, title, company, location, job_type, 
                    salary, description, apply_url, posted_date, organization_logo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    job.job_id,
                    job.job_title,
                    job.employer_name,
                    `${job.job_city}, ${job.job_country}`,
                    job.job_employment_type || 'Not specified',
                    job.job_min_salary && job.job_max_salary 
                        ? `${job.job_min_salary} - ${job.job_max_salary} ${job.job_salary_currency}`
                        : 'Not specified',
                    job.job_description,
                    job.job_apply_link,
                    new Date(job.job_posted_at_datetime_utc),
                    organizationLogo
                ]
            );
            console.log(`Stored job: ${job.job_title}`);
        } catch (error) {
            console.error(`Error storing job ${job.job_title}:`, error);
            throw error;
        }
    }

    async getJobDetails(jobId) {
        try {
            // First try to get from database
            const [jobs] = await db.query('SELECT * FROM jobs WHERE job_id = ?', [jobId]);
            
            if (jobs.length > 0) {
                return jobs[0];
            }

            // If not in database, fetch from API
            const response = await axios.get('https://jsearch.p.rapidapi.com/job-details', {
                params: { job_id: jobId },
                headers: {
                    'X-RapidAPI-Key': this.apiKey,
                    'X-RapidAPI-Host': this.apiHost
                }
            });

            const job = response.data.data[0];
            if (job) {
                await this.storeJob(job);
            }

            return job;
        } catch (error) {
            console.error('Error getting job details:', error);
            throw error;
        }
    }

    async fetchAndStoreJobs() {
        try {
            console.log('Starting job update...');
            
            // Fetch jobs from JSearch API
            const response = await axios.get('https://jsearch.p.rapidapi.com/search', {
                params: {
                    query: 'South Africa',
                    page: '1',
                    num_pages: '1'
                },
                headers: {
                    'X-RapidAPI-Key': this.apiKey,
                    'X-RapidAPI-Host': this.apiHost
                }
            });

            const jobs = response.data.data;
            console.log(`Fetched ${jobs.length} jobs from API`);

            // Store jobs in database
            for (const job of jobs) {
                try {
                    // Check if job already exists
                    const [existing] = await db.query(
                        'SELECT id FROM jobs WHERE job_id = ?',
                        [job.job_id]
                    );

                    if (existing.length === 0) {
                        // Insert new job
                        await db.query(
                            `INSERT INTO jobs (
                                job_id, title, company, location, job_type, 
                                salary, description, apply_url, posted_date, organization_logo
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                job.job_id,
                                job.job_title,
                                job.employer_name,
                                `${job.job_city}, ${job.job_country}`,
                                job.job_employment_type || 'Not specified',
                                job.job_min_salary && job.job_max_salary 
                                    ? `${job.job_min_salary} - ${job.job_max_salary} ${job.job_salary_currency}`
                                    : 'Not specified',
                                job.job_description,
                                job.job_apply_link,
                                new Date(job.job_posted_at_datetime_utc),
                                job.employer_logo || this.defaultLogo
                            ]
                        );
                        console.log(`Stored job: ${job.job_title}`);
                    } else {
                        console.log(`Job already exists: ${job.job_title}`);
                    }
                } catch (error) {
                    console.error(`Error storing job ${job.job_title}:`, error);
                }
            }

            console.log('Job update completed successfully');
        } catch (error) {
            console.error('Error updating jobs:', error);
            throw error;
        }
    }

    async getJobs(page = 1, pageSize = 10, query = '') {
        try {
            const offset = (page - 1) * pageSize;
            let sql = 'SELECT * FROM jobs';
            const params = [];

            if (query) {
                sql += ' WHERE title LIKE ? OR company LIKE ? OR description LIKE ?';
                const searchTerm = `%${query}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }

            sql += ' ORDER BY posted_date DESC LIMIT ? OFFSET ?';
            params.push(pageSize, offset);

            const [jobs] = await db.query(sql, params);
            return jobs;
        } catch (error) {
            console.error('Error getting jobs:', error);
            throw error;
        }
    }
}

module.exports = new JobService(); 