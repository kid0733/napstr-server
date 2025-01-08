const mongoose = require('mongoose');

const searchAnalyticsSchema = new mongoose.Schema({
    query: String,
    filters: Object,
    resultCount: Number,
    executionTime: Number,
    timestamp: { type: Date, default: Date.now },
    userAgent: String,
    ip: String
}, { 
    timestamps: true,
    collection: 'search_analytics' 
});

const SearchAnalytics = mongoose.model('SearchAnalytics', searchAnalyticsSchema);

const trackSearch = async (searchData) => {
    try {
        await SearchAnalytics.create(searchData);
    } catch (error) {
        console.error('Analytics error:', error);
    }
};

module.exports = { trackSearch };
