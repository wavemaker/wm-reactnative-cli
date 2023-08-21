const { URL } = require('url');
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');
const prompt = require('prompt');
const axios = require('axios');
const os = require('os');
const qs = require('qs');
const { exec } = require('./exec');
const { unzip } = require('./zip');
//const PULL_URL = '/studio/services/projects/${projectId}/vcs/remoteChanges';
const STORE_KEY = 'user.auth.token';
const MAX_REQUEST_ALLOWED_TIME = 5 * 60 * 1000;
const loggerLabel = 'project-sync-service';
let remoteBaseCommitId = '';

async function findProjectId(config) {
    const projectList = (await axios.get(`${config.baseUrl}/edn-services/rest/users/projects/list`,
        {headers: {
            cookie: config.authCookie
        }})).data;
    const project = projectList.filter(p => p.displayName === config.projectName)
        .filter(p => (config.appPreviewUrl.indexOf(p.name + "_" + p.vcsBranchId) >= 0));
    return project && project.length && project[0].studioProjectId;
}

async function downloadProject(projectId, config, projectDir) {
    const start = Date.now();
    logger.info({label: loggerLabel,message: 'downloading the project...'});
    const tempFile = `${os.tmpdir()}/changes_${Date.now()}.zip`;
    const gitInfo = await axios.get(`${config.baseUrl}/studio/services/projects/${projectId}/vcs/gitBare`, {
       responseType: 'application/json',
       headers: {
           cookie: config.authCookie
       }
    });
    if(gitInfo.status !== 200){
        throw new Error('failed to download the project');
    }
    const fileId = gitInfo.data.fileId;
    remoteBaseCommitId = gitInfo.data.remoteBaseCommitId;
    const res = await axios.get(`${config.baseUrl}/file-service/${fileId}`, {
        responseType: 'stream',
        headers: {
            cookie: config.authCookie
        }
    })
    if (res.status !== 200) {
        throw new Error('failed to download the project');
    }
    await new Promise((resolve, reject) => {
        const fw = fs.createWriteStream(tempFile);
        res.data.pipe(fw);
        fw.on('error', err => {
            reject(err);
            fw.close();
        });
        fw.on('close', resolve);
    });
    const tempDir = path.join(`${os.tmpdir()}`, `project_${Date.now()}`);
    fs.mkdirpSync(tempDir);
    if(!fs.existsSync(projectDir+"/.git/")){
        await unzip(tempFile, tempDir);
        await exec('git', ['clone', tempDir, projectDir]);
    }
    logger.info({
        label: loggerLabel,
        message: `downloaded the project in (${Date.now() - start} ms).`
    });
    fs.rmdir(tempDir, { recursive: true, force: true });
    fs.unlink(tempFile);
}

async function pullChanges(projectId, config, projectDir) {
    const output = await exec('git', ['rev-parse', 'HEAD'], {
        cwd: projectDir
    });
    const headCommitId = output[0];
    logger.debug({label: loggerLabel, message: 'HEAD commit id is ' + headCommitId});
    logger.info({label: loggerLabel, message: 'pulling new changes from studio...'});
    const gitInfo = await axios.get(`${config.baseUrl}/studio/services/projects/${projectId}/vcs/pull?lastPulledWorkspaceCommitId=${headCommitId}&lastPulledRemoteHeadCommitId=${remoteBaseCommitId}`, {
        responseType: 'application/json',
        headers: {
            cookie: config.authCookie
        }
    });
    if (gitInfo.status !== 200) {
        throw new Error('failed to pull project changes');
    }
    const fileId = gitInfo.data.fileId;
    remoteBaseCommitId = gitInfo.data.remoteBaseCommitId;
    const res = await axios.get(`${config.baseUrl}/file-service/${fileId}`, {
        responseType: 'stream',
        headers: {
            cookie: config.authCookie
        }
    })
    const tempDir = path.join(`${os.tmpdir()}`, `changes_${Date.now()}`);
    fs.mkdirpSync(tempDir);
    const tempFile = `${tempDir}/remoteChanges.bundle`;
    if (res.status !== 200) {
        throw new Error('failed to pull project changes');
    }
    await new Promise((resolve, reject) => {
        const fw = fs.createWriteStream(tempFile);
        res.data.pipe(fw);
        fw.on('error', err => {
            reject(err);
            fw.close();
        });
        fw.on('close', resolve);
    });
    await exec('git', ['reset', '--hard', 'master'], {cwd: projectDir});
    await exec('git', ['clean', '-fd'], {cwd: projectDir});
    await exec('git', ['pull', path.join(tempDir, 'remoteChanges.bundle'), 'master'], {cwd: projectDir});
    fs.rmdir(tempDir, { recursive: true, force: true });
    fs.unlink(tempFile);
}

