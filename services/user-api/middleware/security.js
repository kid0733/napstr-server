const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    trustProxy: false, // We'll handle this in the main app
    keyGenerator: (req) => {
        // Use the first IP in x-forwarded-for as it's the client IP from Cloudflare
        const forwardedFor = req.headers['x-forwarded-for'];
        if (forwardedFor) {
            const ips = forwardedFor.split(',').map(ip => ip.trim());
            return ips[0];
        }
        return req.ip;
    }
});

// Only allow /api/v1/* paths
const validatePath = (req, res, next) => {
    if (!req.path.startsWith('/api/v1/')) {
        return res.status(404).send('Not Found');
    }
    next();
};

module.exports = {
    setupSecurity: (app) => {
        // Basic security headers
        app.use(helmet());
        
        // Rate limiting
        app.use(limiter);
        
        // Path validation
        app.use(validatePath);
        
        // Remove x-powered-by header
        app.disable('x-powered-by');
    }
};
