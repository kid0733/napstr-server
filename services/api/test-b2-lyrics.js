const { S3Client, ListObjectsCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
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

async function testLyrics() {
    try {
        console.log('Testing lyrics access...');
        
        // First list objects in lyrics folder
        const listCommand = new ListObjectsCommand({
            Bucket: process.env.B2_BUCKET,
            Prefix: 'lyrics/',
            MaxKeys: 10
        });
        
        const listResponse = await s3Client.send(listCommand);
        console.log('\nFiles in lyrics folder:', listResponse.Contents?.map(obj => obj.Key));

        // Try to get the specific lyrics file
        const getCommand = new GetObjectCommand({
            Bucket: process.env.B2_BUCKET,
            Key: 'lyrics/ZiYAIEMfUlEZ.lrc'
        });

        const { Body } = await s3Client.send(getCommand);
        let content = '';
        for await (const chunk of Body) {
            content += chunk.toString();
        }
        
        console.log('\nLyrics content:', content.substring(0, 100) + '...');
    } catch (error) {
        console.error('Error:', error.message);
        console.error('Full error:', error);
    }
}

testLyrics();
