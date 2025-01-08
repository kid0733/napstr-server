const express = require('express');
const router = express.Router();

// Debug middleware
router.use((req, res, next) => {
    console.log('Albums Router:', req.method, req.url);
    next();
});

// GET /api/v1/albums/random - Get 10 random albums
router.get('/random', async (req, res) => {
    try {
        const albums = await req.app.locals.models.Album
            .aggregate([
                { $sample: { size: 10 } }
            ]);

        res.json({ albums });
    } catch (error) {
        console.error('Random albums error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/albums - Get all albums with pagination and sorting
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search,
            sortBy = 'added_at',
            sortOrder = 'desc',
            featured
        } = req.query;

        let query = {};
        if (search) {
            query = {
                $or: [
                    { title: { $regex: search, $options: 'i' } },
                    { artists: { $regex: search, $options: 'i' } }
                ]
            };
        }
        
        if (featured === 'true') {
            query.featured = true;
        }

        const albums = await req.app.locals.models.Album
            .find(query)
            .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .lean();

        const total = await req.app.locals.models.Album.countDocuments(query);

        res.json({
            albums,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Album search error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/albums/featured - Get featured albums
router.get('/featured', async (req, res) => {
    try {
        const albums = await req.app.locals.models.Album
            .find({ featured: true })
            .sort({ added_at: -1 })
            .lean();

        res.json({ albums });
    } catch (error) {
        console.error('Featured albums error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/albums/:albumId - Get album with its songs
router.get('/:albumId', async (req, res) => {
    try {
        const album = await req.app.locals.models.Album
            .findOne({ album_id: req.params.albumId })
            .lean();

        if (!album) {
            return res.status(404).json({ error: 'Album not found' });
        }

        // Get all songs from this album
        const songs = await req.app.locals.models.Song
            .find({ album: album.title })
            .sort({ track_number: 1 })
            .lean();

        res.json({
            ...album,
            songs
        });
    } catch (error) {
        console.error('Get album error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router; 