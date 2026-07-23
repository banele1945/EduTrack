let currentPage = 0;
let showAllCourses = false;

async function loadCourses(page = 0) {
    console.log(`Starting loadCourses function for page: ${page}`);
    currentPage = page;
    const coursesGrid = document.getElementById('coursesGrid');
    if (!coursesGrid) return;
    coursesGrid.innerHTML = `
        <div class="loading-placeholder">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading courses...</p>
        </div>
    `;

    try {
        const searchQuery = document.getElementById('courseSearch').value;
        const category = document.getElementById('categoryFilter').value;
        
        console.log('Loading courses with filters:', {
            searchQuery,
            category,
            page
        });
        
        const apiUrl = `/api/courses?search=${encodeURIComponent(searchQuery)}&category=${encodeURIComponent(category)}&page=${page}${showAllCourses ? '&all=true' : ''}`;
        console.log('Making API request to:', apiUrl);
        
        const response = await fetch(apiUrl);
        console.log('API Response status:', response.status);
        
        const responseData = await response.json();
        console.log('API Response data:', responseData);
        
        if (!response.ok) {
            console.error('API Error:', responseData.error || 'Failed to load courses');
            throw new Error(responseData.error || 'Failed to load courses');
        }
        
        const { courses, hasMore } = responseData;

        coursesGrid.innerHTML = '';
        
        if (!courses || courses.length === 0) {
            console.log('No courses found with current filters');
            coursesGrid.innerHTML = `
                <div class="no-courses">
                    <i class="fas fa-search"></i>
                    <h3>No courses found</h3>
                    <p>Try adjusting your search criteria</p>
                </div>
            `;
            return;
        }
        
        console.log(`Processing ${courses.length} courses`);
        courses.forEach((course, index) => {
            console.log(`Processing course ${index + 1}:`, course);
            const card = document.createElement('div');
            card.className = 'course-card';
            card.innerHTML = `
                <div class="course-image">
                    <img src="${course.pic}" alt="${course.title}" onerror="this.src='/images/course-placeholder.webp'">
                    <div class="course-level">${course.language}</div>
                </div>
                <div class="course-content">
                    <h3>${course.title}</h3>
                    <p class="course-partner">${course.platform}</p>
                    <div class="course-meta">
                        <span><i class="fas fa-clock"></i> ${course.duration} hours</span>
                        <span><i class="fas fa-star"></i> ${course.rating || 0}</span>
                        <span><i class="fas fa-globe"></i> ${course.language}</span>
                    </div>
                    <div class="course-price">${course.org_price}</div>
                    <button class="btn btn-primary view-details-btn" data-course-id="${course.id}">
                        View Details
                    </button>
                </div>
            `;
            
            // Add event listener to the button
            const viewDetailsBtn = card.querySelector('.view-details-btn');
            viewDetailsBtn.addEventListener('click', () => {
                console.log('View Details button clicked for course:', course.id);
                showCourseDetails(course.id);
            });
            
            coursesGrid.appendChild(card);
        });
        console.log('Course loading completed successfully');

        // Update pagination controls
        updatePaginationControls(hasMore);

    } catch (error) {
        console.error('Error in loadCourses:', error);
        coursesGrid.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Error loading courses</h3>
                <p>${error.message}</p>
                <button class="btn btn-primary retry-btn">
                    Try Again
                </button>
            </div>
        `;
        
        // Add event listener to retry button
        const retryBtn = coursesGrid.querySelector('.retry-btn');
        retryBtn.addEventListener('click', () => {
            console.log('Retry button clicked');
            loadCourses(currentPage);
        });
    }
}

function updatePaginationControls(hasMore) {
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    if (prevBtn) {
        prevBtn.disabled = currentPage === 0;
    }
    if (nextBtn) {
        nextBtn.disabled = !hasMore;
    }
}

// Modal functionality
const modal = document.getElementById('courseModal');
const closeBtn = document.getElementsByClassName('close')[0];

closeBtn.addEventListener('click', () => {
    console.log('Modal close button clicked');
    modal.style.display = "none";
});

window.addEventListener('click', (event) => {
    if (event.target == modal) {
        console.log('Modal closed by clicking outside');
        modal.style.display = "none";
    }
});

async function showCourseDetails(courseId) {
    console.log('Attempting to view details for course ID:', courseId);
    const modal = document.getElementById('courseModal');
    const detailsContainer = document.getElementById('courseDetails');
    
    detailsContainer.innerHTML = `
        <div class="loading-placeholder">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading course details...</p>
        </div>
    `;
    
    modal.style.display = "block";
    
    try {
        console.log('Fetching details from:', `/api/courses/${courseId}`);
        const response = await fetch(`/api/courses/${courseId}`);
        const course = await response.json();
        
        if (!response.ok) {
            console.error('Failed to load course details. Status:', response.status, 'Error:', course.error);
            throw new Error(course.error || 'Failed to load course details');
        }
        
        console.log('Successfully loaded course details:', {
            id: course.id,
            title: course.title,
            platform: course.platform,
            hasDescription: !!course.desc_text,
            hasImage: !!course.pic,
            hasCoupon: !!course.coupon
        });

        detailsContainer.innerHTML = `
            <div class="course-header">
                <img src="${course.pic}" alt="${course.title}" onerror="this.src='/images/course-placeholder.webp'">
                <div class="course-info">
                    <h2>${course.title}</h2>
                    <p class="instructor">Platform: ${course.platform}</p>
                    <div class="course-meta">
                        <span><i class="fas fa-clock"></i> ${course.duration} hours</span>
                        <span><i class="fas fa-star"></i> ${course.rating || 0}</span>
                        <span><i class="fas fa-globe"></i> ${course.language}</span>
                    </div>
                    <div class="course-price">${course.org_price}</div>
                </div>
            </div>
            <div class="course-body">
                <div class="course-description">
                    <h3>Description</h3>
                    <p>${course.desc_text}</p>
                </div>
                
                <div class="course-details">
                    <div class="detail-item">
                        <h3>Category</h3>
                        <p>${course.category}</p>
                    </div>
                    
                    <div class="detail-item">
                        <h3>Language</h3>
                        <p>${course.language}</p>
                    </div>
                    
                    <div class="detail-item">
                        <h3>Platform</h3>
                        <p>${course.platform}</p>
                    </div>
                    
                    <div class="detail-item">
                        <h3>Expiry Date</h3>
                        <p>${new Date(course.expiry).toLocaleDateString()}</p>
                    </div>
                </div>
            </div>
            <div class="course-footer">
                <a href="${course.coupon}" target="_blank" class="apply-button">
                    <i class="fas fa-external-link-alt"></i>
                    View on Udemy
                </a>
            </div>
        `;
    } catch (error) {
        console.error('Error loading course details:', {
            courseId,
            error: error.message,
            stack: error.stack
        });
        detailsContainer.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Error loading course details</h3>
                <p>${error.message}</p>
                <button class="btn btn-primary retry-details-btn" data-course-id="${courseId}">
                    Try Again
                </button>
            </div>
        `;
        
        // Add event listener to retry button
        const retryBtn = detailsContainer.querySelector('.retry-details-btn');
        retryBtn.addEventListener('click', () => {
            showCourseDetails(courseId);
        });
    }
}

