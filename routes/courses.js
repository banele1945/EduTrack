const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { isAuthenticated } = require('../middleware/auth');
const { MeiliSearch } = require('meilisearch');
const { synonymToCanonical } = require('../utils/tagVocabulary');

let meiliClient;
try {
  meiliClient = new MeiliSearch({ host: 'http://127.0.0.1:7700' });
} catch (e) {
  meiliClient = null;
}

// Get featured courses (3 at a time)
router.get('/featured', isAuthenticated, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 0;
        const limit = 3;
        const offset = page * limit;

        const [courses] = await pool.query(
            `SELECT * FROM courses 
            ORDER BY rating DESC 
            LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        // Check if there are more courses
        const [totalCount] = await pool.query('SELECT COUNT(*) as count FROM courses');
        const hasMore = offset + courses.length < totalCount[0].count;

        res.json({
            courses,
            hasMore
        });
    } catch (error) {
        console.error('Error fetching featured courses:', error);
        res.status(500).json({ error: 'Failed to fetch featured courses' });
    }
});

// Get all courses with pagination and filters
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 0;
        const limit = parseInt(req.query.limit) || 12;
        const offset = page * limit;
        const search = req.query.search || '';
        const category = req.query.category || '';
        const showAll = req.query.all === 'true';
        const user = req.session.user;

        // Try Meilisearch first
        if (meiliClient) {
          try {
            const index = meiliClient.index('courses');
            let filterArr = [];
            let tags = [];
            if (!showAll && user) {
              if (user.interests) tags.push(...user.interests.split(',').map(i => i.trim().toLowerCase()).filter(Boolean));
              if (user.department) tags.push(user.department.trim().toLowerCase());
              if (user.institution) tags.push(user.institution.trim().toLowerCase());
            }
            // Map user tags to canonical tags (lowercased)
            const canonicalTags = Array.from(new Set(tags.map(t => synonymToCanonical[t.toLowerCase().trim()] || t.toLowerCase().trim())));
            if (!showAll && canonicalTags.length) {
              filterArr.push(canonicalTags.map(tag => `tags = "${tag.replace(/"/g, '\"')}"`).join(' OR '));
            }
            if (category) filterArr.push(`category = '${category.replace(/'/g, "\\'")}'`);
            const filter = filterArr.length ? filterArr.join(' AND ') : undefined;
            console.log('Meilisearch filter:', filter);
            console.log('[DEBUG] Canonical tags for filtering:', canonicalTags);
            let result = await index.search(search, {
              filter,
              limit: 100, // fetch more for in-memory sorting
              offset: 0
            });
            console.log('[DEBUG] First 3 returned courses (tags):', result.hits.slice(0, 3).map(hit => ({id: hit.id, tags: hit.tags})));
            // In-memory sort: boost by number of matched canonical tags
            if (!showAll && canonicalTags.length) {
              result.hits = result.hits.map(hit => ({
                ...hit,
                _matchCount: Array.isArray(hit.tags) ? hit.tags.filter(t => canonicalTags.includes(t)).length : 0
              }))
              .sort((a, b) => b._matchCount - a._matchCount)
              .slice(offset, offset + limit);
            } else {
              result.hits = result.hits.slice(offset, offset + limit);
            }
            return res.json({
              courses: result.hits,
              hasMore: (offset + result.hits.length) < result.estimatedTotalHits,
              total: result.estimatedTotalHits
            });
          } catch (err) {
            console.error('Meilisearch error (courses):', err.message);
            // Fallback to MySQL below
          }
        }
        // ... fallback MySQL logic ...
        let query = 'SELECT * FROM courses WHERE 1=1';
        const params = [];
        if (search) {
            query += ' AND (title LIKE ? OR desc_text LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }
        // Robust Personalization logic using tags
        if (!showAll && user) {
            let personalWhere = [];
            let personalParams = [];
            if (user.interests) {
                const interestsArr = user.interests.split(',').map(i => i.trim().toLowerCase()).filter(Boolean);
                if (interestsArr.length) {
                    personalWhere.push('(' + interestsArr.map(() => 'FIND_IN_SET(?, tags)').join(' OR ') + ')');
                    interestsArr.forEach(i => { personalParams.push(i); });
                }
            }
            if (user.department) {
                personalWhere.push('FIND_IN_SET(?, tags)');
                personalParams.push(user.department.trim().toLowerCase());
            }
            if (user.institution) {
                personalWhere.push('FIND_IN_SET(?, tags)');
                personalParams.push(user.institution.trim().toLowerCase());
            }
            if (personalWhere.length) {
                let personalQuery = query + ' AND (' + personalWhere.join(' OR ') + ') ORDER BY rating DESC LIMIT ? OFFSET ?';
                let allParams = params.concat(personalParams, [limit, offset]);
                const [personalizedCourses] = await pool.query(personalQuery, allParams);
                // Get total count for personalized
                let countQuery = 'SELECT COUNT(*) as count FROM courses WHERE 1=1';
                let countParams = params.concat(personalParams);
                if (personalWhere.length) {
                    countQuery += ' AND (' + personalWhere.join(' OR ') + ')';
                }
                const [[{ count: total }]] = await pool.query(countQuery, countParams);
                const hasMore = offset + personalizedCourses.length < total;
                return res.json({ courses: personalizedCourses, hasMore, total });
            } else {
                // No personalization fields set, return empty
                return res.json({ courses: [], hasMore: false, total: 0 });
            }
        }
        // Default: show all
        query += ' ORDER BY rating DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        const [courses] = await pool.query(query, params);
        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as count FROM courses WHERE 1=1';
        const countParams = [];
        if (search) {
            countQuery += ' AND (title LIKE ? OR desc_text LIKE ?)';
            countParams.push(`%${search}%`, `%${search}%`);
        }
        if (category) {
            countQuery += ' AND category = ?';
            countParams.push(category);
        }
        const [totalCount] = await pool.query(countQuery, countParams);
        const hasMore = offset + courses.length < totalCount[0].count;
        const total = totalCount[0].count;
        res.json({ courses, hasMore, total });
    } catch (error) {
        console.error('Error fetching courses:', error);
        res.status(500).json({ error: 'Failed to fetch courses' });
    }
});

module.exports = router;