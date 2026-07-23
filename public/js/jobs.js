console.log("jobs.js script loaded!");
let currentFeaturedJobPage = 0;
let currentAllJobsPage = 0;
const jobsPerPage = 12;
let jobModalElement = null; // Declare globally
let jobDetailsContainerElement = null; // Declare globally
let showAllJobs = false;

// Function to fetch jobs from the database
async function fetchJobs(page = 0) {
    console.log('Starting fetchJobs function...');
    currentAllJobsPage = page;
    addJobsToggle();
    try {
        const jobsGrid = document.getElementById('allJobsGrid');
        if (!jobsGrid) {
            console.error('jobsGrid element not found!');
            return;
        }

        jobsGrid.innerHTML = `
            <div class="loading-placeholder">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading jobs...</p>
            </div>
        `;

        const searchQuery = document.getElementById('jobSearch')?.value || '';
        const typeFilter = document.getElementById('jobTypeFilter')?.value || '';
        const categoryFilter = document.getElementById('jobCategoryFilter')?.value || '';
        const locationFilter = document.getElementById('jobLocationFilter')?.value || '';

        console.log('Fetching jobs with params:', {
            searchQuery,
            typeFilter,
            categoryFilter,
            locationFilter,
            page
        });

        const apiUrl = `/api/jobs?search=${encodeURIComponent(searchQuery)}&page=${page}&pageSize=${jobsPerPage}&category=${encodeURIComponent(categoryFilter)}&type=${encodeURIComponent(typeFilter)}&location=${encodeURIComponent(locationFilter)}${showAllJobs ? '&all=true' : ''}`;
        const response = await fetch(apiUrl);
        console.log('API Response status:', response.status);
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('API Error:', errorData);
            throw new Error(errorData.error || 'Failed to fetch jobs');
        }

        const data = await response.json();
        console.log('API Response data:', data);

        if (!data.jobs || !Array.isArray(data.jobs)) {
            console.error('Invalid jobs data:', data);
            throw new Error('Invalid response format from server');
        }

        displayJobs(data.jobs, data.hasMore);
        updatePaginationControls(data.hasMore);
    } catch (error) {
        console.error('Error in fetchJobs:', error);
        const jobsGrid = document.getElementById('allJobsGrid');
        if (jobsGrid) {
            jobsGrid.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <h3>Error loading jobs</h3>
                    <p>${error.message}</p>
                    <button class="btn btn-primary retry-btn" onclick="fetchJobs(currentAllJobsPage)">
                        Try Again
                    </button>
                </div>
            `;
        }
    }
}

// Function to display jobs in the grid
function displayJobs(jobs, hasMore) {
    console.log('Displaying jobs:', jobs);
    const jobsGrid = document.getElementById('allJobsGrid');
    if (!jobsGrid) {
        console.error('jobsGrid element not found in displayJobs!');
        return;
    }
    
    if (!jobs || jobs.length === 0) {
        console.log('No jobs to display');
        jobsGrid.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <h3>No jobs found</h3>
                <p>Try adjusting your search criteria</p>
            </div>
        `;
        return;
    }

    jobsGrid.innerHTML = '';
    jobs.forEach(job => {
        const card = document.createElement('div');
        card.className = 'course-card'; // Use course-card for consistent styling
        card.innerHTML = `
            <div class="course-image">
                <img src="${job.organization_logo || '/images/job-placeholder.jpeg'}" alt="${job.title}" onerror="this.src='/images/job-placeholder.jpeg'">
                <div class="course-level">${job.type || 'Not specified'}</div>
            </div>
            <div class="course-content">
                <h3>${job.title}</h3>
                <p class="course-partner">${job.company || ''}</p>
                <div class="course-meta">
                    <span><i class="fas fa-map-marker-alt"></i> ${job.location || 'Location not specified'}</span>
                    <span><i class="fas fa-briefcase"></i> ${job.type || 'Not specified'}</span>
                    ${job.salary && job.salary !== 'Not specified' ? `<span><i class="fas fa-money-bill-wave"></i> ${job.salary}</span>` : ''}
                    <span><i class="fas fa-clock"></i> Posted: ${new Date(job.posted_date).toLocaleDateString()}</span>
                </div>
                <button class="btn btn-primary view-details-btn" data-job-id="${job.id}">
                    View Details
                </button>
            </div>
        `;
        // Add event listener to the button
        const viewDetailsBtn = card.querySelector('.view-details-btn');
        viewDetailsBtn.addEventListener('click', () => {
            showJobDetails(job.id);
        });
        jobsGrid.appendChild(card);
    });
    console.log('Finished displaying jobs');
}

