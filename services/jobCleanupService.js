const db = require('../config/database');
const axios = require('axios');
require('dotenv').config();

class JobCleanupService {
    constructor() {
        this.apiKey = process.env.RAPIDAPI_KEY;
        this.apiHost = 'jsearch.p.rapidapi.com';
        this.batchSize = 10; // Number of jobs to check in parallel
        this.db = db;
    }

    async checkJobStatus(jobId) {
        try {
            const response = await axios.get('https://jsearch.p.rapidapi.com/job-details', {
                params: {
                    job_id: jobId
                },
                headers: {
                    'X-RapidAPI-Key': this.apiKey,
                    'X-RapidAPI-Host': this.apiHost
                }
            });

            const jobData = response.data.data[0];
            if (!jobData) {
                console.log(`Job ${jobId} not found in API - marking as expired`);
                return false;
            }

            // Check if job is explicitly marked as expired
            if (jobData.job_is_expired) {
                console.log(`Job ${jobId} is marked as expired in API`);
                return false;
            }

            // Check if apply link is still valid
            try {
                const response = await axios.head(jobData.job_apply_link, {
                    timeout: 5000 // 5 second timeout
                });
                if (response.status >= 400) {
                    console.log(`Job ${jobId} has invalid apply link (status: ${response.status})`);
                    return false;
                }
            } catch (error) {
                console.log(`Job ${jobId} has invalid apply link: ${error.message}`);
                return false;
            }

            return true;
        } catch (error) {
            console.error(`Error checking job ${jobId}:`, error.message);
            // If we can't verify the job status, we'll keep it
            return true;
        }
    }

    async cleanupJobs() {
        try {
            console.log('Starting job cleanup...');
            
            // Get all jobs from database
            const [jobs] = await this.db.query('SELECT job_id, title, company, posted_date FROM jobs');
            console.log(`Total jobs in database: ${jobs.length}`);

            let expiredCount = 0;
            let keptCount = 0;
            let errorCount = 0;

            // Process jobs in batches
            for (let i = 0; i < jobs.length; i += this.batchSize) {
                const batch = jobs.slice(i, i + this.batchSize);
                console.log(`\nProcessing batch ${Math.floor(i/this.batchSize) + 1} of ${Math.ceil(jobs.length/this.batchSize)}`);

                // Check each job in the batch
                const results = await Promise.all(
                    batch.map(async (job) => {
                        try {
                            const isActive = await this.checkJobStatus(job.job_id);
                            if (!isActive) {
                                await this.db.query('DELETE FROM jobs WHERE job_id = ?', [job.job_id]);
                                expiredCount++;
                                console.log(`Deleted expired job: ${job.title} at ${job.company}`);
                            } else {
                                keptCount++;
                                console.log(`Kept active job: ${job.title} at ${job.company}`);
                            }
                            return { job, isActive };
                        } catch (error) {
                            errorCount++;
                            console.error(`Error processing job ${job.job_id}:`, error.message);
                            return { job, error: true };
                        }
                    })
                );

                // Add a small delay between batches to avoid rate limiting
                if (i + this.batchSize < jobs.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // Print summary
            console.log('\nCleanup Summary:');
            console.log('----------------');
            console.log(`Total jobs processed: ${jobs.length}`);
            console.log(`Jobs kept: ${keptCount}`);
            console.log(`Jobs deleted: ${expiredCount}`);
            console.log(`Errors encountered: ${errorCount}`);

            // Get remaining jobs count
            const [remainingJobs] = await this.db.query('SELECT COUNT(*) as count FROM jobs');
            console.log(`\nRemaining jobs in database: ${remainingJobs[0].count}`);

            // Get the oldest remaining job
            const [oldestJob] = await this.db.query(
                'SELECT title, company, posted_date FROM jobs ORDER BY posted_date ASC LIMIT 1'
            );
            
            if (oldestJob[0]) {
                console.log('\nOldest remaining job:', {
                    title: oldestJob[0].title,
                    company: oldestJob[0].company,
                    posted_date: oldestJob[0].posted_date
                });
            }

            console.log('\nJob cleanup completed successfully');
        } catch (error) {
            console.error('Error during job cleanup:', error);
            throw error;
        }
    }
}

module.exports = { JobCleanupService }; 