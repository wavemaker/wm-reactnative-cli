const { URL } = require('url');
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');
const prompt = require('prompt');
const axios = require('axios');
const os = require('os');
const qs = require('qs');
const semver = require('semver');
const { exec } = require('./exec');
const { unzip } = require('./zip');
const taskLogger = require('./custom-logger/task-logger')();
//const PULL_URL = '/studio/services/projects/${projectId}/vcs/remoteChanges';
const STORE_KEY = 'user.auth.token';
const MAX_REQUEST_ALLOWED_TIME = 5 * 60 * 1000;
const loggerLabel = 'project-sync-service';
let remoteBaseCommitId = '';
let WM_PLATFORM_VERSION = '';

async function findProjectId(config) {
    const projectList = (await axios.get(`${config.baseUrl}/edn-services/rest/users/projects/list`,
        {headers: {
            cookie: config.authCookie
        }})).data;
    const project = projectList.filter(p => p.displayName === config.projectName)
        .filter(p => (config.appPreviewUrl.endsWith(p.name + "_" + p.vcsBranchId)));
    if (project && project.length) {
        WM_PLATFORM_VERSION = project[0].platformVersion;
        return project[0].studioProjectId;
    }
}

async function downloadFile(res, tempFile){
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
}

async function downloadProject(projectId, config, projectDir) {
    try {
    const start = Date.now();
    logger.info({label: loggerLabel,message: 'downloading the project...'});
    taskLogger.start("downloading the project...");
    const tempFile = `${os.tmpdir()}/changes_${Date.now()}.zip`;
    if (semver.lt(WM_PLATFORM_VERSION, '11.4.0')) {
        const res = await axios.get(`${config.baseUrl}/studio/services/projects/${projectId}/vcs/gitInit`, {
            responseType: 'stream',
            headers: {
                cookie: config.authCookie
            }
         });
        await downloadFile(res, tempFile);
        const gitDir = path.join(projectDir, '.git');
        fs.mkdirpSync(gitDir);
        await unzip(tempFile, gitDir);
        await exec('git', ['restore', '.'], {cwd: projectDir});
    }
    else{
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
        await downloadFile(res, tempFile);
        const tempDir = path.join(`${os.tmpdir()}`, `project_${Date.now()}`);
        fs.mkdirpSync(tempDir);
        const gitDir = path.join(projectDir, '.git');
        if(fs.existsSync(gitDir)){
            await unzip(tempFile, gitDir);
            await exec('git', ['config', '--local', '--unset', 'core.bare'], {cwd: projectDir});
            await exec('git', ['restore', '.'], {cwd: projectDir});
        }
        else{
            await unzip(tempFile, tempDir);
            fs.rmSync(projectDir, { recursive: true, force: true });
            await exec('git', ['clone', "-b", "master", tempDir, projectDir]);
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
    logger.info({
        label: loggerLabel,
        message: `downloaded the project in (${Date.now() - start} ms).`
    });
    taskLogger.succeed(`downloaded the project in (${Date.now() - start} ms).`);
    fs.unlink(tempFile);
    } catch (e) {
        logger.info({
            label: loggerLabel,
            message: e+` The download of the project has encountered an issue. Please ensure that the preview is active.`
        });
        taskLogger.fail(e+` The download of the project has encountered an issue. Please ensure that the preview is active.`)
    }
}

async function gitResetAndPull(tempDir, projectDir){
    await exec('git', ['clean', '-fd'], {cwd: projectDir});
    await exec('git', ['fetch', path.join(tempDir, 'remoteChanges.bundle'), 'refs/heads/master'], {cwd: projectDir});
    await exec('git', ['reset', '--hard', 'FETCH_HEAD'], {cwd: projectDir});
}

async function pullChanges(projectId, config, projectDir) {
    try {
    const output = await exec('git', ['rev-parse', 'HEAD'], {
        cwd: projectDir
    });
    const headCommitId = output[0];
    logger.debug({label: loggerLabel, message: 'HEAD commit id is ' + headCommitId});
    logger.info({label: loggerLabel, message: 'pulling new changes from studio...'});
    taskLogger.start('pulling new changes from studio...');
    const tempDir = path.join(`${os.tmpdir()}`, `changes_${Date.now()}`);
    if (semver.lt(WM_PLATFORM_VERSION, '11.4.0')) {
        const tempFile = `${os.tmpdir()}/changes_${Date.now()}.zip`;
        console.log(tempFile);
        const res = await axios.get(`${config.baseUrl}/studio/services/projects/${projectId}/vcs/remoteChanges?headCommitId=${headCommitId}`, {
            responseType: 'stream',
            headers: {
                cookie: config.authCookie
            }
        });
        await downloadFile(res, tempFile);
        fs.mkdirpSync(tempDir);
        await unzip(tempFile, tempDir);
    
        await gitResetAndPull(tempDir, projectDir);
        await exec('git', ['apply', '--allow-empty', '--ignore-space-change', path.join(tempDir, 'patchFile.patch')], {cwd: projectDir});
        logger.debug({label: loggerLabel, message: 'Copying any uncommitted binary files'});
        copyContentsRecursiveSync(path.join(tempDir, 'binaryFiles'), projectDir);    
        fs.unlink(tempFile);
    }
    else{
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
        fs.mkdirpSync(tempDir);
        const tempFile = `${tempDir}/remoteChanges.bundle`;
        await downloadFile(res, tempFile);
        await gitResetAndPull(tempDir, projectDir);
        fs.unlink(tempFile);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    taskLogger.succeed('pulled new changes from studio');
    } catch (e) {
        logger.info({
            label: loggerLabel,
            message: e+` The attempt to execute "git pull" was unsuccessful. Please verify your connections.`
        });
        taskLogger.succeed( e+` The attempt to execute "git pull" was unsuccessful. Please verify your connections.`);
    }
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
    try {
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
    } catch (e) {
        logger.info({
            label: loggerLabel,
            message: e+` Your authentication has failed. Please proceed with a valid token.`
        });
    }
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
    if (previewUrl.endsWith('/')) {
        previewUrl = previewUrl.slice(0, -1);
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
    taskLogger.succeed("User Authenticated");
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
