require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const path = require('path');
const db = require('./config/database');
const messagesRouter = require('./routes/messages');
const profileRouter = require('./routes/profile');
const apiRouter = require('./routes/api');
const homeRouter = require('./routes/home');

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
const sessionStore = new MySQLStore({
    expiration: 86400000, // 24 hours
    createDatabaseTable: true
}, db);

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 86400000 // 24 hours
    }
}));

// Store io instance in app for use in routes
app.set('io', io);

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join conversation room
    socket.on('joinConversation', (conversationId) => {
        socket.join(conversationId);
        console.log(`User ${socket.id} joined conversation ${conversationId}`);
    });

    // Leave conversation room
    socket.on('leaveConversation', (conversationId) => {
        socket.leave(conversationId);
        console.log(`User ${socket.id} left conversation ${conversationId}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Routes
app.use('/messages', messagesRouter);
app.use('/profile', profileRouter);
app.use('/api', apiRouter);
app.use('/', homeRouter);

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

        const [users] = await db.query(
            'SELECT ID, Full_Name, Email, avatar FROM Stundents WHERE Full_Name LIKE ? OR Email LIKE ? LIMIT 10',
            [`%${q}%`, `%${q}%`]
        );

        res.json(users);
    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ error: 'Failed to search users' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT;
http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 