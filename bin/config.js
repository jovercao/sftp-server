const defaultsDeep = require('lodash.defaultsdeep');
const path = require('path');
const fs = require('fs');
const os = require('os');
const mkdirp = require('mkdirp');

const isPkg = Reflect.has(process.versions, 'pkg');
const basePath = isPkg ? path.dirname(process.execPath) : path.resolve(__dirname, '..');

const defaultConfig = {
    sftp: {
        port: 22,
        users: [
        ],
        rateLimitTTL: 10
    },
    api: {
        port: 8000,
        key: '9p1ttJYkuIMv19zyOcF3F5iT7OLqI8iQDqUGzb0oqbMkz1vWVqsm6jnWY8WNAomZFOvtKrUsgtSdzZ2u56w7vF2ouJoiZeFFe3uwxeWTuveL3WzX5xEDuLWesQNaMTIV'
    },
    log: {
        console: {
            enabled: true
        },
        file: {
            enabled: false,
            filename: path.resolve(basePath, 'log/sftp-server.log')
        }
    }
};

let config = defaultConfig;

function loadConfig(filePath) {
    if (fs.existsSync(filePath)) {
        try {
            const loadedConfig = require(filePath);
            config = defaultsDeep(loadedConfig, config);
        } catch (error) {
            const newError = new Error(`读取配置文件${pwdConfigFile}失败！错误信息：${error.message}`);
            newError.innerError = error;
            throw newError;
        }
    }
}

const userConfigFile = path.resolve(os.homedir(), '.sftps.json');
loadConfig(userConfigFile);

const appConfigFile = path.resolve(path.dirname(process.execPath), 'config.json');
if (process.env.NODE_ENV === 'production') {
    loadConfig(appConfigFile);
}

const pwdConfgFile = path.resolve(process.cwd(), '.sftps.json');
loadConfig(pwdConfgFile);

if (!config) {
    config = defaultConfig;
    if (process.env.NODE_ENV === 'production') {
        fs.writeFileSync(appConfigFile, JSON.stringify(config));
    }
}

appRoot = process.env.NODE_ENV === 'production' ? path.dirname(process.execPath) : path.resolve(__dirname, '..');

const matchExp = /\$\{appRoot\}/g;

if (!config.sftp.users || !config.sftp.users.length) {
    throw new Error('you must create one user!')
}
config.sftp.users.forEach((user) => {
    if (user.rootDir) {
        user.rootDir = user.rootDir.replace(matchExp, appRoot);
        user.rootDir = path.resolve(user.rootDir);
        if (!fs.existsSync(user.rootDir)) {
            mkdirp.sync(user.rootDir);
        }
    }
});

if (!config.sftp.hostKeyFile) {
    throw new Error('sftp.hostKeyFile must not empty.');
}
config.sftp.hostKeyFile = config.sftp.hostKeyFile.replace(matchExp, appRoot);

if (!config.sftp.dataDirectory) {
    throw new Error('sftp.dataDirectory must not empty.');
}

module.exports = config;
