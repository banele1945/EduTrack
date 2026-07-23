const axios = require('axios');

class JobPostingFeedService {
    constructor(db) {
        this.db = db;
        this.apiKey = process.env.RAPIDAPI_KEY;
        this.apiHost = 'job-posting-feed-api.p.rapidapi.com';
        this.apiCalls = 0;
        this.maxJobAgeDays = 30;
        this.categories = {
            'IT & Software': ['software', 'developer', 'engineer', 'programmer', 'IT', 'tech', 'data science', 'cybersecurity'],
            'Design': ['designer', 'UX', 'UI', 'graphic', 'web design', 'product design'],
            'Business': ['business analyst', 'project manager', 'consultant', 'sales', 'marketing', 'finance', 'HR', 'administration'],
            'Teaching & Academics': ['teacher', 'lecturer', 'professor', 'education', 'academic', 'tutor'],
            'Medicine related jobs': ['doctor', 'nurse', 'medical', 'healthcare', 'physician', 'clinic', 'hospital']
        };
        this.defaultLogo = 'https://via.placeholder.com/150'; // Default logo URL
    }

    isValidJob(job) {
        // Essential fields validation
        if (!job.id || !job.title || !job.organization || !job.location || !job.description || !job.url) {
            console.log(`Skipping job: Missing required fields - ID: ${job.id}, Title: ${job.title || 'Unknown'}, Company: ${job.organization || 'Unknown'}, Location: ${job.location || 'Unknown'}, Description: ${job.description ? 'Provided' : 'Missing'}, Apply URL: ${job.url || 'Unknown'}`);
            return false;
        }

        // Validate job title and company name
        if (job.title.length < 3 || job.organization.length < 2) {
            console.log(`Skipping job: Invalid title or company name - ${job.title}`);
            return false;
        }

        // Validate apply URL
        try {
            const url = new URL(job.url);
            if (!url.protocol.startsWith('http')) {
                console.log(`Skipping job: Invalid apply URL - ${job.title}`);
                return false;
            }
        } catch (error) {
            console.log(`Skipping job: Invalid apply URL - ${job.title}`);
            return false;
        }

        // Validate job date
        try {
            const postedDate = new Date(job.date_posted);
            const now = new Date();
            const daysOld = (now - postedDate) / (1000 * 60 * 60 * 24);

            // Skip if date is invalid (1970)
            if (postedDate.getFullYear() === 1970) {
                console.log(`Skipping job: Invalid date - ${job.title}`);
                return false;
            }

            // If job is older than max age, log a warning
            if (daysOld > this.maxJobAgeDays) {
                console.log(`Warning: Job is ${Math.round(daysOld)} days old - ${job.title}`);
            }
        } catch (error) {
            console.log(`Skipping job: Invalid date format - ${job.title}`);
            return false;
        }

        // Validate job description
        if (!job.description || job.description.length < 30) {
            console.log(`Skipping job: Description too short - ${job.title}`);
            return false;
        }

        return true;
    }

    formatSalary(salary) {
        if (!salary) return 'Not specified';
        
        // Handle different salary formats
        if (typeof salary === 'string') {
            return salary;
        }
        
        if (typeof salary === 'object') {
            if (salary.value && salary.currency) {
                return `${salary.value} ${salary.currency}`;
            }
            if (salary.min && salary.max && salary.currency) {
                return `${salary.min} - ${salary.max} ${salary.currency}`;
            }
        }
        
        return 'Not specified';
    }

    getCategory(job) {
        const text = `${job.title} ${job.description}`.toLowerCase();
        for (const category in this.categories) {
            for (const keyword of this.categories[category]) {
                if (text.includes(keyword)) {
                    return category;
                }
            }
        }
        return null; // No matching category
    }

    async fetchAndStoreJobs() {
        try {
            console.log('Starting job fetch from Job Posting Feed API...');
            
            const options = {
                method: 'GET',
                url: 'https://job-posting-feed-api.p.rapidapi.com/active-ats-6m',
                params: {
                    description_type: 'text'
                },
                headers: {
                    'x-rapidapi-key': this.apiKey,
                    'x-rapidapi-host': this.apiHost
                }
            };

            const response = await axios.request(options);
            this.apiCalls++;

            let jobs = response.data;
            console.log(`Fetched ${jobs.length} jobs from Job Posting Feed API`);

            let storedCount = 0;
            let skippedCount = 0;
            let errorCount = 0;
            
            // Prioritize South African jobs
            const saJobs = jobs.filter(job => job.location && (job.location.toLowerCase().includes('south africa') || job.location.toLowerCase().includes(', za')));
            const otherJobs = jobs.filter(job => !job.location || !(job.location.toLowerCase().includes('south africa') || job.location.toLowerCase().includes(', za')));

            jobs = [...saJobs, ...otherJobs]; // Process SA jobs first

            for (const job of jobs) {
                try {
                    if (!this.isValidJob(job)) {
                        skippedCount++;
                        continue;
                    }

                    const category = this.getCategory(job);
                    if (!category) {
                        console.log(`Skipping job: No matching category found - ${job.title}`);
                        skippedCount++;
                        continue;
                    }

                    // Check if job already exists
                    const [existing] = await this.db.query(
                        'SELECT id FROM jobs WHERE job_id = ?',
                        [job.id]
                    );

                    if (existing.length === 0) {
                        await this.storeJob(job);
                        storedCount++;
                        console.log(`Stored job: ${job.title} (Category: ${category})`);
                    } else {
                        console.log(`Job already exists: ${job.title}`);
                    }
                } catch (error) {
                    errorCount++;
                    console.error(`Error processing job ${job.id || 'Unknown ID'}:`, error);
                }
            }

            console.log('\nJob Feed API Summary:');
            console.log('---------------------');
            console.log(`Total jobs fetched: ${response.data.length}`);
            console.log(`Jobs stored: ${storedCount}`);
            console.log(`Jobs skipped: ${skippedCount}`);
            console.log(`Errors encountered: ${errorCount}`);
            console.log(`API calls made: ${this.apiCalls}`);

            return storedCount;
        } catch (error) {
            console.error('Error fetching jobs from Job Posting Feed API:', error);
            throw error;
        }
    }

    async storeJob(job) {
        try {
            const postedDate = job.date_posted ? new Date(job.date_posted) : new Date();
            const location = job.location || 'Location not specified';
            const jobType = job.employment_type || job.job_type || 'Not specified';
            const salary = this.formatSalary(job.salary);
            const organizationLogo = job.organization_logo || this.defaultLogo;

            await this.db.query(
                `INSERT INTO jobs (
                    job_id, title, company, location, job_type, 
                    salary, description, apply_url, posted_date, organization_logo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    job.id,
                    job.title,
                    job.organization,
                    location,
                    jobType,
                    salary,
                    job.description,
                    job.url,
                    postedDate,
                    organizationLogo
                ]
            );
        } catch (error) {
            console.error('Error storing job in database:', error);
            throw error;
        }
    }
}

module.exports = JobPostingFeedService; 