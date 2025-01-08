const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { calculateRatingChange } = require('../services/rating');

// Debug middleware
router.use((req, res, next) => {
    console.log('Songs Router:', req.method, req.url);
    next();
});

// GET /api/v1/songs - Get all songs with pagination and sorting
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search,
            sortBy = 'added_at',
            sortOrder = 'desc'
        } = req.query;

        let query = {};
        if (search) {
            query = {
                $or: [
                    { title: { $regex: search, $options: 'i' } },
                    { artists: { $regex: search, $options: 'i' } },
                    { album: { $regex: search, $options: 'i' } }
                ]
            };
        }

        const songs = await req.app.locals.models.Song
            .find(query)
            .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .lean();

        const total = await req.app.locals.models.Song.countDocuments(query);

        res.json({
            songs,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rating History - separate route
router.get('/rating/history/:trackId', async (req, res) => {
    console.log('Getting rating history for:', req.params.trackId);
    try {
        const history = await req.app.locals.models.RatingHistory
            .find({ song_id: req.params.trackId })
            .sort({ created_at: -1 })
            .limit(50)
            .lean();

        console.log('Found history entries:', history.length);
        res.json(history);
    } catch (error) {
        console.error('Get rating history error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rating Stats - separate route
router.get('/rating/stats/:trackId', async (req, res) => {
    console.log('Getting rating stats for:', req.params.trackId);
    try {
        const song = await req.app.locals.models.Song
            .findOne({ track_id: req.params.trackId })
            .lean();

        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const history = await req.app.locals.models.RatingHistory
            .find({ song_id: req.params.trackId })
            .sort({ created_at: -1 });

        const stats = {
            current_rating: song.rating,
            confidence: song.rating_confidence,
            total_changes: history.length,
            biggest_gain: history.length > 0 ? Math.max(...history.map(h => h.rating_change)) : 0,
            biggest_loss: history.length > 0 ? Math.min(...history.map(h => h.rating_change)) : 0,
            events: {
                plays: history.filter(h => h.event_type === 'play').length,
                skips: history.filter(h => h.event_type === 'skip').length,
                downloads: history.filter(h => h.event_type === 'download').length
            }
        };

        res.json(stats);
    } catch (error) {
        console.error('Get rating stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/v1/songs/:trackId/play - Track song play
router.post('/:trackId/play', async (req, res) => {
    try {
        const song = await req.app.locals.models.Song.findOne({ 
            track_id: req.params.trackId 
        });

        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const ratingChange = calculateRatingChange(
            song.rating, 
            song.rating_confidence, 
            'play'
        );

        // Create rating history entry
        await new req.app.locals.models.RatingHistory({
            song_id: song.track_id,
            old_rating: song.rating,
            new_rating: song.rating + ratingChange,
            event_type: 'play',
            rating_change: ratingChange,
            confidence: song.rating_confidence
        }).save();

        song.total_plays += 1;
        song.rating += ratingChange;
        song.rating_confidence += 1;
        
        await song.save();
        
        res.json({ 
            success: true, 
            rating: song.rating,
            total_plays: song.total_plays 
        });
    } catch (error) {
        console.error('Track play error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/v1/songs/:trackId/skip - Track song skip
router.post('/:trackId/skip', async (req, res) => {
    try {
        const song = await req.app.locals.models.Song.findOne({ 
            track_id: req.params.trackId 
        });

        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const ratingChange = calculateRatingChange(
            song.rating, 
            song.rating_confidence, 
            'skip'
        );

        // Create rating history entry
        await new req.app.locals.models.RatingHistory({
            song_id: song.track_id,
            old_rating: song.rating,
            new_rating: song.rating + ratingChange,
            event_type: 'skip',
            rating_change: ratingChange,
            confidence: song.rating_confidence
        }).save();

        song.skip_count += 1;
        song.rating += ratingChange;
        song.rating_confidence += 1;
        
        await song.save();
        
        res.json({ 
            success: true, 
            rating: song.rating,
            skip_count: song.skip_count 
        });
    } catch (error) {
        console.error('Track skip error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/v1/songs/:trackId/download - Track song download
router.post('/:trackId/download', async (req, res) => {
    try {
        const song = await req.app.locals.models.Song.findOne({ 
            track_id: req.params.trackId 
        });

        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const ratingChange = calculateRatingChange(
            song.rating, 
            song.rating_confidence, 
            'download'
        );

        // Create rating history entry
        await new req.app.locals.models.RatingHistory({
            song_id: song.track_id,
            old_rating: song.rating,
            new_rating: song.rating + ratingChange,
            event_type: 'download',
            rating_change: ratingChange,
            confidence: song.rating_confidence
        }).save();

        song.download_count += 1;
        song.rating += ratingChange;
        song.rating_confidence += 1;
        
        await song.save();
        
        res.json({ 
            success: true, 
            rating: song.rating,
            download_count: song.download_count 
        });
    } catch (error) {
        console.error('Track download error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/songs/:trackId - Get song details (should be last)
router.get('/:trackId', async (req, res) => {
    try {
        const song = await req.app.locals.models.Song
            .findOne({ track_id: req.params.trackId })
            .lean();

        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }
        res.json(song);
    } catch (error) {
        console.error('Get song error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/songs/random - Get random songs with smart recommendations
router.get('/random', async (req, res) => {
    try {
        const { 
            limit = 1,
            genre,
            fromSongId,
            excludeIds = []
        } = req.query;

        let matchStage = {};
        let baseSong = null;
        
        // If fromSongId is provided, get that song's details and its rating history
        if (fromSongId) {
            baseSong = await req.app.locals.models.Song
                .findOne({ track_id: fromSongId })
                .lean();
            
            if (baseSong) {
                // Get rating history to analyze user interaction pattern
                const ratingHistory = await req.app.locals.models.RatingHistory
                    .find({ song_id: fromSongId })
                    .sort({ created_at: -1 })
                    .limit(10)
                    .lean();

                // Calculate interaction scores
                const playRatio = ratingHistory.filter(h => h.event_type === 'play').length / ratingHistory.length;
                const skipRatio = ratingHistory.filter(h => h.event_type === 'skip').length / ratingHistory.length;
                
                // Match songs with similar characteristics based on user behavior
                matchStage = {
                    $and: [
                        { track_id: { $ne: fromSongId } },
                        { 
                            $or: [
                                // If song has high play ratio, prioritize same genre/artist
                                ...(playRatio > 0.7 ? [
                                    { genres: { $in: baseSong.genres || [] } },
                                    { artists: { $in: baseSong.artists || [] } }
                                ] : []),
                                // If song gets skipped often, try different genres but similar audio features
                                ...(skipRatio > 0.3 ? [
                                    { genres: { $nin: baseSong.genres || [] } },
                                    { 
                                        rating: { 
                                            $gte: baseSong.rating - 200,
                                            $lte: baseSong.rating + 200
                                        }
                                    }
                                ] : [])
                            ]
                        }
                    ]
                };
            }
        }

        // Apply genre filter if specified
        if (genre) {
            matchStage.genres = { $regex: genre, $options: 'i' };
        }

        // Exclude specific songs
        if (excludeIds.length > 0) {
            const excludeArray = Array.isArray(excludeIds) ? excludeIds : [excludeIds];
            matchStage.track_id = { $nin: excludeArray };
        }

        // Scoring based on rating system and confidence
        const scoreStage = {
            $addFields: {
                score: {
                    $add: [
                        // Rating weight (25%)
                        { 
                            $multiply: [
                                { $divide: ["$rating", 2000] },
                                { $divide: ["$rating_confidence", { $add: ["$rating_confidence", 50] }] }, // Weight by confidence
                                0.25
                            ]
                        },
                        // Play/Skip ratio weight (25%)
                        {
                            $multiply: [
                                {
                                    $divide: [
                                        "$total_plays",
                                        { $add: ["$total_plays", "$skip_count", 1] }
                                    ]
                                },
                                0.25
                            ]
                        },
                        // Random factor for discovery (50%)
                        { $multiply: [{ $rand: {} }, 0.5] }
                    ]
                }
            }
        };

        const songs = await req.app.locals.models.Song.aggregate([
            { $match: matchStage },
            scoreStage,
            { $sort: { score: -1 } },
            { $limit: parseInt(limit) }
        ]);

        res.json({ 
            songs,
            basedOn: baseSong ? {
                track_id: baseSong.track_id,
                title: baseSong.title,
                artists: baseSong.artists,
                rating: baseSong.rating,
                confidence: baseSong.rating_confidence
            } : null
        });
    } catch (error) {
        console.error('Random songs error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
