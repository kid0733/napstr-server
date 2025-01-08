require('dotenv').config();
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

async function addTestData() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const SearchAnalytics = mongoose.model('SearchAnalytics', searchAnalyticsSchema);
        
        // Create test data with timestamps spread over the last 24 hours
        const testData = [];
        const now = new Date();
        
        const queries = [
            { term: 'Kendrick', count: 10 },
            { term: 'Doechii', count: 8 },
            { term: 'hip hop', count: 5 },
            { term: 'rap', count: 7 },
            { term: 'Section.80', count: 4 }
        ];

        for (const query of queries) {
            for (let i = 0; i < query.count; i++) {
                const hoursAgo = Math.random() * 24;
                const timestamp = new Date(now - hoursAgo * 60 * 60 * 1000);
                
                testData.push({
                    query: query.term,
                    resultCount: Math.floor(Math.random() * 30) + 1,
                    executionTime: Math.floor(Math.random() * 100) + 20,
                    timestamp,
                    userAgent: 'Test Browser',
                    ip: '127.0.0.1',
                    filters: {
                        sortBy: Math.random() > 0.5 ? 'popularity' : 'added_at',
                        limit: Math.random() > 0.5 ? 10 : 20
                    }
                });
            }
        }

        console.log(`Inserting ${testData.length} analytics records...`);
        await SearchAnalytics.insertMany(testData);
        console.log('Test data inserted successfully');

        const count = await SearchAnalytics.countDocuments();
        console.log(`Total analytics records: ${count}`);

        mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
    }
}

addTestData();
