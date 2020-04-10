'use strict';

const Promise = require('bluebird');
const clientExtensions = require('./client-extensions');
const sessionExtensions = require('./session-extensions');
const path = require('path');
const _ = require('lodash');
// const crypto = require('crypto');

exports = module.exports = function(fs, config, StreamManager, log, rateLimiter) {

    class ClientManager {

        constructor(server) {
            log.debug('Initializing client manager');
            this.server = server;
        }

        get clients() {
            return this._clients ? this._clients : this._clients = new Set();
        }

        get streamManagers() {
            return this._streamManagers ? this._streamManagers : this._streamManagers = [];
        }

        set setStreamManagers(val) {
            return this._streamManagers = val;
        }

        track(client) {
            log.debug('Client connected');
            Object.defineProperties(client, clientExtensions);
            client
                .on('authentication', (authContext) => {
                    return this.onAuthenticate(client, authContext);
                })
                .on('ready', () => {
                    return this.onReady(client);
                })
                .on('end', () => {
                    return this.onEnd(client);
                })
                .on('continue', () => {
                    log.info('Client continue');
                })
                .on('rekey', () => {
                    log.info('Client rekey');
                })
                .on('tcpip', (accept, reject) => {
                    log.info('Client tcpip');
                    reject();
                })
                .on('openssh.streamlocal', (accept, reject, info) => {
                    log.info('Client openssh.streamlocal', {
                        'info': info
                    });
                    reject();
                })
                .on('request', (accept, reject, name, info) => {
                    log.info('Client request', {
                        'name': name,
                        'info': info
                    });
                    reject();
                })
                .on('close', (hadError) => {
                    log.info('Client close');
                })
                .on('error', (err) => {

                    if ((_.get(err, 'stack') || '').indexOf('com.jcraft.jsch.JSchException: Auth fail') >= 0) {
                        log.debug('Client error', err);
                    } else {
                        log.error('Client error', err);
                    }

                });
            this.clients.add(client);
        }

        // verifyPassword(username, ctx) {

        // }

        // verifyPublicKey(username, ctx) {
        //     var allowedPubSSHKey = allowedPubKey.getPublicSSH();
        //     if (ctx.key.algo !== allowedPubKey.type
        //         || ctx.key.data.length !== allowedPubSSHKey.length
        //         || !crypto.timingSafeEqual(ctx.key.data, allowedPubSSHKey)
        //         || (ctx.signature && allowedPubKey.verify(ctx.blob, ctx.signature) !== true)) {
        //         return ctx.reject();
        //     }
        //     break;
        // }

        // 执行身份验证
        _authenticate(username, password) {
            const users = config.get('sftp:users');
            const user = users.find(user => user.username === username && user.password === password);
            if (!user) {
                return Promise.reject(new Error('Username or Password error.'));
            }
            // 如果限制最大连接数
            if (user.maxConnect) {
                if (Array.from(this.clients).filter(({ user }) => user && user.username === username).length >= user.maxConnect) {
                    return Promise.reject(new Error('The maximum number of connections exceeded.'))
                }
            }
            const loginUser = {
                username,
                rootDir: user.rootDir,
                permissions: user.permissions,
                loginTime: new Date()
            };
            // 如果用户没有设置rootDir，则使用默认目录
            if (!loginUser.rootDir) {
                const dataDir = config.get('sftp:dataDirectory');
                loginUser.rootDir = path.resolve(dataDir, username);
            }
            if (!path.isAbsolute(loginUser.rootDir)) {
                loginUser.rootDir = path.resolve(loginUser.rootDir);
            }
            return Promise.resolve(loginUser);
        }

        onAuthenticate(client, authContext) {
            if (authContext.method !== 'password') {
                return authContext.reject();
            }
            if (rateLimiter.isLimited(client.info.ip)) {
                log.info(`Rejecting authentication attempt from rate-limited IP`, { 'ip': client.info.ip });
                rateLimiter.limit(client.info.ip);
                return authContext.reject();
            }
            return this._authenticate(authContext.username, authContext.password)
                .then((authRes) => {
                    authRes = _.isPlainObject(authRes) ? authRes : {};
                    _.defaultsDeep(authRes, {
                        'permissions': {}
                    });
                    client.permissions = authRes.permissions;
                    client.user = authRes
                    return fs.ensureDirAsync(authRes.rootDir);
                })
                .then(() => {
                    this.server.emit('login', client.user);
                    log.info('User signed in', {
                        'username': authContext.username
                    });
                    client.username = authContext.username;
                    return authContext.accept();
                })
                .catch(() => {
                    rateLimiter.limit(client.info.ip);
                    return authContext.reject();
                });
        }

        onReady(client) {
            log.debug('Client has authenticated', { 'username': client.username });
            client.on('session', (accept, reject) => {
                return this.onSession(client, accept, reject);
            });
        }

        onEnd(client) {
            log.debug('Client disconnected');
            // 清除客户端
            this.clients.delete(client);
        }

        onSession(client, accept, reject) {
            log.debug('New client session', { 'username': client.username });
            let session = accept();
            Object.defineProperties(session, sessionExtensions);
            client.sessions.push(session);
            session.on('sftp', (accept, reject) => {
                return this.onSFTP(client, accept, reject);
            });
            session.on('exec', (accept, reject) => {
                return reject();
            });
            session.on('pty', (accept, reject) => {
                return reject();
            });
            session.on('window-change', (accept, reject) => {
                return reject();
            });
            session.on('x11', (accept, reject) => {
                return reject();
            });
            session.on('env', (accept, reject) => {
                return reject();
            });
            session.on('signal', (accept, reject) => {
                return reject();
            });
            session.on('auth-agent', (accept, reject) => {
                return reject();
            });
            session.on('shell', (accept, reject) => {
                return reject();
            });
            session.on('subsystem', (accept, reject) => {
                return reject();
            });
        }

        onSFTP(client, accept, reject) {
            log.debug('New SFTP connection', { 'username': client.username });
            const streamManager = new StreamManager(this, client, accept());
            this.streamManagers.push(streamManager);
        }

    }

    return ClientManager;

};

exports['@singleton'] = true;
exports['@require'] = ['fs', 'config', 'stream-manager', 'log', 'rate-limiter'];
