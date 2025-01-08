const express = require('express');
const router = express.Router();
const SearchAnalytics = require('../models/analytics');
const { cache } = require('../middleware/cache');

// GET /api/v1/analytics/search-patterns
router.get('/search-patterns', cache(300), async (req, res) => {
    try {
        const pipeline = [
            {
                $group: {
                    _id: '$query',
                    count: { $sum: 1 },
                    avgExecutionTime: { $avg: '$executionTime' },
                    avgResultCount: { $avg: '$resultCount' }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 20 }
        ];

        const patterns = await SearchAnalytics.aggregate(pipeline);
        res.json(patterns);
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/analytics/performance
router.get('/performance', cache(300), async (req, res) => {
    try {
        const pipeline = [
            {
                $group: {
                    _id: {
                        hour: { $hour: '$timestamp' },
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }
                    },
                    avgExecutionTime: { $avg: '$executionTime' },
                    totalQueries: { $sum: 1 }
                }
            },
            { $sort: { '_id.date': -1, '_id.hour': -1 } },
            { $limit: 24 }
        ];

        const performance = await SearchAnalytics.aggregate(pipeline);
        res.json(performance);
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/analytics/summary
router.get('/summary', cache(300), async (req, res) => {
    try {
        const now = new Date();
        const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

        const [total, last24h, avgExecution, topQueries] = await Promise.all([
            SearchAnalytics.countDocuments(),
            SearchAnalytics.countDocuments({ timestamp: { $gte: oneDayAgo } }),
            SearchAnalytics.aggregate([
                { $group: { _id: null, avg: { $avg: '$executionTime' } } }
            ]),
            SearchAnalytics.aggregate([
                { $group: { _id: '$query', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ])
        ]);

        res.json({
            total,
            last24h,
            avgExecutionTime: avgExecution[0]?.avg || 0,
            topQueries
        });
    } catch (error) {
        console.error('Analytics summary error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
