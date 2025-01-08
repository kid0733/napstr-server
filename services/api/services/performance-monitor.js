const os = require('os');
const { EventEmitter } = require('events');

class PerformanceMonitor extends EventEmitter {
    constructor(wsService) {
        super();
        this.wsService = wsService;
        this.metrics = {
            requests: 0,
            errors: 0,
            avgResponseTime: 0,
            totalResponseTime: 0,
            cacheHits: 0,
            cacheMisses: 0
        };

        // Monitor system resources
        setInterval(() => this.collectMetrics(), 5000);
    }

    incrementRequests() {
        this.metrics.requests++;
        this.emit('metrics-update', this.metrics);
    }

    recordResponseTime(time) {
        this.metrics.totalResponseTime += time;
        this.metrics.avgResponseTime = this.metrics.totalResponseTime / this.metrics.requests;
        this.emit('metrics-update', this.metrics);
    }

    recordCacheHit() {
        this.metrics.cacheHits++;
        this.emit('metrics-update', this.metrics);
    }

    recordCacheMiss() {
        this.metrics.cacheMisses++;
        this.emit('metrics-update', this.metrics);
    }

    recordError() {
        this.metrics.errors++;
        this.emit('metrics-update', this.metrics);
    }

    async collectMetrics() {
        const systemMetrics = {
            cpu: os.loadavg(),
            memory: {
                total: os.totalmem(),
                free: os.freemem(),
                used: os.totalmem() - os.freemem()
            },
            uptime: os.uptime()
        };

        const metrics = {
            ...this.metrics,
            system: systemMetrics,
            timestamp: new Date()
        };

        this.wsService.broadcast('metrics', metrics);
    }
}

module.exports = PerformanceMonitor;
