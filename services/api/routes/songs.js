const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { calculateRatingChange } = require('../services/rating');

// Debug middleware
router.use((req, res, next) => {
    console.log('Songs Router:', req.method, req.url);
    next();
});

// GET /api/v1/songs - Get all songs with sorting (alphabetical by default)
router.get('/', async (req, res) => {
    try {
        const {
            page,
            limit,
            search,
            sortBy = 'title',    // Default sort by title
            sortOrder = 'asc'    // Default order is ascending
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

        let songsQuery = req.app.locals.models.Song
            .find(query)
            .select({
                _id: 0,
                track_id: 1,
                title: 1,
                artists: 1,
                album: 1,
                album_art: 1,
                duration_ms: 1,
                rating: 1,
                total_plays: 1
            })
            .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 });

        // Apply pagination only if both page and limit are provided
        if (page && limit) {
            songsQuery = songsQuery
                .skip((parseInt(page) - 1) * parseInt(limit))
                .limit(parseInt(limit));
        }

        const songs = await songsQuery.lean();
        const total = await req.app.locals.models.Song.countDocuments(query);

        // Transform duration to minutes and seconds
        const transformedSongs = songs.map(song => ({
            ...song,
            duration: {
                minutes: Math.floor(song.duration_ms / 60000),
                seconds: Math.floor((song.duration_ms % 60000) / 1000)
            }
        }));

        const response = {
            songs: transformedSongs,
            total
        };

        // Include pagination info only if pagination was applied
        if (page && limit) {
            response.pagination = {
                page: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                limit: parseInt(limit)
            };
        }

        res.json(response);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/songs/latest - Get latest added songs
router.get('/latest', async (req, res) => {
    try {
        const {
            page,
            limit,
            search
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

        let songsQuery = req.app.locals.models.Song
            .find(query)
            .select({
                _id: 0,
                track_id: 1,
                title: 1,
                artists: 1,
                album: 1,
                album_art: 1,
                duration_ms: 1,
                rating: 1,
                total_plays: 1,
                added_at: 1
            })
            .sort({ added_at: -1 });

        // Apply pagination only if both page and limit are provided
        if (page && limit) {
            songsQuery = songsQuery
                .skip((parseInt(page) - 1) * parseInt(limit))
                .limit(parseInt(limit));
        }

        const songs = await songsQuery.lean();
        const total = await req.app.locals.models.Song.countDocuments(query);

        // Transform duration to minutes and seconds
        const transformedSongs = songs.map(song => ({
            ...song,
            duration: {
                minutes: Math.floor(song.duration_ms / 60000),
                seconds: Math.floor((song.duration_ms % 60000) / 1000)
            }
        }));

        const response = {
            songs: transformedSongs,
            total
        };

        // Include pagination info only if pagination was applied
        if (page && limit) {
            response.pagination = {
                page: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                limit: parseInt(limit)
            };
        }

        res.json(response);
    } catch (error) {
        console.error('Latest songs error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/songs/random - Get random songs with smart recommendations
router.get('/random', async (req, res) => {
    try {
        const { 
            limit = 20,
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
                const playRatio = ratingHistory.filter(h => h.event_type === 'play').length / (ratingHistory.length || 1);
                const skipRatio = ratingHistory.filter(h => h.event_type === 'skip').length / (ratingHistory.length || 1);
                
                // Match songs with similar characteristics based on user behavior
                matchStage.$and = [
                    { track_id: { $ne: fromSongId } }
                ];

                if (playRatio > 0.7) {
                    // If song has high play ratio, prioritize same genre/artist
                    matchStage.$and.push({
                        $or: [
                            { genres: { $in: baseSong.genres || [] } },
                            { artists: { $in: baseSong.artists || [] } }
                        ]
                    });
                } else if (skipRatio > 0.3) {
                    // If song gets skipped often, try different genres but similar audio features
                    matchStage.$and.push({
                        $and: [
                            { genres: { $nin: baseSong.genres || [] } },
                            { 
                                rating: { 
                                    $gte: baseSong.rating - 300,
                                    $lte: baseSong.rating + 300
                                }
                            }
                        ]
                    });
                }
            }
        }

        // Apply genre filter if specified
        if (genre) {
            if (!matchStage.$and) matchStage.$and = [];
            matchStage.$and.push({ genres: { $regex: genre, $options: 'i' } });
        }

        // Exclude specific songs
        if (excludeIds.length > 0) {
            const excludeArray = Array.isArray(excludeIds) ? excludeIds : [excludeIds];
            if (!matchStage.$and) matchStage.$and = [];
            matchStage.$and.push({ track_id: { $nin: excludeArray } });
        }

        // If no conditions are set, remove empty $and array
        if (matchStage.$and && matchStage.$and.length === 0) {
            delete matchStage.$and;
        }

        console.log('Match stage:', JSON.stringify(matchStage, null, 2));

        // Scoring based on rating system and confidence with increased randomness
        const scoreStage = {
            $addFields: {
                score: {
                    $add: [
                        // Rating weight (20%)
                        { 
                            $multiply: [
                                { $divide: [{ $ifNull: ["$rating", 1500] }, 2000] },
                                { $divide: [{ $ifNull: ["$rating_confidence", 1] }, { $add: [{ $ifNull: ["$rating_confidence", 1] }, 50] }] },
                                0.2
                            ]
                        },
                        // Play/Skip ratio weight (20%)
                        {
                            $multiply: [
                                {
                                    $divide: [
                                        { $ifNull: ["$total_plays", 0] },
                                        { $add: [{ $ifNull: ["$total_plays", 0] }, { $ifNull: ["$skip_count", 0] }, 1] }
                                    ]
                                },
                                0.2
                            ]
                        },
                        // Random factor for discovery (60%) - Increased from 50%
                        { $multiply: [{ $rand: {} }, 0.6] }
                    ]
                }
            }
        };

        const songs = await req.app.locals.models.Song.aggregate([
            { $match: matchStage },
            scoreStage,
            { $sort: { score: -1 } },
            { $limit: parseInt(limit) },
            // Project only necessary fields
            {
                $project: {
                    _id: 0,
                    track_id: 1,
                    title: 1,
                    artists: 1,
                    album: 1,
                    album_art: 1,
                    duration_ms: 1,
                    rating: 1,
                    total_plays: 1
                }
            }
        ]);

        if (!songs || songs.length === 0) {
            // If no songs found with criteria, try without any matching
            const fallbackSongs = await req.app.locals.models.Song.aggregate([
                scoreStage,
                { $sort: { score: -1 } },
                { $limit: parseInt(limit) },
                // Project only necessary fields
                {
                    $project: {
                        _id: 0,
                        track_id: 1,
                        title: 1,
                        artists: 1,
                        album: 1,
                        album_art: 1,
                        duration_ms: 1,
                        rating: 1,
                        total_plays: 1
                    }
                }
            ]);
            
            if (fallbackSongs && fallbackSongs.length > 0) {
                // Transform duration for fallback songs
                const transformedSongs = fallbackSongs.map(song => ({
                    ...song,
                    duration: {
                        minutes: Math.floor(song.duration_ms / 60000),
                        seconds: Math.floor((song.duration_ms % 60000) / 1000)
                    }
                }));

                return res.json({ 
                    songs: transformedSongs,
                    fallback: true
                });
            }
        }

        // Transform duration for matched songs
        const transformedSongs = songs.map(song => ({
            ...song,
            duration: {
                minutes: Math.floor(song.duration_ms / 60000),
                seconds: Math.floor((song.duration_ms % 60000) / 1000)
            }
        }));

        res.json({ 
            songs: transformedSongs,
            basedOn: baseSong ? {
                track_id: baseSong.track_id,
                title: baseSong.title,
                artists: baseSong.artists,
                rating: baseSong.rating
            } : null
        });
    } catch (error) {
        console.error('Random songs error:', error);
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

module.exports = router;