function copyContentsRecursiveSync(src, dest) {
  fs.readdirSync(src).forEach(function(file) {
      var childSrc = path.join(src, file);
      var childDest = path.join(dest, file);
      var exists = fs.existsSync(childSrc);
      var stats = exists && fs.statSync(childSrc);
      var isDirectory = exists && stats.isDirectory();
      if (isDirectory) {
          if (!fs.existsSync(childDest)) {
              fs.mkdirSync(childDest);
          }
          copyContentsRecursiveSync(childSrc, childDest);
      } else {
	fs.copyFileSync(childSrc, childDest);
      }
  });
}

function extractAuthCookie(res) {
    const headers = res && res.response && res.response.headers;
    if (!headers) {
        return;
    }
    const result = headers['set-cookie'].filter(s => s.indexOf('auth_cookie') >= 0);
    if (result.length) {
        return result[0].split(';')[0];
    }
}

async function authenticateWithUserNameAndPassword(config) {
    const credentials = await getUserCredentials();
    return axios.post(`${config.baseUrl}/login/authenticate`, 
        qs.stringify({
            j_username: credentials.username,
            j_password: credentials.password
        }), {
            maxRedirects: 0
    }).catch((res) => {
        const cookie = extractAuthCookie(res);
        if (!cookie) {
            console.log('Not able to login. Try again.');
            return authenticate(config);
        }
        return cookie;
    });
}

async function authenticateWithToken(config, showHelp) {
    if (showHelp) {
        console.log('***************************************************************************************');
        console.log('* Please open the below url in the browser, where your WaveMaker studio is opened.    *');
        console.log('* Copy the response content and paste in the terminal.                                *');
        console.log('***************************************************************************************');
        console.log(`\n\n`);
        console.log(`${config.baseUrl}/studio/services/auth/token`);
        console.log(`\n\n`);
    }
    const cookie = (await getAuthToken()).token.split(';')[0];
    if (!cookie) {
        console.log('Not able to login. Try again.');
        return authenticateWithToken(config);
    }
    return 'auth_cookie='+cookie;
}

function getUserCredentials() {
    var schema = {
        properties: {
            username: {
                required: true
            },
            password: {
                required: true,
                hidden: true
            }
        }
      };
    prompt.start();
    return new Promise((resolve, reject) => {
        prompt.get(schema, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

function getAuthToken() {
    var schema = {
        properties: {
            token: {
                required: true
            }
        }
      };
    prompt.start();
    return new Promise((resolve, reject) => {
        prompt.get(schema, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

async function checkAuthCookie(config) {
    try {
        await findProjectId(config);
        logger.info({
            label: loggerLabel,
            message: `user authenticated.`
        });
    } catch(e) {
        return false;
    }
    return true;
}

async function setup(previewUrl, projectName, authToken) {
    if (authToken) {
        authToken = 'auth_cookie=' + authToken;
    }
    const config = {
        authCookie : authToken || global.localStorage.getItem(STORE_KEY) || '',
        baseUrl: new URL(previewUrl).origin,
        appPreviewUrl: previewUrl,
        projectName: projectName
    };
    const isAuthenticated = await checkAuthCookie(config);
    if (!isAuthenticated) {
        //console.log(`Need to login to Studio (${config.baseUrl}). \n Please enter your Studio credentails.`);
        //config.authCookie = await authenticateWithUserNameAndPassword(config);
        config.authCookie = await authenticateWithToken(config, true);
    }
    global.localStorage.setItem(STORE_KEY, config.authCookie);
    return config;
}

async function setupProject(previewUrl, projectName, toDir, authToken) {
    const config = await setup(previewUrl, projectName, authToken);
    const projectId = await findProjectId(config);
    await downloadProject(projectId, config, toDir);
    return () => pullChanges(projectId, config, toDir);
};

module.exports = {
    setupProject : setupProject
};