// Fetch and display featured courses for the home page, with search and category support
async function fetchFeaturedCoursesHome(search = '', category = '') {
    const grid = document.getElementById('featuredCoursesGrid');
    if (!grid) return;
    grid.innerHTML = `
        <div class="loading-placeholder">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading courses...</p>
        </div>
    `;
    try {
        const url = `/api/courses/featured?page=0&limit=6&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`;
        const response = await fetch(url);
        const data = await response.json();
        if (!response.ok || !data.courses) throw new Error(data.error || 'Failed to load courses');
        grid.innerHTML = '';
        if (data.courses.length === 0) {
            grid.innerHTML = `<div class='no-courses'><i class='fas fa-search'></i><h3>No courses found</h3></div>`;
            return;
        }
        data.courses.forEach(course => {
            const card = document.createElement('div');
            card.className = 'course-card';
            card.innerHTML = `
                <div class="course-image">
                    <img src="${course.pic}" alt="${course.title}" onerror="this.src='/images/course-placeholder.webp'">
                    <div class="course-level">${course.language}</div>
                </div>
                <div class="course-content">
                    <h3>${course.title}</h3>
                    <p class="course-partner">${course.platform}</p>
                    <div class="course-meta">
                        <span><i class="fas fa-clock"></i> ${course.duration} hours</span>
                        <span><i class="fas fa-star"></i> ${course.rating || 0}</span>
                        <span><i class="fas fa-globe"></i> ${course.language}</span>
                    </div>
                    <div class="course-price">${course.org_price}</div>
                    <button class="btn btn-primary view-details-btn" data-course-id="${course.id}">View Details</button>
                </div>
            `;
            card.querySelector('.view-details-btn').addEventListener('click', () => showCourseDetails(course.id));
            grid.appendChild(card);
        });
    } catch (error) {
        grid.innerHTML = `<div class='error-message'><i class='fas fa-exclamation-circle'></i><h3>Error loading courses</h3><p>${error.message}</p></div>`;
    }
}

