require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const path = require('path');
const db = require('./config/database');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const fs = require('fs');
const helmet = require('helmet');
const { isAuthenticated } = require('./middleware/auth');
const udemyService = require('./services/udemyService');
const cors = require('cors');
const courseUpdateService = require('./services/courseUpdateService');
const jobService = require('./services/jobService');

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Security middleware
app.use(helmet({
    
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:", "img-c.udemycdn.com"],
            fontSrc: ["'self'", "cdnjs.cloudflare.com", "data:"],
            connectSrc: ["'self'", "https://udemy-api.p.rapidapi.com"],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameAncestors: ["'none'"],
            scriptSrcAttr: ["'unsafe-inline'"]  // Allow inline event handlers
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
    
   //contentSecurityPolicy: false
}));

// Session configuration
const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    port: 3306,  // MySQL default port
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    createDatabaseTable: true,
    connectionLimit: 10,
    waitForConnections: true
});

app.use(session({
    key: 'session_cookie_name',
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// Store io instance in app for use in routes
app.set('io', io);

// Enable CORS for all routes
app.use(cors());

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // We need to associate the socket with the logged-in user.
    // This should ideally happen after authentication. For now, we'll assume
    // the user ID is available via session or passed upon socket connection.
    // A robust implementation would handle this securely.
    // Frontend needs to emit 'setUserId' with the user's ID after login.
    socket.on('setUserId', (userId) => {
        socket.userId = userId;
        console.log(`Socket ${socket.id} associated with user ID ${userId}`);
    });

    // Join conversation room (using connection_id as room ID)
    socket.on('joinConversation', async (connectionId) => {
        try {
            if (!socket.userId) {
                socket.emit('error', { message: 'Authentication required to join conversation' });
                return;
            }

            console.log(`User ${socket.userId} attempting to join conversation room ${connectionId}`);

            // Verify user is part of an accepted connection for this connectionId
            const [connection] = await db.query(
                'SELECT id FROM connections WHERE id = ? AND (sender_id = ? OR receiver_id = ?) AND status = \'accepted\'',
                [connectionId, socket.userId, socket.userId]
            );

            if (!connection.length) {
                console.log(`User ${socket.userId} is not authorized for connection ${connectionId}`);
                socket.emit('error', { message: 'You must be connected to chat with this user' });
                return;
            }

            socket.join(connectionId);
            console.log(`User ${socket.userId} joined conversation room ${connectionId}`);
        } catch (error) {
            console.error('Error joining conversation:', error);
            socket.emit('error', { message: 'Error joining conversation' });
        }
    });

    // Handle new message
    socket.on('sendMessage', async (data) => {
        try {
            const { conversationId, content } = data; // conversationId here is actually connection_id

             if (!socket.userId) {
                socket.emit('error', { message: 'Authentication required to send message' });
                return;
            }

            console.log(`User ${socket.userId} attempting to send message in conversation ${conversationId}`);
            
            // Verify user is part of an accepted connection for this conversationId
            const [connection] = await db.query(
                'SELECT id FROM connections WHERE id = ? AND (sender_id = ? OR receiver_id = ?) AND status = \'accepted\'',
                [conversationId, socket.userId, socket.userId]
            );

            if (!connection.length) {
                 console.log(`User ${socket.userId} is not authorized to send message in connection ${conversationId}`);
                socket.emit('error', { message: 'You must be connected to chat with this user' });
                return;
            }

            // Insert message into the messages table (using connectionId as conversation_id)
            const [result] = await db.query(
                'INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)',
                [conversationId, socket.userId, content]
            );

            // Fetch the full message details including sender info to emit
            const [messageDetails] = await db.query(
                 `SELECT 
                     m.*,
                     u.Full_Name as username,
                     u.avatar
                 FROM messages m
                 JOIN Students u ON m.sender_id = u.ID
                 WHERE m.id = ?`,
                 [result.insertId]
             );

            if (!messageDetails.length) {
                 console.error('Failed to fetch newly created message details');
                 // Decide how to handle this - maybe emit an error back to the sender
                 return;
            }

            const emittedMessage = {
                 id: messageDetails[0].id,
                 conversationId: messageDetails[0].conversation_id, // Ensure connectionId is included
                 senderId: messageDetails[0].sender_id,
                 senderName: messageDetails[0].username,
                 senderAvatar: messageDetails[0].avatar || '/images/default-avatar.jpg',
                 content: messageDetails[0].content,
                 timestamp: messageDetails[0].created_at,
                 isRead: messageDetails[0].is_read
            };

            // Broadcast message to conversation room (using connectionId as the room)
            io.to(conversationId).emit('newMessage', emittedMessage);
            console.log(`Message sent in conversation ${conversationId} by user ${socket.userId}`);

        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('error', { message: 'Error sending message' });
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Here you might update user status in DB or inform connected friends
    });
});

// Routes
app.use('/messages', require('./routes/messages'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/jobs', require('./routes/jobs'));

// Root route - redirect to login if not authenticated, home if authenticated
app.get('/', isAuthenticated, (req, res) => {
    res.render('home', { 
        user: req.session.user,
        title: 'Home - EduTrack'
    });
});

// Login page route
app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/home');
    }
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// Home page route
app.get('/home', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('home', { user: req.session.user });
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Error logging out');
        }
        res.redirect('/login');
    });
});

