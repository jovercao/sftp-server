'use strict';

const fs = require('fs');
// const Promise = require('bluebird');
// const SFTPServer = require('../');
const path = require('path');
const options = require('./config')

options.sftp.hostKeys = [
    fs.readFileSync(options.sftp.hostKeyFile).toString('utf8')
]
delete options.sftp.hostKeyFile

require('../')(options)
    .then((server) => {

        server.on('listening', (data) => {
            // ...
        });

        server.on('login', (data) => {
            // ...
        });

        server.on('upload_complete', (data) => {
            // ...
        });

        server.on('ready', () => {
            // ...
        });
        server.listen();
    })
    .catch((err) => {
        console.log('err', err);
        throw err;
    });
