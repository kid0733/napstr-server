const express = require('express');
const router = express.Router();

// Debug middleware
router.use((req, res, next) => {
    console.log('Albums Router:', req.method, req.url);
    next();
});

// GET /api/v1/albums - Get all albums with pagination and sorting
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search,
            sortBy = 'added_at',
            sortOrder = 'desc'
        } = req.query;

        let matchStage = {};
        if (search) {
            matchStage = {
                $or: [
                    { album: { $regex: search, $options: 'i' } },
                    { artists: { $regex: search, $options: 'i' } }
                ]
            };
        }

        const albums = await req.app.locals.models.Song.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: '$album_id',
                    title: { $first: '$album' },
                    artists: { $first: '$artists' },
                    album_art: { $first: '$album_art' },
                    release_date: { $first: '$release_date' },
                    total_tracks: { $first: '$total_tracks' },
                    added_at: { $first: '$added_at' }
                }
            },
            { $sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 } },
            { $skip: (parseInt(page) - 1) * parseInt(limit) },
            { $limit: parseInt(limit) }
        ]);

        const total = await req.app.locals.models.Song.aggregate([
            { $match: matchStage },
            { $group: { _id: '$album_id' } },
            { $count: 'total' }
        ]);

        res.json({
            albums,
            pagination: {
                total: total.length > 0 ? total[0].total : 0,
                page: parseInt(page),
                pages: Math.ceil((total.length > 0 ? total[0].total : 0) / parseInt(limit)),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Album search error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/albums/random - Get 10 random albums
router.get('/random', async (req, res) => {
    try {
        const albums = await req.app.locals.models.Song.aggregate([
            {
                $group: {
                    _id: '$album_id',
                    title: { $first: '$album' },
                    artists: { $first: '$artists' },
                    album_art: { $first: '$album_art' },
                    release_date: { $first: '$release_date' },
                    total_tracks: { $first: '$total_tracks' }
                }
            },
            { $sample: { size: 10 } }
        ]);

        res.json({ albums });
    } catch (error) {
        console.error('Random albums error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/albums/:albumId - Get album with its songs
router.get('/:albumId', async (req, res) => {
    try {
        const albumSongs = await req.app.locals.models.Song
            .find({ album_id: req.params.albumId })
            .sort({ track_number: 1 })
            .lean();

        if (!albumSongs || albumSongs.length === 0) {
            return res.status(404).json({ error: 'Album not found' });
        }

        // Construct album info from the first song
        const firstSong = albumSongs[0];
        const album = {
            album_id: firstSong.album_id,
            title: firstSong.album,
            artists: firstSong.artists,
            album_art: firstSong.album_art,
            release_date: firstSong.release_date,
            total_tracks: firstSong.total_tracks,
            songs: albumSongs
        };

        res.json(album);
    } catch (error) {
        console.error('Get album error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router; 