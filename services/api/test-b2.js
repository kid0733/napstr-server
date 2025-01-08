const { S3Client, ListObjectsCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const s3Client = new S3Client({
    endpoint: process.env.B2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.B2_KEY_ID,
        secretAccessKey: process.env.B2_APP_KEY
    },
    region: 'us-west-004',
    forcePathStyle: true
});

async function testConnection() {
    try {
        console.log('Testing B2 connection...');
        console.log('Endpoint:', process.env.B2_ENDPOINT);
        console.log('Bucket:', process.env.B2_BUCKET);
        console.log('Key ID length:', process.env.B2_KEY_ID.length);
        
        const command = new ListObjectsCommand({
            Bucket: process.env.B2_BUCKET,
            MaxKeys: 1
        });
        
        const response = await s3Client.send(command);
        console.log('Connection successful!');
        console.log('Found objects:', response.Contents?.length || 0);
    } catch (error) {
        console.error('Error:', error.message);
        console.error('Full error:', error);
    }
}

testConnection();
