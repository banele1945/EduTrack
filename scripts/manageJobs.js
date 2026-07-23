require('dotenv').config();
const { JobUpdateService } = require('../services/jobUpdateService');
const { JobCleanupService } = require('../services/jobCleanupService');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class JobManager {
    constructor() {
        this.jobUpdateService = new JobUpdateService();
        this.jobCleanupService = new JobCleanupService();
        this.logDir = path.join(__dirname, '../logs');
    }

    async runJobManagement() {
        try {
            // Ensure logs directory exists
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir);
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const logFile = path.join(this.logDir, `job-management-${timestamp}.log`);
            
            // Create a write stream for this run
            const logStream = fs.createWriteStream(logFile, { flags: 'a' });
            
            const log = (message) => {
                const timestamp = new Date().toISOString();
                const logMessage = `[${timestamp}] ${message}\n`;
                logStream.write(logMessage);
                console.log(message);
            };

            log('Starting job management process...');

            // Step 1: Get initial job count
            const [initialCount] = await this.jobUpdateService.db.query('SELECT COUNT(*) as count FROM jobs');
            log(`Initial job count: ${initialCount[0].count}`);

            // Step 2: Clean up expired jobs
            log('\n=== Starting Job Cleanup ===');
            try {
                const [beforeCleanup] = await this.jobUpdateService.db.query('SELECT COUNT(*) as count FROM jobs');
                await this.jobCleanupService.cleanupJobs();
                const [afterCleanup] = await this.jobUpdateService.db.query('SELECT COUNT(*) as count FROM jobs');
                const removedCount = beforeCleanup[0].count - afterCleanup[0].count;
                log(`Job cleanup completed. Removed ${removedCount} expired jobs.`);
            } catch (error) {
                log(`Error during job cleanup: ${error.message}`);
                if (error.stack) {
                    log(`Stack trace: ${error.stack}`);
                }
            }

            // Step 3: Fetch new jobs
            log('\n=== Starting Job Fetch ===');
            try {
                const [beforeFetch] = await this.jobUpdateService.db.query('SELECT COUNT(*) as count FROM jobs');
                const totalJobs = await this.jobUpdateService.fetchAndStoreJobs();
                const [afterFetch] = await this.jobUpdateService.db.query('SELECT COUNT(*) as count FROM jobs');
                const addedCount = afterFetch[0].count - beforeFetch[0].count;
                log(`Successfully fetched and stored ${addedCount} new jobs`);
            } catch (error) {
                log(`Error during job fetch: ${error.message}`);
                if (error.stack) {
                    log(`Stack trace: ${error.stack}`);
                }
            }

            // Step 4: Print detailed summary
            log('\n=== Job Management Summary ===');
            try {
                // Get total jobs
                const [jobCount] = await this.jobUpdateService.db.query('SELECT COUNT(*) as count FROM jobs');
                
                // Get job age distribution
                const [ageDistribution] = await this.jobUpdateService.db.query(`
                    SELECT 
                        CASE 
                            WHEN DATEDIFF(NOW(), posted_date) <= 7 THEN 'Last 7 days'
                            WHEN DATEDIFF(NOW(), posted_date) <= 14 THEN '8-14 days'
                            WHEN DATEDIFF(NOW(), posted_date) <= 21 THEN '15-21 days'
                            WHEN DATEDIFF(NOW(), posted_date) <= 30 THEN '22-30 days'
                            ELSE 'Over 30 days'
                        END as age_group,
                        COUNT(*) as count
                    FROM jobs
                    GROUP BY age_group
                    ORDER BY 
                        CASE age_group
                            WHEN 'Last 7 days' THEN 1
                            WHEN '8-14 days' THEN 2
                            WHEN '15-21 days' THEN 3
                            WHEN '22-30 days' THEN 4
                            ELSE 5
                        END
                `);

                // Get category distribution
                const [categoryDistribution] = await this.jobUpdateService.db.query(`
                    SELECT 
                        CASE 
                            WHEN title LIKE '%developer%' OR title LIKE '%software%' THEN 'Development'
                            WHEN title LIKE '%data%' OR title LIKE '%analyst%' THEN 'Data Science'
                            WHEN title LIKE '%design%' OR title LIKE '%ui%' OR title LIKE '%ux%' THEN 'Design'
                            WHEN title LIKE '%marketing%' OR title LIKE '%social%' THEN 'Marketing'
                            WHEN title LIKE '%business%' OR title LIKE '%finance%' THEN 'Business'
                            WHEN title LIKE '%health%' OR title LIKE '%medical%' THEN 'Healthcare'
                            WHEN title LIKE '%education%' OR title LIKE '%teaching%' THEN 'Education'
                            WHEN title LIKE '%engineer%' OR title LIKE '%technical%' THEN 'Engineering'
                            ELSE 'Other'
                        END as category,
                        COUNT(*) as count
                    FROM jobs
                    GROUP BY category
                    ORDER BY count DESC
                `);

                log(`\nTotal jobs in database: ${jobCount[0].count}`);
                
                log('\nJob Age Distribution:');
                ageDistribution.forEach(row => {
                    log(`- ${row.age_group}: ${row.count} jobs`);
                });

                log('\nCategory Distribution:');
                categoryDistribution.forEach(row => {
                    log(`- ${row.category}: ${row.count} jobs`);
                });

                // Get the oldest and newest jobs
                const [oldestJob] = await this.jobUpdateService.db.query(
                    'SELECT title, company, posted_date FROM jobs ORDER BY posted_date ASC LIMIT 1'
                );
                const [newestJob] = await this.jobUpdateService.db.query(
                    'SELECT title, company, posted_date FROM jobs ORDER BY posted_date DESC LIMIT 1'
                );

                if (oldestJob[0]) {
                    log(`\nOldest job: ${oldestJob[0].title} at ${oldestJob[0].company} (${oldestJob[0].posted_date})`);
                }
                if (newestJob[0]) {
                    log(`Newest job: ${newestJob[0].title} at ${newestJob[0].company} (${newestJob[0].posted_date})`);
                }
            } catch (error) {
                log(`Error getting summary: ${error.message}`);
            }

            log('\nJob management process completed');
            logStream.end();

            // Close database connections
            await this.jobUpdateService.db.end();
            await this.jobCleanupService.db.end();

        } catch (error) {
            console.error('Fatal error in job management:', error);
            process.exit(1);
        }
    }
}

// Run the job management
const jobManager = new JobManager();
jobManager.runJobManagement().catch(console.error); 