// Register page route
app.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/home');
    }
    res.sendFile(path.join(__dirname, 'views', 'register.html'));
});

// Login form submission
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Login attempt for email:', email);
        console.log('Password received:', password ? 'Yes' : 'No');

        // Get user from database
        const [users] = await db.execute(
            "SELECT * FROM Students WHERE Email = ?",
            [email]
        );

        console.log('Found users:', users.length);
        console.log('Raw user data:', JSON.stringify(users[0], null, 2));

        if (users.length === 0) {
            console.log('No user found with email:', email);
            return res.status(401).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Login Failed - EduTrack</title>
                    <link rel="stylesheet" href="/css/style.css">
                </head>
                <body>
                    <div class="register-container">
                        <h1>Login Failed</h1>
                        <p>Invalid email or password.</p>
                        <a href="/login" class="button">Back to Login</a>
                    </div>
                </body>
                </html>
            `);
        }

        const user = users[0];
        console.log('User found:', user.ID);
        console.log('Stored password hash:', user.Password ? 'Yes' : 'No');

        if (!user.Password) {
            console.log('No password hash found for user');
            return res.status(401).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Login Failed - EduTrack</title>
                    <link rel="stylesheet" href="/css/style.css">
                </head>
                <body>
                    <div class="register-container">
                        <h1>Login Failed</h1>
                        <p>Account error. Please contact support.</p>
                        <a href="/login" class="button">Back to Login</a>
                    </div>
                </body>
                </html>
            `);
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.Password);
        console.log('Password valid:', validPassword);

        if (!validPassword) {
            console.log('Invalid password for user:', user.ID);
            return res.status(401).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Login Failed - EduTrack</title>
                    <link rel="stylesheet" href="/css/style.css">
                </head>
                <body>
                    <div class="register-container">
                        <h1>Login Failed</h1>
                        <p>Invalid email or password.</p>
                        <a href="/login" class="button">Back to Login</a>
                    </div>
                </body>
                </html>
            `);
        }

        // Set user session
        req.session.user = {
            id: user.ID,
            fullName: user.Full_Name,
            email: user.Email,
            institution: user.Institution,
            department: user.Department,
            yearOfStudy: user.Year_Of_Study,
            interests: user.Interests
        };

        console.log('Login successful for user:', user.ID);
        res.redirect('/home');
    } catch (error) {
        console.error('Login error details:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Login Error - EduTrack</title>
                <link rel="stylesheet" href="/css/style.css">
            </head>
            <body>
                <div class="register-container">
                    <h1>Login Error</h1>
                    <p>An error occurred during login. Please try again.</p>
                    <a href="/login" class="button">Back to Login</a>
                </div>
            </body>
            </html>
        `);
    }
});

// API Routes
app.get('/api/user', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json(req.session.user);
});

app.get('/api/users/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.json([]);
        }

        // Query the Students table and exclude current user
        const [users] = await db.query(
            'SELECT ID as id, Full_Name as username, Email as email, avatar FROM Students WHERE (Full_Name LIKE ? OR Email LIKE ?) AND ID != ? LIMIT 10',
            [`%${q}%`, `%${q}%`, req.session.user.id]
        );

        res.json(users);
    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ error: 'Failed to search users' });
    }
});

