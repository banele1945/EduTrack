@echo off
echo Starting job tasks at %date% %time%

:: Set the path to your Node.js installation if not in system PATH
:: set PATH=%PATH%;C:\Program Files\nodejs

:: Navigate to your project directory
cd /d %~dp0\..

:: Run the job fetch script
echo Running job fetch...
node scripts/fetchJobs.js

:: Run the job cleanup script
echo Running job cleanup...
node scripts/cleanupJobs.js

echo Job tasks completed at %date% %time% 