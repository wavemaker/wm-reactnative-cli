const fs = require('fs');
const os = require('os');
const axios = require('axios');

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

async function iterateFiles(path, callBack) {
    if (fs.lstatSync(path).isDirectory()) {
        await Promise.all(fs.readdirSync(path).map((p) => iterateFiles(`${path}/${p}`, callBack)));
    } else {
        await callBack && callBack(path);
    }
}

async function isExpoWebPreviewContainer(previewUrl) {
    const response = await axios.get(`${previewUrl}/rn-bundle/index.html`).catch((e) => e.response);
    return response.data.includes("index.bundle") && response.data.includes("platform=web");
}

module.exports = {
    isWindowsOS: isWindowsOS,
    readAndReplaceFileContent: readAndReplaceFileContent,
    iterateFiles: iterateFiles,
    streamToString: streamToString,
    isExpoWebPreviewContainer: isExpoWebPreviewContainer
};