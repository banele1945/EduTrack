const express = require('express');
const router = express.Router();

// Friends page
router.get('/', (req, res) => {
    res.sendFile('friends.html', { root: './views' });
});

module.exports = router;
