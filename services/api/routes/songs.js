const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { calculateRatingChange } = require('../services/rating');
const auth = require('../middleware/auth');
const { Song } = require('../models/song');
const { RatingHistory } = require('../models/rating-history');
const { UserPlayHistory } = require('../models/play-history');

// Debug middleware
router.use((req, res, next) => {
    console.log('Songs Router:', req.method, req.url);
    next();
});

// GET /api/v1/songs/recent - Get 20 most recently added songs
router.get('/recent', async (req, res) => {
    try {
        const songs = await req.app.locals.models.Song
            .find()
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
            .sort({ added_at: -1 })
            .limit(20)
            .lean();

        res.json({
            songs,
            total: songs.length
        });
    } catch (error) {
        console.error('Get recent songs error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch recent songs',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
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
                    .find({ track_id: fromSongId })
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

// GET /api/v1/songs/history - Get user's listening history
router.get('/history', auth, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            month,  // Optional YYYY-MM format
            includeSkipped = false
        } = req.query;

        const skip = (page - 1) * limit;
        const query = { userId: req.user._id };
        
        if (month) {
            query.yearMonth = month;
        }

        // Get user history entries
        const [histories, totalMonths] = await Promise.all([
            req.app.locals.models.UserPlayHistory
                .find(query)
                .sort({ yearMonth: -1 })
                .lean(),
            req.app.locals.models.UserPlayHistory
                .countDocuments({ userId: req.user._id })
        ]);

        // Flatten and sort all plays
        let allPlays = histories.reduce((acc, history) => {
            const plays = includeSkipped 
                ? history.plays 
                : history.plays.filter(play => !play.skipped);
            return [...acc, ...plays];
        }, []);

        // Sort by playedAt descending
        allPlays.sort((a, b) => b.playedAt - a.playedAt);

        // Paginate
        const paginatedPlays = allPlays.slice(skip, skip + limit);

        // Get song details for the paginated plays
        const songIds = [...new Set(paginatedPlays.map(play => play.songId))];
        const songs = await req.app.locals.models.Song
            .find({ track_id: { $in: songIds } })
            .select('track_id title artists album album_art duration_ms')
            .lean();

        // Combine play history with song details
        const enrichedPlays = paginatedPlays.map(play => {
            const song = songs.find(s => s.track_id === play.songId);
            return {
                ...play,
                song
            };
        });

        res.json({
            history: enrichedPlays,
            pagination: {
                current: page,
                pages: Math.ceil(allPlays.length / limit),
                total: allPlays.length,
                totalMonths
            }
        });
    } catch (error) {
        console.error('Get listening history error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/songs/stats - Get user's listening stats
router.get('/stats', auth, async (req, res) => {
    try {
        const { timeframe = 'all' } = req.query; // all, month, week
        const now = new Date();
        let startDate;

        switch (timeframe) {
            case 'week':
                startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            default:
                startDate = new Date(0); // Beginning of time
        }

        const yearMonth = startDate.toISOString().slice(0, 7);
        
        // Get user history entries
        const histories = await req.app.locals.models.UserPlayHistory
            .find({
                userId: req.user._id,
                yearMonth: { $gte: yearMonth }
            })
            .lean();

        // Flatten all plays within the timeframe
        const plays = histories.reduce((acc, history) => {
            const validPlays = history.plays.filter(play => 
                new Date(play.playedAt) >= startDate
            );
            return [...acc, ...validPlays];
        }, []);

        // Calculate stats
        const totalPlays = plays.length;
        const completedPlays = plays.filter(play => !play.skipped).length;
        const skippedPlays = plays.filter(play => play.skipped).length;
        const totalDuration = plays.reduce((sum, play) => sum + play.duration, 0);
        const avgCompletionRate = plays.reduce((sum, play) => sum + play.completionRate, 0) / totalPlays || 0;

        // Get most played songs
        const playCountByTrack = plays.reduce((acc, play) => {
            acc[play.songId] = (acc[play.songId] || 0) + 1;
            return acc;
        }, {});

        const topTrackIds = Object.entries(playCountByTrack)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([trackId]) => trackId);

        const topTracks = await req.app.locals.models.Song
            .find({ track_id: { $in: topTrackIds } })
            .select('track_id title artists album album_art')
            .lean();

        // Combine play counts with track details
        const mostPlayed = topTracks.map(track => ({
            ...track,
            playCount: playCountByTrack[track.track_id]
        })).sort((a, b) => b.playCount - a.playCount);

        res.json({
            timeframe,
            stats: {
                totalPlays,
                completedPlays,
                skippedPlays,
                totalDuration,
                avgCompletionRate,
                mostPlayed
            }
        });
    } catch (error) {
        console.error('Get listening stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rating History - separate route
router.get('/rating/history/:trackId', async (req, res) => {
    console.log('Getting rating history for:', req.params.trackId);
    try {
        const history = await req.app.locals.models.RatingHistory
            .find({ track_id: req.params.trackId })
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
            .find({ track_id: req.params.trackId })
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
router.post('/:trackId/play', auth, async (req, res) => {
    console.log('Starting play tracking for:', req.params.trackId);
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        console.log('Finding song in database...');
        const song = await req.app.locals.models.Song.findOne({ 
            track_id: req.params.trackId 
        }).session(session);

        if (!song) {
            console.log('Song not found:', req.params.trackId);
            await session.abortTransaction();
            return res.status(404).json({ error: 'Song not found' });
        }
        console.log('Found song:', { title: song.title, current_rating: song.rating });

        console.log('Calculating rating change...');
        const ratingChange = calculateRatingChange(
            song.rating, 
            song.rating_confidence, 
            'play'
        );
        console.log('Rating change calculated:', ratingChange);

        // Create rating history entry
        console.log('Creating rating history entry...');
        await new req.app.locals.models.RatingHistory({
            track_id: song.track_id,
            old_rating: song.rating,
            new_rating: song.rating + ratingChange,
            event_type: 'play',
            rating_change: ratingChange,
            confidence: song.rating_confidence
        }).save({ session });
        console.log('Rating history entry created');

        // Update global play stats
        console.log('Updating song stats...');
        song.total_plays += 1;
        song.rating += ratingChange;
        song.rating_confidence += 1;
        
        await song.save({ session });
        console.log('Song stats updated');

        // Get or create user play history for current month
        const yearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
        console.log('Finding user play history for:', yearMonth);
        let userHistory = await req.app.locals.models.UserPlayHistory.findOne({
            userId: req.user._id,
            yearMonth
        }).session(session);

        if (!userHistory) {
            console.log('Creating new user play history...');
            userHistory = new req.app.locals.models.UserPlayHistory({
                userId: req.user._id,
                yearMonth,
                plays: []
            });
        }

        // Add play to user history
        console.log('Adding play to user history...');
        userHistory.plays.push({
            songId: song.track_id,
            playedAt: new Date(),
            duration: req.body.duration || song.duration_ms,
            completionRate: req.body.completionRate || 100,
            skipped: false,
            context: req.body.context || {}
        });

        await userHistory.save({ session });
        console.log('User history saved');

        console.log('Committing transaction...');
        await session.commitTransaction();
        console.log('Transaction committed successfully');
        
        res.json({ 
            success: true, 
            rating: song.rating,
            total_plays: song.total_plays 
        });
    } catch (error) {
        console.error('Track play error:', error);
        console.error('Error stack:', error.stack);
        await session.abortTransaction();
        console.log('Transaction aborted due to error');
        res.status(500).json({ error: error.message });
    } finally {
        session.endSession();
        console.log('Session ended');
    }
});

// POST /api/v1/songs/:trackId/skip - Track song skip
router.post('/:trackId/skip', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const song = await req.app.locals.models.Song.findOne({ 
            track_id: req.params.trackId 
        }).session(session);

        if (!song) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Song not found' });
        }

        const ratingChange = calculateRatingChange(
            song.rating, 
            song.rating_confidence, 
            'skip'
        );

        // Create rating history entry
        await new req.app.locals.models.RatingHistory({
            track_id: song.track_id,
            old_rating: song.rating,
            new_rating: song.rating + ratingChange,
            event_type: 'skip',
            rating_change: ratingChange,
            confidence: song.rating_confidence
        }).save({ session });

        // Update global skip stats
        song.skip_count += 1;
        song.rating += ratingChange;
        song.rating_confidence += 1;
        
        await song.save({ session });

        // Get or create user play history for current month
        const yearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
        let userHistory = await req.app.locals.models.UserPlayHistory.findOne({
            userId: req.user._id,
            yearMonth
        }).session(session);

        if (!userHistory) {
            userHistory = new req.app.locals.models.UserPlayHistory({
                userId: req.user._id,
                yearMonth,
                plays: []
            });
        }

        // Add skip to user history
        userHistory.plays.push({
            songId: song.track_id,
            playedAt: new Date(),
            duration: req.body.position_ms || 0,
            completionRate: (req.body.position_ms / song.duration_ms) * 100,
            skipped: true,
            context: req.body.context || {}
        });

        await userHistory.save({ session });
        await session.commitTransaction();
        
        res.json({ 
            success: true, 
            rating: song.rating,
            skip_count: song.skip_count 
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Track skip error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        session.endSession();
    }
});

// POST /api/v1/songs/:trackId/download - Track song download
router.post('/:trackId/download', async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const song = await req.app.locals.models.Song.findOne({ 
            track_id: req.params.trackId 
        }).session(session);

        if (!song) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Song not found' });
        }

        const ratingChange = calculateRatingChange(
            song.rating, 
            song.rating_confidence, 
            'download'
        );

        // Create rating history entry
        await new req.app.locals.models.RatingHistory({
            track_id: song.track_id,
            old_rating: song.rating,
            new_rating: song.rating + ratingChange,
            event_type: 'download',
            rating_change: ratingChange,
            confidence: song.rating_confidence
        }).save({ session });

        song.download_count += 1;
        song.rating += ratingChange;
        song.rating_confidence += 1;
        
        await song.save({ session });
        await session.commitTransaction();
        
        res.json({ 
            success: true, 
            rating: song.rating,
            download_count: song.download_count 
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Track download error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        session.endSession();
    }
});

// POST /api/v1/songs/:trackId/events/resume - Track song resume
router.post('/:trackId/events/resume', auth, async (req, res) => {
    try {
        const song = await Song.findOne({ 
            track_id: req.params.trackId 
        });

        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }

        // Get or create user play history for current month
        const yearMonth = new Date().toISOString().slice(0, 7);
        let userHistory = await UserPlayHistory.findOne({
            userId: req.user._id,
            yearMonth
        });

        if (!userHistory) {
            userHistory = new UserPlayHistory({
                userId: req.user._id,
                yearMonth,
                plays: []
            });
        }

        // Add resume event to user history
        userHistory.plays.push({
            songId: song.track_id,
            playedAt: new Date(),
            duration: 0,
            position_ms: req.body.position_ms || 0,
            completionRate: 0,
            skipped: false,
            context: req.body.context || {},
            event_type: 'resume'
        });

        await userHistory.save();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Track resume error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/v1/songs/:trackId/events/pause - Track song pause
router.post('/:trackId/events/pause', auth, async (req, res) => {
    try {
        const song = await Song.findOne({ 
            track_id: req.params.trackId 
        });

        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }

        // Get or create user play history for current month
        const yearMonth = new Date().toISOString().slice(0, 7);
        let userHistory = await UserPlayHistory.findOne({
            userId: req.user._id,
            yearMonth
        });

        if (!userHistory) {
            userHistory = new UserPlayHistory({
                userId: req.user._id,
                yearMonth,
                plays: []
            });
        }

        // Add pause event to user history
        userHistory.plays.push({
            songId: song.track_id,
            playedAt: new Date(),
            duration: 0,
            position_ms: req.body.position_ms || 0,
            completionRate: 0,
            skipped: false,
            context: req.body.context || {},
            event_type: 'pause'
        });

        await userHistory.save();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Track pause error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/v1/songs/events - Track multiple events in batch (generic endpoint)
router.post('/events', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { events } = req.body;
        if (!Array.isArray(events)) {
            await session.abortTransaction();
            return res.status(400).json({ error: 'Events must be an array' });
        }

        // Get or create user play history for current month
        const yearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
        let userHistory = await req.app.locals.models.UserPlayHistory.findOne({
            userId: req.user._id,
            yearMonth
        }).session(session);

        if (!userHistory) {
            userHistory = new req.app.locals.models.UserPlayHistory({
                userId: req.user._id,
                yearMonth,
                plays: []
            });
        }

        // Process each event
        const results = await Promise.all(events.map(async event => {
            const { track_id, event_type, position_ms, duration, completionRate, context } = event;

            // Find song
            const song = await req.app.locals.models.Song.findOne({ track_id }).session(session);
            if (!song) {
                return { track_id, success: false, error: 'Song not found' };
            }

            // Add event to user history
            userHistory.plays.push({
                songId: track_id,
                playedAt: new Date(event.timestamp || Date.now()),
                duration: duration || 0,
                position_ms: position_ms || 0,
                completionRate: completionRate || 0,
                skipped: event_type === 'skip',
                event_type,
                context: context || {}
            });

            // Update song stats for play and skip events
            if (event_type === 'play' || event_type === 'skip') {
                const ratingChange = calculateRatingChange(
                    song.rating,
                    song.rating_confidence,
                    event_type
                );

                // Create rating history entry
                await new req.app.locals.models.RatingHistory({
                    track_id: song.track_id,
                    old_rating: song.rating,
                    new_rating: song.rating + ratingChange,
                    event_type,
                    rating_change: ratingChange,
                    confidence: song.rating_confidence
                }).save({ session });

                // Update song stats
                if (event_type === 'play') {
                    song.total_plays += 1;
                } else if (event_type === 'skip') {
                    song.skip_count += 1;
                }
                song.rating += ratingChange;
                song.rating_confidence += 1;
                await song.save({ session });
            }

            return { track_id, success: true };
        }));

        // Save user history
        await userHistory.save({ session });
        await session.commitTransaction();

        res.json({
            success: true,
            results
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Batch track events error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        session.endSession();
    }
});

// POST /api/v1/songs/plays/batch - Track multiple plays in batch
router.post('/plays/batch', auth, async (req, res) => {
    let session;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    const CHUNK_SIZE = 10;

    const handleRequest = async () => {
        try {
            const { plays } = req.body;
            if (!Array.isArray(plays)) {
                throw new Error('Plays must be an array');
            }

            console.log('Processing batch play request:', {
                plays: plays.length,
                userId: req.user._id,
                attempt: retryCount + 1,
                chunks: Math.ceil(plays.length / CHUNK_SIZE)
            });

            // Get or create user play history for current month
            const yearMonth = new Date().toISOString().slice(0, 7);
            let userHistory = await UserPlayHistory.findOne({
                userId: req.user._id,
                yearMonth
            }).lean();

            if (!userHistory) {
                console.log('Creating new user history for:', yearMonth);
                userHistory = {
                    userId: req.user._id,
                    yearMonth,
                    plays: []
                };
            }

            // Process in chunks
            const results = {
                processed: 0,
                failed: 0,
                errors: [],
                ratingUpdates: 0
            };

            // Split plays into chunks
            for (let i = 0; i < plays.length; i += CHUNK_SIZE) {
                session = await mongoose.startSession();
                session.startTransaction();

                try {
                    const chunk = plays.slice(i, i + CHUNK_SIZE);
                    console.log(`Processing chunk ${i / CHUNK_SIZE + 1}/${Math.ceil(plays.length / CHUNK_SIZE)}`);

                    // Fetch songs for this chunk
                    const trackIds = [...new Set(chunk.map(play => play.track_id))];
                    const songs = await Song
                        .find({ track_id: { $in: trackIds } })
                        .session(session)
                        .lean()
                        .maxTimeMS(5000);

                    const songMap = songs.reduce((map, song) => {
                        map[song.track_id] = song;
                        return map;
                    }, {});

                    const chunkRatingHistoryOps = [];
                    const chunkSongUpdates = [];
                    const chunkNewPlays = [];

                    // Process each play in chunk
                    chunk.forEach(play => {
                        const { track_id, duration, completionRate, context } = play;
                        const song = songMap[track_id];

                        if (!song) {
                            results.failed++;
                            results.errors.push({ track_id, error: 'Song not found' });
                            return;
                        }

                        try {
                            const ratingChange = calculateRatingChange(
                                song.rating,
                                song.rating_confidence,
                                'play'
                            );

                            chunkRatingHistoryOps.push({
                                track_id: song.track_id,
                                old_rating: song.rating,
                                new_rating: song.rating + ratingChange,
                                event_type: 'play',
                                rating_change: ratingChange,
                                confidence: song.rating_confidence
                            });

                            chunkSongUpdates.push({
                                updateOne: {
                                    filter: { track_id: song.track_id },
                                    update: {
                                        $inc: {
                                            total_plays: 1,
                                            rating: ratingChange,
                                            rating_confidence: 1
                                        }
                                    }
                                }
                            });

                            chunkNewPlays.push({
                                songId: track_id,
                                playedAt: new Date(play.timestamp || Date.now()),
                                duration: duration || song.duration_ms,
                                completionRate: completionRate || 100,
                                skipped: false,
                                event_type: 'play',
                                context: context || {}
                            });

                            results.processed++;
                        } catch (err) {
                            results.failed++;
                            results.errors.push({ track_id, error: err.message });
                        }
                    });

                    if (chunkRatingHistoryOps.length > 0) {
                        // Execute bulk operations for this chunk
                        const [ratingHistoryResult] = await Promise.all([
                            RatingHistory.insertMany(chunkRatingHistoryOps, { 
                                session,
                                maxTimeMS: 5000 
                            }),
                            Song.bulkWrite(chunkSongUpdates, { 
                                session,
                                maxTimeMS: 5000 
                            })
                        ]);

                        results.ratingUpdates += ratingHistoryResult.length;

                        // Update user history for this chunk
                        await UserPlayHistory.updateOne(
                            { userId: req.user._id, yearMonth },
                            { $push: { plays: { $each: chunkNewPlays } } },
                            { 
                                upsert: true, 
                                session,
                                maxTimeMS: 5000 
                            }
                        );

                        await session.commitTransaction();
                    }
                } catch (error) {
                    console.error(`Error processing chunk ${i / CHUNK_SIZE + 1}:`, error);
                    if (session) {
                        await session.abortTransaction();
                    }
                    throw error;
                } finally {
                    if (session) {
                        session.endSession();
                    }
                }
            }

            if (results.processed === 0) {
                throw new Error('All plays failed to process');
            }

            return {
                success: true,
                ...results,
                errors: results.errors.length > 0 ? results.errors : undefined
            };
        } catch (error) {
            throw error;
        }
    };

    // Main request handler with retries
    try {
        while (retryCount < MAX_RETRIES) {
            try {
                const result = await handleRequest();
                return res.json(result);
            } catch (error) {
                retryCount++;
                console.error(`Batch track plays error (attempt ${retryCount}/${MAX_RETRIES}):`, error);
                
                if (retryCount === MAX_RETRIES) {
                    throw error;
                }
                
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
            }
        }
    } catch (error) {
        console.error('All retry attempts failed:', error);
        res.status(500).json({ 
            error: error.message,
            retries: retryCount
        });
    }
});

// POST /api/v1/songs/skips/batch - Track multiple skips in batch
router.post('/skips/batch', auth, async (req, res) => {
    let session;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    const CHUNK_SIZE = 10; // Process in smaller chunks

    const handleRequest = async () => {
        try {
            const { skips } = req.body;
            if (!Array.isArray(skips)) {
                throw new Error('Skips must be an array');
            }

            console.log('Processing batch skip request:', {
                skips: skips.length,
                userId: req.user._id,
                attempt: retryCount + 1,
                chunks: Math.ceil(skips.length / CHUNK_SIZE)
            });

            // Get or create user play history for current month
            const yearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
            let userHistory = await req.app.locals.models.UserPlayHistory.findOne({
                userId: req.user._id,
                yearMonth
            }).lean();

            if (!userHistory) {
                console.log('Creating new user history for:', yearMonth);
                userHistory = {
                    userId: req.user._id,
                    yearMonth,
                    plays: []
                };
            }

            // Process in chunks
            const results = {
                processed: 0,
                failed: 0,
                errors: [],
                ratingUpdates: 0
            };

            // Split skips into chunks
            for (let i = 0; i < skips.length; i += CHUNK_SIZE) {
                session = await mongoose.startSession();
                session.startTransaction();

                try {
                    const chunk = skips.slice(i, i + CHUNK_SIZE);
                    console.log(`Processing chunk ${i / CHUNK_SIZE + 1}/${Math.ceil(skips.length / CHUNK_SIZE)}`);

                    // Fetch songs for this chunk
                    const trackIds = [...new Set(chunk.map(skip => skip.track_id))];
                    const songs = await req.app.locals.models.Song
                        .find({ track_id: { $in: trackIds } })
                        .session(session)
                        .lean()
                        .maxTimeMS(5000);

                    const songMap = songs.reduce((map, song) => {
                        map[song.track_id] = song;
                        return map;
        }, {});

                    const chunkRatingHistoryOps = [];
                    const chunkSongUpdates = [];
                    const chunkNewPlays = [];

                    // Process each skip in chunk
                    chunk.forEach(skip => {
                        const { track_id, position_ms, context } = skip;
                        const song = songMap[track_id];

                        if (!song) {
                            results.failed++;
                            results.errors.push({ track_id, error: 'Song not found' });
                            return;
                        }

                        try {
                            const ratingChange = calculateRatingChange(
                                song.rating,
                                song.rating_confidence,
                                'skip'
                            );

                            chunkRatingHistoryOps.push({
                                track_id: song.track_id,
                                old_rating: song.rating,
                                new_rating: song.rating + ratingChange,
                                event_type: 'skip',
                                rating_change: ratingChange,
                                confidence: song.rating_confidence
                            });

                            chunkSongUpdates.push({
                                updateOne: {
                                    filter: { track_id: song.track_id },
                                    update: {
                                        $inc: {
                                            skip_count: 1,
                                            rating: ratingChange,
                                            rating_confidence: 1
                                        }
                                    }
                                }
                            });

                            chunkNewPlays.push({
                                songId: track_id,
                                playedAt: new Date(skip.timestamp || Date.now()),
                                duration: position_ms || 0,
                                position_ms: position_ms || 0,
                                completionRate: (position_ms / song.duration_ms) * 100,
                                skipped: true,
                                event_type: 'skip',
                                context: context || {}
                            });

                            results.processed++;
                        } catch (err) {
                            results.failed++;
                            results.errors.push({ track_id, error: err.message });
                        }
                    });

                    if (chunkRatingHistoryOps.length > 0) {
                        // Execute bulk operations for this chunk
                        const [ratingHistoryResult] = await Promise.all([
                            req.app.locals.models.RatingHistory.insertMany(chunkRatingHistoryOps, { 
                                session,
                                maxTimeMS: 5000 
                            }),
                            req.app.locals.models.Song.bulkWrite(chunkSongUpdates, { 
                                session,
                                maxTimeMS: 5000 
                            })
                        ]);

                        results.ratingUpdates += ratingHistoryResult.length;

                        // Update user history for this chunk
                        await req.app.locals.models.UserPlayHistory.updateOne(
                            { userId: req.user._id, yearMonth },
                            { $push: { plays: { $each: chunkNewPlays } } },
                            { 
                                upsert: true, 
                                session,
                                maxTimeMS: 5000 
                            }
                        );

                        await session.commitTransaction();
                    }
    } catch (error) {
                    console.error(`Error processing chunk ${i / CHUNK_SIZE + 1}:`, error);
                    if (session) {
                        await session.abortTransaction();
                    }
                    throw error;
                } finally {
                    if (session) {
                        session.endSession();
                    }
                }
            }

            if (results.processed === 0) {
                throw new Error('All skips failed to process');
            }

            return {
                success: true,
                ...results,
                errors: results.errors.length > 0 ? results.errors : undefined
            };
        } catch (error) {
            throw error;
        }
    };

    // Main request handler with retries
    try {
        while (retryCount < MAX_RETRIES) {
            try {
                const result = await handleRequest();
                return res.json(result);
            } catch (error) {
                retryCount++;
                console.error(`Batch track skips error (attempt ${retryCount}/${MAX_RETRIES}):`, error);
                
                if (retryCount === MAX_RETRIES) {
                    throw error;
                }
                
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
            }
        }
    } catch (error) {
        console.error('All retry attempts failed:', error);
        res.status(500).json({ 
            error: error.message,
            retries: retryCount
        });
    }
});

// GET /api/v1/songs/:trackId - Get song details (MUST be last)
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
