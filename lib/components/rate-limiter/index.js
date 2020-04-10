'use strict';

const Promise = require('bluebird');

exports = module.exports = function(config, log) {

    const ttl = parseInt(config.get('sftp:rateLimitTTL'), 10);

    class RaterLimiter {

        constructor() {

            if (!ttl) {
                return;
            }

            setInterval(() => {
                this.refreshLimits();
            }, ttl * 1000);

        }

        get limits() {
            return this._limits ? this._limits : this._limits = {};
        }

        limit(ip) {
            if (!ttl) {
                return;
            }
            if (!ip) {
                throw new Error(`'ip' is required`);
            }
            log.info(`Rate-limiting IP`, { 'ip': ip });
            if (!this.limits[ip]) {
                this.limits[ip] = {
                    times: 0
                }
            }
            this.limits[ip].lastAt = (new Date).getTime();
            this.limits[ip].times++;
        }

        refreshLimits() {
            const now = (new Date).getTime();
            for (let ip in this.limits) {
                const diff = (now - this.limits[ip].lastAt) / 1000;
                if (diff >= ttl * this.limits[ip].times) {
                    log.info(`Releasing IP from rate limit`, { 'ip': ip });
                    delete this.limits[ip];
                }
            }
        }

        isLimited(ip) {
            if (!this.limits[ip]) {
                return false;
            }
            // less then 3 times no limit.
            if (this.limits[ip].times < 3) {
                return false
            }
            const diff = ((new Date).getTime()) - this.limits[ip].lastAt;
            if (diff < (ttl * this.limits[ip].times * 1000)) {
                return true;
            } else {
                delete this.limits[ip];
                return false;
            }
        }

    }

    return new RaterLimiter();

};

exports['@singleton'] = true;
exports['@require'] = ['config', 'log'];
