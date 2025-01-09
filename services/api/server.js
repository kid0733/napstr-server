    const express = require('express');
    const mongoose = require('mongoose');
    const cors = require('cors');
    const WebSocket = require('ws');
    const http = require('http');
    const WebSocketService = require('./services/websocket');
    const PerformanceMonitor = require('./services/performance-monitor');
    const { Song, songSchema } = require('./models/song');
    const { Album, albumSchema } = require('./models/album');
    const RatingHistory = require('./models/rating-history');
    const { SongRequest, songRequestSchema } = require('./models/song-request');
    const songsRouter = require('./routes/songs');
    const albumsRouter = require('./routes/albums');
    const streamRouter = require('./routes/stream');
    const lyricsRouter = require('./routes/lyrics');
    const ratingRouter = require('./routes/rating');
    const healthRouter = require('./routes/health');
    const likedSongsRouter = require('./routes/liked-songs');
    const songRequestsRouter = require('./routes/song-requests');
    const { setupSecurity } = require('./middleware/security');
    const userSchema = require('./models/user');
    require('dotenv').config();

    const app = express();
    const server = http.createServer(app);

    // Initialize WebSocket service
    const wsService = new WebSocketService(server);
    const performanceMonitor = new PerformanceMonitor(wsService);

    // Middleware
    app.use(cors());
    app.use(express.json());

    // Setup security middleware
    setupSecurity(app);

    // MongoDB options with increased timeouts
    const mongoOptions = {
        serverApi: {
            version: '1',
            strict: true,
            deprecationErrors: true,
        },
        connectTimeoutMS: 30000,
        socketTimeoutMS: 30000,
        serverSelectionTimeoutMS: 30000
    };

    // Extract database names from URIs or use defaults
    const musicDbUri = new URL(process.env.MONGO_URI);
    const userDbUri = new URL(process.env.MONGO_USER_URI);

    const musicDbName = musicDbUri.pathname.split('/')[1] || 'music_library';
    const userDbName = userDbUri.pathname.split('/')[1] || 'napstr_users';

    console.log('Connecting to databases:', {
        musicDb: musicDbName,
        userDb: userDbName
    });

    // Create music database connection
    const musicDb = mongoose.createConnection(process.env.MONGO_URI, {
        ...mongoOptions,
        dbName: musicDbName
    });

    // Create user database connection
    const userDb = mongoose.createConnection(process.env.MONGO_USER_URI, {
        ...mongoOptions,
        dbName: userDbName
    });

    // Initialize models with explicit database connections
    app.locals.models = {
        Song: musicDb.model('Song', songSchema),
        Album: musicDb.model('Album', albumSchema),
        RatingHistory: musicDb.model('RatingHistory', RatingHistory.schema),
        LikedSongs: musicDb.model('LikedSongs', new mongoose.Schema({
            userId: { type: String, required: true },
            songId: { type: String, required: true },
            likedAt: { type: Date, default: Date.now }
        }, { timestamps: true })),
        User: userDb.model('User', userSchema, 'users'),
        SongRequest: musicDb.model('SongRequest', songRequestSchema)
    };

    // Log database connections for debugging
    userDb.on('connected', () => {
        console.log('User MongoDB connected successfully');
        console.log('Database:', userDb.name);
        console.log('Collections:', Object.keys(userDb.collections));
        // Verify User model connection
        const User = app.locals.models.User;
        console.log('User model database:', User.db.name);
        console.log('User model collection:', User.collection.name);
    });

    musicDb.on('connected', () => {
        console.log('Music MongoDB connected successfully');
        console.log('Database:', musicDb.name);
        console.log('Collections:', Object.keys(musicDb.collections));
    });

    // Routes
    app.use('/api/v1/songs', songsRouter);
    app.use('/api/v1/albums', albumsRouter);
    app.use('/api/v1/stream', streamRouter);
    app.use('/api/v1/lyrics', lyricsRouter);
    app.use('/api/v1/rating', ratingRouter);
    app.use('/api/v1/liked-songs', likedSongsRouter);
    app.use('/api/v1/song-requests', songRequestsRouter);
    app.use('/health', healthRouter);

    // Error handling middleware
    app.use((err, req, res, next) => {
        console.error('Error:', err);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    });

    // Start server after both databases are connected
    Promise.all([
        new Promise(resolve => musicDb.once('connected', resolve)),
        new Promise(resolve => userDb.once('connected', resolve))
    ]).then(() => {
        server.listen(8080, '0.0.0.0', () => {
            console.log('Music API running on port 8080');
            console.log('Available routes:');
            console.log('- /health');
            console.log('- /api/v1/songs');
            console.log('  - /:trackId/play');
            console.log('  - /:trackId/skip');
            console.log('  - /:trackId/download');
            console.log('- /api/v1/albums');
            console.log('  - GET /');
            console.log('  - GET /featured');
            console.log('  - GET /random');
            console.log('  - GET /:albumId');
            console.log('- /api/v1/rating');
            console.log('  - /history/:trackId');
            console.log('  - /stats/:trackId');
            console.log('- /api/v1/liked-songs');
            console.log('  - GET /');
            console.log('  - POST /:trackId');
            console.log('  - DELETE /:trackId');
        });
    });

    module.exports = app;