function updatePaginationControls(hasMore) {
    const prevBtn = document.getElementById('prevJobPageBtn');
    const nextBtn = document.getElementById('nextJobPageBtn');

    if (prevBtn) {
        prevBtn.disabled = currentAllJobsPage === 0;
    }
    if (nextBtn) {
        nextBtn.disabled = !hasMore;
    }
}

// Modal functionality
async function showJobDetails(jobId) {
    console.log('Attempting to view details for job ID:', jobId);
    const modal = document.getElementById('jobModal');
    const detailsContainer = document.getElementById('jobDetails');
    if (!modal || !detailsContainer) {
        return;
    }
    detailsContainer.innerHTML = `
        <div class="loading-placeholder">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading job details...</p>
        </div>
    `;
    modal.style.display = "block";
    try {
        const response = await fetch(`/api/jobs/${jobId}`);
        const job = await response.json();
        if (!response.ok) {
            throw new Error(job.error || 'Failed to load job details');
        }
        // Use job.url or job.apply_url for the apply button
        const applyLink = job.url || job.apply_url;
        detailsContainer.innerHTML = `
            <div class="course-header">
                <img src="${job.organization_logo || '/images/job-placeholder.jpeg'}" alt="${job.title}" onerror="this.src='/images/job-placeholder.jpeg'">
                <div class="course-info">
                    <h2>${job.title}</h2>
                    <p class="instructor">Company: ${job.company || ''}</p>
                    <div class="course-meta">
                        <span><i class="fas fa-map-marker-alt"></i> ${job.location || 'Location not specified'}</span>
                        <span><i class="fas fa-briefcase"></i> ${job.type || 'Not specified'}</span>
                        ${job.salary && job.salary !== 'Not specified' ? `<span><i class="fas fa-money-bill-wave"></i> ${job.salary}</span>` : ''}
                        <span><i class="fas fa-clock"></i> Posted: ${new Date(job.posted_date).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>
            <div class="course-body">
                <div class="course-description">
                    <h3>Description</h3>
                    <p>${job.description || 'No description available'}</p>
                </div>
                <div class="course-details">
                    <div class="detail-item">
                        <h3>Job Type</h3>
                        <p>${job.type || 'Not specified'}</p>
                    </div>
                    <div class="detail-item">
                        <h3>Location</h3>
                        <p>${job.location || 'Not specified'}</p>
                    </div>
                    <div class="detail-item">
                        <h3>Salary</h3>
                        <p>${job.salary || 'Not specified'}</p>
                    </div>
                    <div class="detail-item">
                        <h3>Posted Date</h3>
                        <p>${new Date(job.posted_date).toLocaleDateString()}</p>
                    </div>
                </div>
            </div>
            <div class="course-footer">
                ${applyLink ? `<a href="${applyLink}" target="_blank" rel="noopener noreferrer" class="apply-button"><i class="fas fa-external-link-alt"></i>Apply Now</a>` : ''}
            </div>
        `;
    } catch (error) {
        detailsContainer.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Error loading job details</h3>
                <p>${error.message}</p>
                <button class="btn btn-primary retry-details-btn" data-job-id="${jobId}">Try Again</button>
            </div>
        `;
        const retryBtn = detailsContainer.querySelector('.retry-details-btn');
        retryBtn.addEventListener('click', () => {
            showJobDetails(jobId);
        });
    }
}

// Add event listeners when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Initializing jobs section');
    
    // Initialize modal elements
    const jobModal = document.getElementById('jobModal');
    const jobDetails = document.getElementById('jobDetails');
    const closeBtns = document.getElementsByClassName('close');

    // Add event listeners for modal close buttons
    Array.from(closeBtns).forEach(closeBtn => {
        closeBtn.addEventListener('click', () => {
            console.log('Modal close button clicked');
            jobModal.style.display = "none";
        });
    });

    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === jobModal) {
            console.log('Modal closed by clicking outside');
            jobModal.style.display = "none";
        }
    });

    // Check if jobs section exists
    const jobsSection = document.getElementById('jobs-section');
    const jobsGrid = document.getElementById('allJobsGrid');
    
    console.log('Jobs section elements found:', {
        jobsSection: !!jobsSection,
        jobsGrid: !!jobsGrid
    });

    if (!jobsSection || !jobsGrid) {
        console.error('Jobs section or grid not found in the DOM');
        return;
    }
    
    // Initial load of jobs
    fetchJobs();

    // Add event listeners for search and filters
    const searchInput = document.getElementById('jobSearch');
    const typeFilter = document.getElementById('jobTypeFilter');
    const categoryFilter = document.getElementById('jobCategoryFilter');

    console.log('Search elements found:', {
        searchInput: !!searchInput,
        typeFilter: !!typeFilter,
        categoryFilter: !!categoryFilter
    });

    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            console.log('Search input changed');
            fetchJobs(0);
        }, 500));
    }

    if (typeFilter) {
        typeFilter.addEventListener('change', () => {
            console.log('Type filter changed');
            fetchJobs(0);
        });
    }

    if (categoryFilter) {
        categoryFilter.addEventListener('change', () => {
            console.log('Category filter changed');
            fetchJobs(0);
        });
    }

    // Add event listeners for pagination buttons
    const prevBtn = document.getElementById('prevJobPageBtn');
    const nextBtn = document.getElementById('nextJobPageBtn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            console.log('Previous page button clicked');
            fetchJobs(currentAllJobsPage - 1);
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            console.log('Next page button clicked');
            fetchJobs(currentAllJobsPage + 1);
        });
    }

    addJobsToggle();
});

// Debounce function to limit API calls
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function prevJobs() {
    if (currentFeaturedJobPage > 0) {
        currentFeaturedJobPage--;
        loadFeaturedJobs();
    }
}
function nextJobs() {
    currentFeaturedJobPage++;
    loadFeaturedJobs();
}
function prevAllJobs() {
    if (currentAllJobsPage > 0) {
        currentAllJobsPage--;
        fetchJobs(currentAllJobsPage);
    }
}
function nextAllJobs() {
    currentAllJobsPage++;
    fetchJobs(currentAllJobsPage);
}
function showJobsPage() {
    document.querySelector('.home-container').style.display = 'none';
    document.getElementById('jobsPage').style.display = 'block';
    fetchJobs();
}
function showHomePage() {
    document.getElementById('jobsPage').style.display = 'none';
    document.querySelector('.home-container').style.display = 'block';
}

// Load featured jobs (3 at a time)
async function loadFeaturedJobs() {
    try {
        const response = await fetch(`/api/jobs/featured?page=${currentFeaturedJobPage}&limit=3`);
        const data = await response.json();
        const jobsGrid = document.getElementById('featuredJobsGrid');
        if (!jobsGrid) return;
        jobsGrid.innerHTML = '';
        if (!data.jobs || data.jobs.length === 0) {
            jobsGrid.innerHTML = `
                <div class="no-courses">
                    <i class="fas fa-search"></i>
                    <h3>No jobs found</h3>
                    <p>Try adjusting your search criteria</p>
                </div>
            `;
            return;
        }
        data.jobs.forEach(job => {
            const card = document.createElement('div');
            card.className = 'course-card'; // Use course-card for consistent styling
            card.innerHTML = `
                <div class="course-image">
                    <img src="${job.organization_logo || '/images/job-placeholder.jpeg'}" alt="${job.title}" onerror="this.src='/images/job-placeholder.jpeg'">
                    <div class="course-level">${job.type || 'Not specified'}</div>
                </div>
                <div class="course-content">
                    <h3>${job.title}</h3>
                    <p class="course-partner">${job.company || ''}</p>
                    <div class="course-meta">
                        <span><i class="fas fa-map-marker-alt"></i> ${job.location || 'Location not specified'}</span>
                        <span><i class="fas fa-briefcase"></i> ${job.type || 'Not specified'}</span>
                        ${job.salary && job.salary !== 'Not specified' ? `<span><i class="fas fa-money-bill-wave"></i> ${job.salary}</span>` : ''}
                        <span><i class="fas fa-clock"></i> Posted: ${new Date(job.posted_date).toLocaleDateString()}</span>
                    </div>
                    <button class="btn btn-primary view-details-btn" data-job-id="${job.id}">
                        View Details
                    </button>
                </div>
            `;
            // Add event listener to the button
            const viewDetailsBtn = card.querySelector('.view-details-btn');
            viewDetailsBtn.addEventListener('click', () => {
                showJobDetails(job.id);
            });
            jobsGrid.appendChild(card);
        });
        document.querySelector('.prev-job-btn').disabled = currentFeaturedJobPage === 0;
        document.querySelector('.next-job-btn').disabled = !data.hasMore;
    } catch (error) {
        const jobsGrid = document.getElementById('featuredJobsGrid');
        if (jobsGrid) {
            jobsGrid.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <h3>Error loading jobs</h3>
                    <p>${error.message}</p>
                    <button class="btn btn-primary retry-btn" onclick="loadFeaturedJobs()">Try Again</button>
                </div>
            `;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadFeaturedJobs();
    document.querySelector('.view-all-jobs-btn').addEventListener('click', (e) => {
        e.preventDefault();
        showJobsPage();
    });
    document.getElementById('prevJobPageBtn').addEventListener('click', prevAllJobs);
    document.getElementById('nextJobPageBtn').addEventListener('click', nextAllJobs);
    // Touch swipe support for jobs carousel
    let touchStartX = 0;
    let touchEndX = 0;
    const carousel = document.querySelector('.featured-jobs-carousel .carousel-container');
    if (carousel) {
        carousel.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        });
        carousel.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        });
        function handleSwipe() {
            const swipeThreshold = 50;
            if (touchEndX < touchStartX - swipeThreshold) {
                nextJobs();
            } else if (touchEndX > touchStartX + swipeThreshold) {
                prevJobs();
            }
        }
    }
});