// Home page live search and filter logic
if (window.location.pathname === '/home') {
    // Helper debounce function
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // Get DOM elements
    const mainSearch = document.getElementById('mainSearch');
    const filterBtns = document.querySelectorAll('.filter-btn');

    let activeFilter = 'all';

    function updateHomeResults() {
        const search = mainSearch.value.trim();
        if (activeFilter === 'all' || activeFilter === 'courses') {
            fetchFeaturedCoursesHome(search, '');
        } else {
            fetchFeaturedCoursesHome('', '');
        }
        if (activeFilter === 'all' || activeFilter === 'jobs') {
            fetchFeaturedJobsHome(search, '');
        } else {
            fetchFeaturedJobsHome('', '');
        }
    }

    // Debounced search
    mainSearch.addEventListener('input', debounce(updateHomeResults, 400));

    // Filter button click
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.getAttribute('data-filter');
            updateHomeResults();
        });
    });

    // Initial load
    updateHomeResults();
}

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('Page loaded, initializing course functionality');
    // Load initial courses
    loadCourses();

    // Add event listeners for search and filters
    const searchInput = document.getElementById('courseSearch');
    const categoryFilter = document.getElementById('categoryFilter');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');

    console.log('Prev Page Button element:', prevPageBtn);
    console.log('Next Page Button element:', nextPageBtn);

    searchInput.addEventListener('input', () => {
        console.log('Search input changed');
        loadCourses(0); // Reset to first page on search/filter change
    });
    categoryFilter.addEventListener('change', () => {
        console.log('Category filter changed');
        loadCourses(0); // Reset to first page on search/filter change
    });

    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            console.log('Previous button clicked');
            if (currentPage > 0) {
                loadCourses(currentPage - 1);
            }
        });
    } else {
        console.warn('Previous page button not found!');
    }

    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            console.log('Next button clicked');
            loadCourses(currentPage + 1);
        });
    } else {
        console.warn('Next page button not found!');
    }

    addCoursesToggle();
});

function addCoursesToggle() {
    const container = document.querySelector('.courses-section .section-header');
    if (!container) return;
    let toggle = document.getElementById('coursesToggle');
    if (!toggle) {
        toggle = document.createElement('div');
        toggle.id = 'coursesToggle';
        toggle.innerHTML = `
            <button id="personalizedCoursesBtn" class="toggle-btn active">Personalized</button>
            <button id="allCoursesBtn" class="toggle-btn">All</button>
        `;
        container.appendChild(toggle);
        document.getElementById('personalizedCoursesBtn').onclick = () => {
            showAllCourses = false;
            document.getElementById('personalizedCoursesBtn').classList.add('active');
            document.getElementById('allCoursesBtn').classList.remove('active');
            loadCourses(0);
        };
        document.getElementById('allCoursesBtn').onclick = () => {
            showAllCourses = true;
            document.getElementById('allCoursesBtn').classList.add('active');
            document.getElementById('personalizedCoursesBtn').classList.remove('active');
            loadCourses(0);
        };
    }
}

// Ensure fetchFeaturedJobsHome is available
if (typeof fetchFeaturedJobsHome !== 'function') {
    window.fetchFeaturedJobsHome = function() {
        console.warn('fetchFeaturedJobsHome is not defined. Please ensure jobs.js is loaded before courses.js.');
    };
}