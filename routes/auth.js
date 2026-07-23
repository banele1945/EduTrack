const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/db');

// Root route - redirect to login
router.get('/', (req, res) => {
    res.redirect('/register');
});

// Login page
router.get('/login', (req, res) => {
    res.sendFile('login.html', { root: './views' });
});

// Register page
router.get('/register', (req, res) => {
    res.sendFile('register.html', { root: './views' });
});

// Login handler
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    console.log('Login attempt for email:', email);

    try {
        const [users] = await db.execute(
            'SELECT * FROM students WHERE Email = ?',
            [email]
        );
        console.log('Found users:', users.length);

        if (users.length === 0) {
            console.log('No user found with email:', email);
            return res.send(`
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
                        <p>Invalid email or password. Please try again.</p>
                        <a href="/login" class="button">Back to Login</a>
                    </div>
                </body>
                </html>
            `);
        }

        const user = users[0];
        console.log('Found user:', user.Email);
        console.log('Stored hashed password:', user.Password);
        console.log('Attempting to compare passwords...');

        if (!user.Password) {
            console.log('No password found for user');
            return res.send(`
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
                        <p>There was an error with your account. Please contact support.</p>
                        <a href="/login" class="button">Back to Login</a>
                    </div>
                </body>
                </html>
            `);
        }

        const validPassword = await bcrypt.compare(password, user.Password);
        console.log('Password comparison result:', validPassword);

        if (!validPassword) {
            console.log('Invalid password for user:', email);
            return res.send(`
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
                        <p>Invalid email or password. Please try again.</p>
                        <a href="/login" class="button">Back to Login</a>
                    </div>
                </body>
                </html>
            `);
        }

        console.log('Login successful for user:', email);
        // TODO: Implement session management
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Login Successful - EduTrack</title>
                <link rel="stylesheet" href="/css/style.css">
                <meta http-equiv="refresh" content="0;url=/home">
            </head>
            <body>
                <div class="register-container">
                    <h1>Login Successful!</h1>
                    <p>Redirecting to your dashboard...</p>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('Login error:', err);
        res.send(`
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
                    <p>Sorry, there was an error processing your login. Please try again.</p>
                    <a href="/login" class="button">Back to Login</a>
                </div>
            </body>
            </html>
        `);
    }
});

module.exports = router;
