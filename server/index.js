const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
let database;

// Connect to MongoDB once at startup
async function connectToDatabase() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    database = client.db(process.env.DB_NAME);
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

// Ping endpoint for connection testing
app.get('/ping', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is running!' });
});

app.get('/api/random-track', async (req, res) => {
  try {
    if (!database) {
      throw new Error('Database connection not established');
    }
    
    const collection = database.collection('songs');
    
    const [randomTrack] = await collection.aggregate([
      { $sample: { size: 1 } }
    ]).toArray();
    
    if (!randomTrack) {
      throw new Error('No tracks found in database');
    }
    
    console.log('Found track:', randomTrack.title);
    res.json(randomTrack);
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch track' });
  }
});

const PORT = process.env.PORT || 3000;

// Initialize database connection before starting server
connectToDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('MongoDB URI:', uri);
    console.log('Database Name:', process.env.DB_NAME);
  });
});

// Handle process termination
process.on('SIGINT', async () => {
  try {
    await client.close();
    console.log('MongoDB connection closed.');
    process.exit(0);
  } catch (err) {
    console.error('Error closing MongoDB connection:', err);
    process.exit(1);
  }
});