const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const expressWs = require('express-ws');
const { userSchema } = require('./models/user');
const { playlistSchema } = require('./models/playlist');
const { chatMessageSchema } = require('./models/chat-message');
const UserPlayHistory = require('./models/user-play-history');
const { setupSecurity } = require('./middleware/security');
const { keydb } = require('./services/keydb.service');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Enable WebSocket for the entire app
expressWs(app, server);

// MongoDB Connection Options
const mongoOptions = {
    serverApi: {
        version: '1',
        strict: true,
        deprecationErrors: true,
    },
    connectTimeoutMS: 30000,
    socketTimeoutMS: 30000,
    serverSelectionTimeoutMS: 30000,
    maxPoolSize: 50,
    minPoolSize: 10,
    maxIdleTimeMS: 60000,
    waitQueueTimeoutMS: 30000,
    bufferCommands: true
};

// Basic middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Setup security middleware
setupSecurity(app);

// Request logging middleware
app.use((req, res, next) => {
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
    console.log(`${new Date().toISOString()} - ${clientIP} - ${req.method} ${req.originalUrl}`);
    next();
});

// Initialize database and start server
const initializeApp = async () => {
    try {
        // Create database connection
        console.log('Connecting to database...');
        const userDb = await mongoose.createConnection(
            process.env.MONGO_USER_URI,
            {
                ...mongoOptions,
                dbName: process.env.USER_DB_NAME
            }
        );

        // Wait for connection to be ready
        await new Promise((resolve, reject) => {
            userDb.once('connected', resolve);
            userDb.once('error', reject);
        });

        console.log('MongoDB connected successfully');

        // Initialize models with explicit collection names
        console.log('Initializing models...');
        const models = {
            User: userDb.model('User', userSchema, 'users'),
            Playlist: userDb.model('Playlist', playlistSchema, 'playlists'),
            UserPlayHistory: userDb.model('UserPlayHistory', UserPlayHistory.schema, 'userplayhistories'),
            ChatMessage: userDb.model('ChatMessage', chatMessageSchema, 'chatmessages')
        };

        // Make models available throughout the app
        app.locals.models = models;

        // Middleware to make models available in routes
        app.use((req, res, next) => {
            req.models = app.locals.models;
            next();
        });

        // Health check endpoint
        app.get('/health', async (req, res) => {
            const keydbHealth = await keydb.healthCheck();
            res.json({
                status: 'healthy',
                service: 'user-api',
                connections: {
                    database: userDb.readyState === 1,
                    keydb: keydbHealth.status === 'healthy'
                }
            });
        });

        // Import routes after models are initialized
        const authRouter = require('./routes/auth');
        const playlistsRouter = require('./routes/playlists');
        const chatRouter = require('./routes/chat');

        // Routes
        app.use('/api/v1/auth', authRouter);
        app.use('/api/v1/playlists', playlistsRouter);
        app.use('/api/v1/chat', chatRouter);

        // Error handling middleware
        app.use((err, req, res, next) => {
            console.error('Error:', err);
            
            if (err.name === 'MongooseError' && err.message.includes('buffering timed out')) {
                return res.status(504).json({ 
                    error: 'Database operation timed out',
                    details: process.env.NODE_ENV === 'development' ? err.message : undefined
                });
            }

            res.status(500).json({
                error: 'Internal Server Error',
                details: process.env.NODE_ENV === 'development' ? err.message : undefined
            });
        });

        // Start server
        const PORT = process.env.PORT || 8081;
        await new Promise((resolve) => {
            server.listen(PORT, '0.0.0.0', () => {
                console.log(`User API running on port ${PORT}`);
                console.log('Available routes:');
                console.log('- /health');
                console.log('- /api/v1/auth');
                console.log('  - POST /register');
                console.log('  - POST /login');
                console.log('  - POST /google');
                console.log('  - GET /me');
                console.log('  - PATCH /preferences');
                console.log('- /api/v1/playlists');
                console.log('  - GET / (with pagination)');
                console.log('  - POST /');
                console.log('  - GET /:id');
                console.log('  - POST /:id/songs');
                console.log('  - DELETE /:id/songs/:songId');
                console.log('- /api/v1/chat');
                console.log('  - GET /history/:roomId');
                console.log('  - WebSocket /ws (real-time chat)');
                resolve();
            });
        });

        // Create indexes after connection is ready
        console.log('Creating database indexes...');
        await Promise.all([
            models.User.init(),
            models.Playlist.init(),
            models.UserPlayHistory.init(),
            models.ChatMessage.init()
        ]);

        await Promise.all([
            models.User.createIndexes(),
            models.Playlist.createIndexes(),
            models.UserPlayHistory.createIndexes(),
            models.ChatMessage.createIndexes()
        ]);
        console.log('Database indexes created successfully');

    } catch (error) {
        console.error('Failed to initialize application:', error);
        process.exit(1);
    }
};

// Handle graceful shutdown
const gracefulShutdown = async () => {
    console.log('Received shutdown signal. Closing connections...');
    
    server.close(async () => {
        try {
            await mongoose.disconnect();
            console.log('MongoDB connections closed');
            await keydb.close();
            console.log('KeyDB connection closed');
            console.log('All connections closed. Exiting...');
            process.exit(0);
        } catch (error) {
            console.error('Error during shutdown:', error);
            process.exit(1);
        }
    });

    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

// Shutdown handlers
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Initialize the application
initializeApp().catch(error => {
    console.error('Failed to start application:', error);
    process.exit(1);
});

// Export for testing
module.exports = {
    app,
    server,
    MONGODB_URL: process.env.MONGO_USER_URI
};
