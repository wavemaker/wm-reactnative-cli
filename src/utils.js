const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');
const taskLogger = require('./custom-logger/task-logger').spinnerBar;
const loggerLabel = 'wm-reactnative-cli';


function isWindowsOS() {
    return (os.platform() === "win32" || os.platform() === "win64");
}

async function readAndReplaceFileContent(path, writeFn) {
    const content = fs.readFileSync(path, 'utf-8');
    return Promise.resolve().then(() => {    
        return writeFn && writeFn(content);
    }).then((modifiedContent) => {
        if (modifiedContent !== undefined && modifiedContent !== null) {
            fs.writeFileSync(path, modifiedContent);
            return modifiedContent;
        }
        return content;
    });
}

function streamToString (stream) {
    const chunks = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    })
}

function pipeRequestToUrl(incomingReq, res, targetUrlString) {
    let u;
    try {
        u = new URL(targetUrlString);
    } catch (e) {
        if (!res.headersSent) {
            res.writeHead(400);
        }
        res.end();
        return;
    }

    const isHttps = u.protocol === 'https:';
    const client = isHttps ? https : http;
    const headers = { ...incomingReq.headers, host: u.host };
    const port = u.port || (isHttps ? 443 : 80);

    const proxyReq = client.request({
        protocol: u.protocol,
        hostname: u.hostname,
        port,
        path: u.pathname + u.search,
        method: incomingReq.method,
        headers
    }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
    });

    proxyReq.on('error', () => {
        if (!res.headersSent) {
            res.writeHead(502);
        }
        res.end();
    });

    incomingReq.pipe(proxyReq);
}

async function iterateFiles(path, callBack) {
    if (fs.lstatSync(path).isDirectory()) {
        await Promise.all(fs.readdirSync(path).map((p) => iterateFiles(`${path}/${p}`, callBack)));
    } else {
        await callBack && callBack(path);
    }
}

async function isExpoWebPreviewContainer(previewUrl) {
    const response = await axios.get(`${previewUrl}/rn-bundle/index.html`).catch((e) => e.response);
    return (
        response &&
        response.data &&
        response.data.includes('index.bundle') &&
        response.data.includes('platform=web')
    );
}

async function getDestPathForWindows(mode, projectDir = ''){
    let destHash = '';
    let destPath = '';
    let updatePath = '';
    let appendPath = '';

    if(mode == 'preview') {
        updatePath = `${projectDir}/target/generated-expo-app`;
    } else if (mode == 'build'){
        appendPath = '/' ;
    }

    destHash = crypto.createHash("shake256", { outputLength: 1 }).update(updatePath).digest("hex");
    destPath = path.resolve(`${global.rootDir}/${mode}/` + destHash + appendPath); 
    return  destPath;
}

module.exports = {
    isWindowsOS: isWindowsOS,
    readAndReplaceFileContent: readAndReplaceFileContent,
    iterateFiles: iterateFiles,
    streamToString: streamToString,
    pipeRequestToUrl: pipeRequestToUrl,
    isExpoWebPreviewContainer: isExpoWebPreviewContainer, 
    getDestPathForWindows: getDestPathForWindows
};