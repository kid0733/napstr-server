const jwt = require('jsonwebtoken');

const auth = async (req, res, next) => {
    try {
        // Extract and validate token
        const authHeader = req.header('Authorization');
        console.log('Auth middleware - Authorization header:', authHeader ? 'Present' : 'Missing');
        
        const token = authHeader?.replace('Bearer ', '');
        if (!token) {
            console.error('Auth failed: No token provided');
            throw new Error('No token provided');
        }

        // Log token details (safely)
        const tokenPrefix = token.substring(0, 10) + '...';
        console.log('Auth middleware - Processing token:', {
            tokenPrefix,
            url: req.originalUrl,
            method: req.method
        });

        // Verify JWT
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
            console.log('Auth middleware - Token decoded:', {
                userId: decoded._id,
                exp: new Date(decoded.exp * 1000).toISOString()
            });
        } catch (jwtError) {
            console.error('Auth failed: JWT verification failed:', {
                error: jwtError.message,
                tokenPrefix
            });
            throw new Error('Invalid token');
        }

        // Get User model from app locals
        const User = req.app.locals.models.User;
        
        // Log database connection details
        console.log('Auth middleware - User model details:', {
            database: User.db.name,
            collection: User.collection.name
        });

        // Find user and validate token
        const user = await User.findOne({ 
            _id: decoded._id,
            'tokens.token': token 
        }).select('+tokens');

        if (!user) {
            console.error('Auth failed: User not found:', {
                userId: decoded._id,
                tokenPrefix,
                database: User.db.name,
                collection: User.collection.name
            });
            throw new Error('User not found');
        }

        console.log('Auth middleware - User found:', {
            userId: user._id,
            username: user.username,
            tokensCount: user.tokens?.length || 0
        });

        // Add user and token to request
        req.user = user;
        req.token = token;

        next();
    } catch (error) {
        console.error('Auth middleware error:', {
            message: error.message,
            path: req.originalUrl,
            method: req.method,
            ip: req.ip
        });

        res.status(401).json({ 
            error: 'Please authenticate',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = auth;
