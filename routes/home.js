const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');

// Home page
router.get('/', isAuthenticated, (req, res) => {
    res.render('home', { 
        user: req.session.user,
        title: 'Home - EduTrack'
    });
});

module.exports = router;