// API route to fetch a user's public profile by ID
app.get('/api/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const [users] = await db.query(
            'SELECT ID as id, Full_Name as username, Email as email, avatar, Institution as institution, Department as department, Year_Of_Study as yearOfStudy FROM Students WHERE ID = ?',
            [userId]
        );
        if (!users.length) return res.status(404).json({ error: 'User not found' });
        res.json(users[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

// API route to fetch all users
app.get('/api/users', async (req, res) => {
    try {
        const [users] = await db.query(
            'SELECT ID as id, Full_Name as username, avatar FROM Students WHERE ID != ?',
            [req.session.user.id] // Exclude current user
        );
        res.json(users);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Validation middleware
const validateRegistration = [
  body('fullName').trim().escape().notEmpty().withMessage('Full name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('institution').trim().escape().notEmpty().withMessage('Institution is required'),
  body('department').trim().escape().notEmpty().withMessage('Department is required'),
  body('yearOfStudy').isInt({ min: 1, max: 4 }).withMessage('Please select a valid year of study'),
  body('interests').trim().escape().notEmpty().withMessage('Interests are required')
];

// Route for form submission
app.post("/register", validateRegistration, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Return HTML error page for validation errors
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Registration Error - EduTrack</title>
            <link rel="stylesheet" href="/css/style.css">
        </head>
        <body>
            <div class="register-container">
                <h1>Registration Error</h1>
                <ul>
                  ${errors.array().map(e => `<li>${e.msg}</li>`).join('')}
                </ul>
                <a href="/register" class="button">Back to Registration</a>
            </div>
        </body>
        </html>
      `);
    }

    const { fullName, email, password, institution, department, interests, yearOfStudy } = req.body;
    console.log('Registration attempt for:', email);

    // Check if email already exists
    const [existingUsers] = await db.execute(
      "SELECT ID FROM Students WHERE Email = ?",
      [email]
    );

    if (existingUsers.length > 0) {
      console.log('Email already registered:', email);
      // Return HTML error page for duplicate email
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Registration Error - EduTrack</title>
            <link rel="stylesheet" href="/css/style.css">
        </head>
        <body>
            <div class="register-container">
                <h1>Registration Error</h1>
                <p>Email already registered. Please use a different email or <a href='/login'>login</a>.</p>
                <a href="/register" class="button">Back to Registration</a>
            </div>
        </body>
        </html>
      `);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Password hashed successfully');

    // Insert new user
    const [result] = await db.execute(
      "INSERT INTO Students (Full_Name, Email, Password, Institution, Department, Interests, Year_Of_Study) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [fullName, email, hashedPassword, institution, department, interests, yearOfStudy]
    );

    console.log('User registered successfully:', result.insertId);

    // Send success response with HTML
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Registration Successful - EduTrack</title>
          <link rel="stylesheet" href="/css/style.css">
      </head>
      <body>
          <div class="register-container">
              <h1>Registration Successful!</h1>
              <p>Your account has been created successfully.</p>
              <a href="/login" class="button">Go to Login</a>
          </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Registration Failed - EduTrack</title>
          <link rel="stylesheet" href="/css/style.css">
      </head>
      <body>
          <div class="register-container">
              <h1>Registration Failed</h1>
              <p>Sorry, there was an error creating your account. Please try again.</p>
              <a href="/register" class="button">Back to Registration</a>
          </div>
      </body>
      </html>
    `);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Add profile route
app.get('/profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('profile', { 
        profileUser: req.session.user,
        connections: [] // We'll implement connections later
    });
});

// Multer setup for avatar upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, 'public', 'uploads', 'avatars');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, 'avatar_' + req.session.user.id + '_' + Date.now() + ext);
    }
});
const upload = multer({ storage });

// Profile update route
app.post('/profile', upload.single('avatar'), async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { fullName, institution, department, yearOfStudy } = req.body;
    let avatarPath = req.session.user.avatar;
    if (req.file) {
        avatarPath = '/uploads/avatars/' + req.file.filename;
    }
    try {
        await db.query(
            'UPDATE Students SET Full_Name = ?, Institution = ?, Department = ?, Year_Of_Study = ?, avatar = ? WHERE ID = ?',
            [fullName, institution, department, yearOfStudy, avatarPath, req.session.user.id]
        );
        // Update session
        req.session.user.fullName = fullName;
        req.session.user.institution = institution;
        req.session.user.department = department;
        req.session.user.yearOfStudy = yearOfStudy;
        req.session.user.avatar = avatarPath;
        res.redirect('/profile');
    } catch (err) {
        console.error('Profile update error:', err);
        res.status(500).send('Error updating profile.');
    }
});

// Add friends route
app.get('/friends', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'friends.html'));
});

// Add connection request API
app.post('/api/connections', async (req, res) => {
    try {
        const { userId } = req.body;
        const senderId = req.session.user.id;

        // Check if connection already exists
        const [existingConnections] = await db.query(
            'SELECT * FROM connections WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)',
            [senderId, userId, userId, senderId]
        );

        if (existingConnections.length > 0) {
            return res.status(400).json({ error: 'Connection request already exists' });
        }

        // Create new connection request
        await db.query(
            'INSERT INTO connections (sender_id, receiver_id) VALUES (?, ?)',
            [senderId, userId]
        );

        res.json({ message: 'Connection request sent successfully' });
    } catch (error) {
        console.error('Error sending connection request:', error);
        res.status(500).json({ error: 'Failed to send connection request' });
    }
});

// API route to handle connection request response
app.post('/api/connections/:requestId/respond', async (req, res) => {
    try {
        const { requestId } = req.params;
        const { action } = req.body; // 'accept' or 'reject'
        
        console.log('Responding to connection request:', { requestId, action, userId: req.session.user.id });
        
        const [result] = await db.query(
            'UPDATE connections SET status = ? WHERE id = ? AND receiver_id = ?',
            [action === 'accept' ? 'accepted' : 'rejected', requestId, req.session.user.id]
        );
        
        if (result.affectedRows === 0) {
            console.log('No connection request found to update');
            return res.status(404).json({ error: 'Connection request not found' });
        }

        // If accepted, create a conversation and notify the sender
        if (action === 'accept') {
            // Check if a conversation already exists for this connection
            const [existingConversation] = await db.query(
                'SELECT connection_id FROM conversations WHERE connection_id = ?',
                [requestId]
            );

            if (existingConversation.length === 0) {
                // Create a new conversation entry
                await db.query(
                    'INSERT INTO conversations (connection_id) VALUES (?)',
                    [requestId]
                );
                console.log('Conversation created for connection:', requestId);
            }

            const [connection] = await db.query(
                'SELECT sender_id FROM connections WHERE id = ?',
                [requestId]
            );
            
            if (connection.length > 0) {
                io.emit(`connection_accepted_${connection[0].sender_id}`, {
                    message: 'Your connection request was accepted!'
                });
            }
        }
        
        console.log('Successfully updated connection request');
        res.json({ message: `Connection request ${action}ed successfully` });
    } catch (error) {
        console.error('Error responding to connection request:', error);
        res.status(500).json({ error: 'Failed to respond to connection request' });
    }
});

// API route to fetch pending connection requests
app.get('/api/connections/pending/requests', async (req, res) => {
    try {
        console.log('=== Connection Requests Debug ===');
        console.log('User ID requesting connections:', req.session.user.id);
        
        // Get pending requests
        const [requests] = await db.query(`
            SELECT 
                c.id as connectionId,
                s.ID as id,
                s.Full_Name as username,
                s.avatar,
                c.created_at as requestDate
            FROM connections c
            JOIN students s ON c.sender_id = s.ID
            WHERE c.receiver_id = ? AND c.status = 'pending'
            ORDER BY c.created_at DESC
        `, [req.session.user.id]);
        
        console.log('Raw SQL query result:', requests);
        console.log('Number of requests found:', requests.length);
        
        // Always return an array
        res.json(requests);
    } catch (error) {
        console.error('Error fetching connection requests:', error);
        res.status(500).json({ error: 'Failed to fetch connection requests' });
    }
});

// API to check connection status
app.get('/api/connections/status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const currentUserId = req.session.user.id;

        const [connections] = await db.query(
            'SELECT * FROM connections WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)',
            [currentUserId, userId, userId, currentUserId]
        );

        if (connections.length === 0) {
            return res.json({ status: 'none' });
        }

        res.json({ status: connections[0].status });
    } catch (error) {
        console.error('Error checking connection status:', error);
        res.status(500).json({ error: 'Failed to check connection status' });
    }
});

// Course routes
app.get('/api/courses', async (req, res) => {
    try {
        const { query = '', category = '', level = '', page = 0 } = req.query;
        const { courses, hasMore } = await udemyService.searchCourses(query, parseInt(page));
        res.json({ courses, hasMore });
    } catch (error) {
        console.error('Error fetching courses:', error);
        res.status(500).json({ 
            error: 'Failed to fetch courses',
            message: error.message
        });
    }
});

app.get('/api/courses/:id', async (req, res) => {
    try {
        const course = await udemyService.getCourseDetails(req.params.id);
        res.json(course);
    } catch (error) {
        console.error('Error fetching course details:', error);
        res.status(500).json({ 
            error: 'Failed to fetch course details',
            message: error.message
        });
    }
});

// Job routes
app.get('/api/jobs', async (req, res) => {
    try {
        const { query = '', page = 0, pageSize = 12, category = '', location = '' } = req.query;
        console.log('Jobs API called with params:', { query, page, pageSize, category, location });
        
        const result = await jobService.searchJobs(query, parseInt(page), parseInt(pageSize), category, location);
        console.log('Jobs API result:', {
            jobsCount: result.jobs.length,
            hasMore: result.hasMore,
            total: result.total
        });
        
        res.json(result);
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

app.get('/api/jobs/:id', async (req, res) => {
    try {
        const job = await jobService.getJobDetails(req.params.id);
        res.json(job);
    } catch (error) {
        console.error('Error fetching job details:', error);
        res.status(500).json({ error: 'Failed to fetch job details' });
    }
});

// Start server
const PORT = process.env.PORT;
http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});