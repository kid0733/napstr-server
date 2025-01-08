const jwt = require('jsonwebtoken');

const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            throw new Error('No token provided');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await req.app.locals.models.User.findOne({ 
            _id: decoded._id,
            'tokens.token': token 
        });

        if (!user) {
            throw new Error('User not found');
        }

        // Update last active timestamp
        user.lastActive = new Date();
        await user.save();

        // Add user to request for route handlers
        req.user = user;
        req.token = token;

        // Log authenticated request with username
        const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
        console.log(`${new Date().toISOString()} - ${clientIP} - ${user.username} - ${req.method} ${req.originalUrl}`);

        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ error: 'Please authenticate' });
    }
};

module.exports = auth;