// Fetch and display featured jobs for the home page, with search and category support
async function fetchFeaturedJobsHome(search = '', category = '') {
    const grid = document.getElementById('featuredJobsGrid');
    if (!grid) return;
    grid.innerHTML = `
        <div class="loading-placeholder">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading jobs...</p>
        </div>
    `;
    try {
        const url = `/api/jobs/featured?page=0&limit=6&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`;
        const response = await fetch(url);
        const data = await response.json();
        if (!response.ok || !data.jobs) throw new Error(data.error || 'Failed to load jobs');
        grid.innerHTML = '';
        if (data.jobs.length === 0) {
            grid.innerHTML = `<div class='no-results'><i class='fas fa-search'></i><h3>No jobs found</h3></div>`;
            return;
        }
        data.jobs.forEach(job => {
            const card = document.createElement('div');
            card.className = 'course-card';
            card.innerHTML = `
                <div class="course-image">
                    <img src="${job.organization_logo || '/images/job-placeholder.jpeg'}" alt="${job.title}" onerror="this.src='/images/job-placeholder.jpeg'">
                    <div class="course-level">${job.type || 'Not specified'}</div>
                </div>
                <div class="course-content">
                    <h3>${job.title}</h3>
                    <p class="course-partner">${job.company || ''}</p>
                    <div class="course-meta">
                        <span><i class="fas fa-map-marker-alt"></i> ${job.location || 'Location not specified'}</span>
                        <span><i class="fas fa-briefcase"></i> ${job.type || 'Not specified'}</span>
                        ${job.salary && job.salary !== 'Not specified' ? `<span><i class="fas fa-money-bill-wave"></i> ${job.salary}</span>` : ''}
                        <span><i class="fas fa-clock"></i> Posted: ${new Date(job.posted_date).toLocaleDateString()}</span>
                    </div>
                    <button class="btn btn-primary view-details-btn" data-job-id="${job.id}">View Details</button>
                </div>
            `;
            card.querySelector('.view-details-btn').addEventListener('click', () => showJobDetails(job.id));
            grid.appendChild(card);
        });
    } catch (error) {
        grid.innerHTML = `<div class='error-message'><i class='fas fa-exclamation-circle'></i><h3>Error loading jobs</h3><p>${error.message}</p></div>`;
    }
}

// Global function for jobs page search/filter
window.loadAllJobs = function() {
    fetchJobs(0);
}; 

function addJobsToggle() {
    const container = document.querySelector('.jobs-section .section-header');
    if (!container) return;
    let toggle = document.getElementById('jobsToggle');
    if (!toggle) {
        toggle = document.createElement('div');
        toggle.id = 'jobsToggle';
        toggle.innerHTML = `
            <button id="personalizedJobsBtn" class="toggle-btn active">Personalized</button>
            <button id="allJobsBtn" class="toggle-btn">All</button>
        `;
        container.appendChild(toggle);
        document.getElementById('personalizedJobsBtn').onclick = () => {
            showAllJobs = false;
            document.getElementById('personalizedJobsBtn').classList.add('active');
            document.getElementById('allJobsBtn').classList.remove('active');
            fetchJobs(0);
        };
        document.getElementById('allJobsBtn').onclick = () => {
            showAllJobs = true;
            document.getElementById('allJobsBtn').classList.add('active');
            document.getElementById('personalizedJobsBtn').classList.remove('active');
            fetchJobs(0);
        };
    }
} 