const WebSocket = require('ws');
const axios = require('axios');

const API_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

async function runTests() {
    console.log('Starting API tests...\n');

    try {
        // 1. Test Health Endpoint
        console.log('Testing health endpoint...');
        const health = await axios.get(`${API_URL}/health`);
        console.log('✅ Health check passed:', health.data);

        // 2. Test Songs Endpoint
        console.log('\nTesting songs endpoint...');
        const songs = await axios.get(`${API_URL}/api/v1/songs`);
        console.log('✅ Songs endpoint returned:', songs.data.songs.length, 'songs');

        // 3. Test Search Functionality
        console.log('\nTesting search functionality...');
        const searchQuery = 'a';  // Simple search query
        const searchResults = await axios.get(`${API_URL}/api/v1/songs?search=${searchQuery}`);
        console.log('✅ Search returned:', searchResults.data.songs.length, 'results');

        // 4. Test Single Song Details
        if (songs.data.songs.length > 0) {
            const firstSong = songs.data.songs[0];
            console.log('\nTesting single song details...');
            const songDetails = await axios.get(`${API_URL}/api/v1/songs/${firstSong.track_id}`);
            console.log('✅ Song details retrieved:', songDetails.data.title);

            // 5. Test Lyrics Endpoint
            console.log('\nTesting lyrics endpoint...');
            const lyrics = await axios.get(`${API_URL}/api/v1/songs/${firstSong.track_id}/lyrics`);
            console.log('✅ Lyrics retrieved for:', firstSong.track_id);
        }

        // 6. Test WebSocket Connection
        console.log('\nTesting WebSocket connection...');
        const ws = new WebSocket(WS_URL);
        
        ws.on('open', () => {
            console.log('✅ WebSocket connected successfully');
        });

        ws.on('message', (data) => {
            const message = JSON.parse(data);
            console.log('✅ Received WebSocket message:', message.event);
        });

        // Wait for metrics
        await new Promise(resolve => setTimeout(resolve, 6000));

        console.log('\nAll tests completed successfully! 🎉');
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Error details:', error.response.data);
        }
    }
}

runTests();
