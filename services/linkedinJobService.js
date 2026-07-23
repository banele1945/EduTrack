const axios = require('axios');
const db = require('../config/database');

class LinkedInJobService {
    constructor() {
        this.db = db;
        this.apiKey = process.env.RAPIDAPI_KEY;
        this.apiHost = 'linkedin-job-search-api.p.rapidapi.com';
        this.apiCalls = 0;
        this.maxJobsPerCall = 50;
        this.maxJobAgeDays = 30;
        this.categories = {
            'IT & Software': ['software', 'developer', 'engineer', 'programmer', 'IT', 'tech', 'data science', 'cybersecurity', 'cloud', 'network', 'web', 'mobile'],
            'Design': ['designer', 'UX', 'UI', 'graphic', 'web design', 'product design', 'visual', 'creative'],
            'Business': ['business analyst', 'project manager', 'consultant', 'sales', 'marketing', 'finance', 'HR', 'administration', 'management', 'accountant', 'operations'],
            'Teaching & Academics': ['teacher', 'lecturer', 'professor', 'education', 'academic', 'tutor', 'instructor', 'researcher'],
            'Medicine related jobs': ['doctor', 'nurse', 'medical', 'healthcare', 'physician', 'clinic', 'hospital', 'pharmacist', 'therapist', 'dentist']
        };
        this.defaultLogo = 'https://via.placeholder.com/150'; // Default logo URL
    }

    isValidJob(job) {
        // Essential fields validation
        if (!job.id || !job.title || !job.organization || !job.locations_derived || job.locations_derived.length === 0 || !job.url) {
            console.log(`Skipping job: Missing required fields - ID: ${job.id}, Title: ${job.title || 'Unknown'}, Company: ${job.organization || 'Unknown'}, Location: ${job.locations_derived ? job.locations_derived.join(', ') : 'Unknown'}, Apply URL: ${job.url || 'Unknown'}`);
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

        // Validate job description (now optional, default to 'No description available' if missing or too short)
        if (!job.linkedin_org_description || job.linkedin_org_description.length < 30) {
            console.log(`Warning: Description too short or missing for job - ${job.title}. Will default to 'No description available'.`);
            // Don't return false here, allow the job to pass validation.
        }

        return true;
    }

    formatSalary(salary) {
        if (!salary) return 'Not specified';
        
        if (typeof salary === 'string') {
            return salary;
        }
        
        // LinkedIn API response often has salary_raw field
        if (salary.salary_raw) {
            return salary.salary_raw;
        }
        
        return 'Not specified';
    }

    getCategory(job) {
        const text = `${job.title} ${job.linkedin_org_description}`.toLowerCase();
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
            console.log('Starting job fetch from LinkedIn Job Search API...');
            
            const options = {
                method: 'GET',
                url: 'https://linkedin-job-search-api.p.rapidapi.com/active-jb-24h',
                params: {
                    limit: this.maxJobsPerCall.toString(),
                    offset: '0',
                    // Combine all category keywords for title filter
                    title_filter: Object.values(this.categories).flat().map(keyword => `"${keyword}"`).join(' OR '),
                    location_filter: '"South Africa"' // Prioritize South Africa directly via API
                },
                headers: {
                    'x-rapidapi-key': this.apiKey,
                    'x-rapidapi-host': this.apiHost
                }
            };

            const response = await axios.request(options);
            this.apiCalls++;

            let jobs = response.data; // API limit handles the slicing
            console.log(`Fetched ${jobs.length} jobs from LinkedIn Job Search API`);

            let storedCount = 0;
            let skippedCount = 0;
            let errorCount = 0;
            
            // No need for post-fetch prioritization, as it's handled by API params

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
                        await this.storeJob(job, category);
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

            console.log('\nLinkedIn Job Search API Summary:');
            console.log('---------------------------------');
            console.log(`Total jobs fetched (after limit): ${jobs.length}`);
            console.log(`Jobs stored: ${storedCount}`);
            console.log(`Jobs skipped: ${skippedCount}`);
            console.log(`Errors encountered: ${errorCount}`);
            console.log(`API calls made: ${this.apiCalls}`);

            return storedCount;
        } catch (error) {
            console.error('Error fetching jobs from LinkedIn Job Search API:', error);
            throw error;
        }
    }

    async storeJob(job, category) {
        try {
            const postedDate = job.date_posted ? new Date(job.date_posted) : new Date();
            const location = job.locations_derived && job.locations_derived.length > 0 ? job.locations_derived.join(', ') : 'Location not specified';
            const jobType = job.employment_type && job.employment_type.length > 0 ? job.employment_type.join(', ') : 'Not specified';
            const salary = this.formatSalary(job.salary_raw);
            const organizationLogo = job.organization_logo || this.defaultLogo;
            const description = job.linkedin_org_description || 'No description available';

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
                    description,
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

module.exports = LinkedInJobService;