const IORedis = require('ioredis');
const EventEmitter = require('events');

class KeyDBService extends EventEmitter {
    static instance;
    constructor() {
        super();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.initializeClient();
    }

    initializeClient() {
        const config = {
            host: process.env.KEYDB_HOST || '127.0.0.1',
            port: parseInt(process.env.KEYDB_PORT || '6379'),
            password: 'Prasid',  // Using the correct password
            retryStrategy: (times) => {
                this.reconnectAttempts = times;
                if (times > 10) {
                    console.error('KeyDB: Max retry attempts reached');
                    return null;
                }
                const delay = Math.min(times * 100, 3000);
                console.log(`KeyDB: Retrying connection in ${delay}ms...`);
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableAutoPipelining: true,
            connectTimeout: 10000,
            disconnectTimeout: 2000,
            commandTimeout: 5000,
            retryUnfulfilledCommands: true,
            autoResubscribe: true,
            autoResendUnfulfilledCommands: true,
            lazyConnect: false,
            showFriendlyErrorStack: true,
            enableReadyCheck: true,
            connectionName: 'napstr-chat'
        };

        this.client = new IORedis(config);
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.on('connect', () => {
            console.log('KeyDB: Connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.emit('connected');
        });

        this.client.on('ready', async () => {
            console.log('KeyDB: Ready to accept commands');
            try {
                const pong = await this.client.ping();
                console.log('KeyDB: Authentication successful, PING response:', pong);
            } catch (error) {
                console.error('KeyDB: Command execution failed:', error.message);
            }
        });

        this.client.on('error', (error) => {
            console.error('KeyDB Error:', error.message);
            this.emit('error', error);
        });

        this.client.on('close', () => {
            console.log('KeyDB: Connection closed');
            this.isConnected = false;
            this.emit('disconnected');
        });

        this.client.on('reconnecting', () => {
            console.log(`KeyDB: Reconnecting... Attempt ${this.reconnectAttempts + 1}`);
            this.emit('reconnecting', this.reconnectAttempts);
        });
    }

    static getInstance() {
        if (!KeyDBService.instance) {
            KeyDBService.instance = new KeyDBService();
        }
        return KeyDBService.instance;
    }

    getClient() {
        return this.client;
    }

    async healthCheck() {
        try {
            if (!this.isConnected) {
                console.log('KeyDB: Not connected, attempting to connect...');
                await this.client.connect();
            }
            
            const pingResult = await this.client.ping();
            return {
                status: this.isConnected ? 'healthy' : 'unhealthy',
                details: {
                    ping: pingResult === 'PONG',
                    connected: this.isConnected,
                    reconnectAttempts: this.reconnectAttempts
                }
            };
        } catch (error) {
            console.error('KeyDB Health Check Error:', error.message);
            return {
                status: 'unhealthy',
                details: {
                    error: error.message,
                    connected: false,
                    reconnectAttempts: this.reconnectAttempts
                }
            };
        }
    }

    async close() {
        try {
            await this.client.quit();
            this.isConnected = false;
            console.log('KeyDB: Connection closed gracefully');
        } catch (error) {
            console.error('KeyDB Close Error:', error.message);
            this.client.disconnect();
        }
    }
}

module.exports = {
    keydb: KeyDBService.getInstance()
};
