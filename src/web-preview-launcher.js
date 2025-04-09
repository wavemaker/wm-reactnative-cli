const logger = require('./logger');
const fs = require('fs-extra');
const express = require('express');
const http = require('http');
const request = require('request');
const os = require('os');
const rimraf = require("rimraf");
const semver = require('semver');
const path = require('path');
const open = require('open');
const httpProxy = require('http-proxy');
const {
    exec
} = require('./exec');
const { readAndReplaceFileContent, streamToString } = require('./utils');
const axios = require('axios');
const { setupProject } = require('./project-sync.service');
const taskLogger = require('./custom-logger/task-logger').spinnerBar;
const { previewSteps } = require('./custom-logger/steps');
let webPreviewPort = 19006;
const proxyPort = 19009;
let proxyUrl = `http://localhost:${proxyPort}`;
const loggerLabel = 'expo-launcher';
let codegen = '';
let rnAppPath = '';
let packageLockJsonFile = '';
let basePath = '/rn-bundle/';
let expoVersion = '';
function launchServiceProxy(projectDir, previewUrl) {
    const proxy =  httpProxy.createProxyServer({});
    const wmProjectDir = getWmProjectDir(projectDir);
    http.createServer(function (req, res) {
        try {
            let tUrl = req.url;
            if (req.url.startsWith(basePath)) {
                tUrl = tUrl.replace(basePath, '');
            }
            tUrl = (tUrl.startsWith('/') ?  '' : '/') + tUrl;
            tUrl = `http://localhost:${webPreviewPort}${tUrl}`;
            if (req.url.endsWith('index.html')) {
                axios.get(tUrl).then(body => {
                    res.end(body.data
                        .replace('/index.bundle?', `./index.bundle?minify=true&`));
                });
                return;
            }
            if (req.url === '/') {
                res.writeHead(302, {'Location': `${basePath}index.html`});
                res.end();
            } else if (req.url.startsWith(basePath + '_/_')
                || req.url.startsWith(basePath + '_')) {
                req.url = req.url.replace(basePath + '_/_', '')
                            .replace(basePath + '_', '');
                proxy.web(req, res, {
                    target: previewUrl,
                    secure: false,
                    xfwd: false,
                    changeOrigin: true,
                    cookiePathRewrite: {
                        "*": ""
                    }
                });
            } else {
                req.headers.origin = `http://localhost:${webPreviewPort}`;
                const url = req.url;
                if (url.indexOf('/index.bundle') > 0 && req.headers &&req.headers.referer) {
                    let sourceMap = req.headers.referer.replace('/index.html', '') + '/index.map';
                    if (url.indexOf('?') > 0) {
                        sourceMap += url.substring(url.indexOf('?'));
                    }
                    res.setHeader('SourceMap', sourceMap);
                }
                res.setHeader('Content-Location', url);
                if (url.indexOf('/index.bundle') > 0) {
                    streamToString(request(tUrl)).then(content => {
                        content = content.replace(/"\/assets\/\?unstable_path=/g, `"/${basePath}/assets/?unstable_path=`);
                        res.write(content);
                        res.end();
                    });
                } else {
                    req.pipe(request(tUrl, function(error, res, body){
                        //error && console.log(error);
                    })).pipe(res);
                }
            } 
        } catch(e) {
            res.writeHead(500);
            console.error(e);
        }
    }).listen(proxyPort);
    proxy.on('proxyReq', function(proxyReq, req, res, options) {
        proxyReq.setHeader('sec-fetch-mode', 'no-cors');
        proxyReq.setHeader('origin', previewUrl);
        proxyReq.setHeader('referer', previewUrl);
    });
    proxy.on('error', function(e) {
        console.error(e);
    });
    proxy.on('proxyRes', function(proxyRes, req, res, options) {
        var cookies = proxyRes.headers['set-cookie'];
        if (cookies) {
            cookies = typeof cookies === 'string' ? [cookies] : cookies;
            cookies = cookies.map(c => c.replace(/;?\sSecure/, ''));
            proxyRes.headers['set-cookie'] = cookies;
        }
    });
    logger.info({
        label: loggerLabel,
        message: `Service proxy launched at ${proxyUrl} .`
    });
}

async function transpile(projectDir, previewUrl, incremental) {
    codegen || await getCodeGenPath(projectDir);
    const expoProjectDir = getExpoProjectDir(projectDir);
    let profile = 'expo-preview';
    if(fs.existsSync(`${codegen}/src/profiles/expo-web-preview.profile.js`)){
        profile = 'expo-web-preview';
        taskLogger.incrementProgress(2);
    }
    try {
    await exec('node',
        [codegen, 'transpile', '--profile="' + profile + '"', '--autoClean=false',
            `--incrementalBuild=${!!incremental}`,
            ...(rnAppPath ? [`--rnAppPath=${rnAppPath}`] : []),
            getWmProjectDir(projectDir), getExpoProjectDir(projectDir)]);
    taskLogger.incrementProgress(2);
    const configJSONFile = `${expoProjectDir}/wm_rn_config.json`;
    const config = fs.readJSONSync(configJSONFile);
    if(packageLockJsonFile){
        generatedExpoPackageLockJsonFile = path.resolve(`${getExpoProjectDir(expoProjectDir)}/package-lock.json`);
        await fs.copy(packageLockJsonFile, generatedExpoPackageLockJsonFile, { overwrite: false });
    }
    config.serverPath = `./_`;
    fs.writeFileSync(configJSONFile, JSON.stringify(config, null, 4));
    // TODO: iOS app showing blank screen
    if (!(config.sslPinning && config.sslPinning.enabled)) {
        await readAndReplaceFileContent(`${getExpoProjectDir(projectDir)}/App.js`, content => {
            return content.replace('if (isSslPinningAvailable()) {', 
                'if (false && isSslPinningAvailable()) {');
        });
    }
    } catch (e) {
        logger.error({
            label: loggerLabel,
            message: "Code Error: Kindly review and address the necessary corrections."
        });
    }   
    logger.info({
        label: loggerLabel,
        message: `generated expo project at ${getExpoProjectDir(projectDir)}`
    });
    taskLogger.info( `generated expo project at ${getExpoProjectDir(projectDir)}`);
    taskLogger.incrementProgress(2);
    taskLogger.succeed(previewSteps[3].succeed);
    await updateForWebPreview(projectDir); // Incorporating customized patches for any packages, if necessary.
}

async function updateForWebPreview(projectDir) {
    try {
    const packageFile = `${getExpoProjectDir(projectDir)}/package.json`;
    const package = JSON.parse(fs.readFileSync(packageFile, {
        encoding: 'utf-8'
    }));
    if (package['dependencies']['expo'] === '48.0.18') {
        webPreviewPort = 19000;
        expoVersion = '48.0.18';
        package.devDependencies['fs-extra'] = '^10.0.0';
        package.devDependencies['@babel/plugin-proposal-export-namespace-from'] = '7.18.9';
        delete package.devDependencies['esbuild'];
        delete package.devDependencies['esbuild-plugin-resolve'];
        fs.copySync(`${codegen}/src/templates/project/esbuild`, `${getExpoProjectDir(projectDir)}/esbuild`);
        await readAndReplaceFileContent(`${getExpoProjectDir(projectDir)}/babel.config.js`, content => {
            if (content.indexOf('@babel/plugin-proposal-export-namespace-from') < 0) {
                content = content.replace(`'react-native-reanimated/plugin',`, `
                '@babel/plugin-proposal-export-namespace-from',
                'react-native-reanimated/plugin',
                `)
            }
            return content.replace(`'transform-remove-console'`, '');
        });
        await readAndReplaceFileContent(`${getExpoProjectDir(projectDir)}/app.json`, content => {
            const appJson = JSON.parse(content);
            if (!appJson['expo']['web']['bundler']) {
                appJson['expo']['web']['bundler'] = 'metro';
            }
            return JSON.stringify(appJson, null, 4);
        });
    } else if (package['dependencies']['expo'] === '49.0.7') {
        expoVersion = '49.0.7';
        package.dependencies['react-native-svg'] = '13.4.0';
        package.dependencies['react-native-reanimated'] = '^1.13.2';
        package.dependencies['victory'] = '^36.5.3';
        package.devDependencies['fs-extra'] = '^10.0.0';
        delete package.devDependencies['esbuild'];
        delete package.devDependencies['esbuild-plugin-resolve'];
        fs.copySync(`${codegen}/src/templates/project/esbuild`, `${getExpoProjectDir(projectDir)}/esbuild`);
        readAndReplaceFileContent(`${getExpoProjectDir(projectDir)}/babel.config.js`, content => 
            content.replace(`'react-native-reanimated/plugin',`, ''));
    } else {
        expoVersion = package['dependencies']['expo'];
        package.dependencies['react-native-svg'] = '13.4.0';
        package.dependencies['victory'] = '^36.5.3';
        package.devDependencies['fs-extra'] = '^10.0.0';
        delete package.devDependencies['esbuild'];
        delete package.devDependencies['esbuild-plugin-resolve'];
        delete package.devDependencies['@expo/metro-config'];
        fs.copySync(`${codegen}/src/templates/project/esbuild`, `${getExpoProjectDir(projectDir)}/esbuild`);
    }
    fs.writeFileSync(packageFile, JSON.stringify(package, null, 4));
    await readAndReplaceFileContent(`${getExpoProjectDir(projectDir)}/esbuild/esbuild.script.js`, (content)=>{
        return content.replace('const esbuild', '//const esbuild').replace('const resolve', '//const resolve');
    });
    } catch (e) {
        logger.info({
            label: loggerLabel,
            message: `The package update has failed. ${e}`
        });
    }
}

async function getCodeGenPath(projectDir) {
    codegen = process.env.WAVEMAKER_STUDIO_FRONTEND_CODEBASE;
    if (codegen) {
        codegen = `${codegen}/wavemaker-rn-codegen/build`;
        let templatePackageJsonFile = path.resolve(`${process.env.WAVEMAKER_STUDIO_FRONTEND_CODEBASE}/wavemaker-rn-codegen/src/templates/project/package.json`);
        const packageJson = require(templatePackageJsonFile);
        if(semver.eq(packageJson["dependencies"]["expo"], "52.0.17")){
            packageLockJsonFile = path.resolve(`${__dirname}/../templates/package/packageLock.json`);
        } 
    } else {
        codegen = `${projectDir}/target/codegen/node_modules/@wavemaker/rn-codegen`;
        if (!fs.existsSync(`${codegen}/index.js`)) {
            const temp = projectDir + '/target/codegen';
            fs.mkdirSync(temp, {recursive: true});
            await exec('npm', ['init', '-y'], {
                cwd: temp
            });
            var pom = fs.readFileSync(`${projectDir}/pom.xml`, { encoding: 'utf-8'});
            var uiVersion = ((pom 
                && pom.match(/wavemaker.app.runtime.ui.version>(.*)<\/wavemaker.app.runtime.ui.version>/))
                || [])[1];
            await exec('npm', ['install', '--save-dev', `@wavemaker/rn-codegen@${uiVersion}`], {
                cwd: temp
            });
            let version = semver.coerce(uiVersion).version;
            if(semver.gte(version, '11.10.0')){
                rnAppPath = `${projectDir}/target/codegen/node_modules/@wavemaker/rn-app`;
                await exec('npm', ['install', '--save-dev', `@wavemaker/rn-app@${uiVersion}`], {
                    cwd: temp
                });
            }
        }
    }
    await readAndReplaceFileContent(`${codegen}/src/profiles/expo-preview.profile.js`, (content) => {
        return content.replace('copyResources: true', 'copyResources: false');
    });
}

async function installDependencies(projectDir) {
    try {
    taskLogger.start(previewSteps[4].start);
    taskLogger.setTotal(previewSteps[4].total);
    const expoDir = getExpoProjectDir(projectDir);
    if (fs.existsSync(`${expoDir}/node_modules/expo`)) {
        return;
    }
    logger.info({
        label: loggerLabel,
        message: "Dependency installation process initiated..."
      });
    taskLogger.incrementProgress(1);
    await exec('npm', ['install'], {
        cwd: expoDir
    });
    taskLogger.incrementProgress(2);
    await exec('node', ['./esbuild/esbuild.script.js', '--prepare-lib'], {
        cwd: expoDir
    });
    fs.copySync(
        `${expoDir}/esbuild/node_modules`, 
        `${expoDir}/node_modules`,
        {
        overwrite: true
        });
    const nodeModulesDir = `${expoDir}/node_modules/@wavemaker/app-rn-runtime`;
    // To remove openBrowser()
    readAndReplaceFileContent(`${expoDir}/node_modules/open/index.js`, (c) => c.replace("const subprocess", 'return;\n\nconst subprocess'));
    readAndReplaceFileContent(`${expoDir}/node_modules/@expo/cli/build/src/utils/open.js`, (c) => c.replace('if (process.platform !== "win32")', 'return;\n\n if (process.platform !== "win32")'));
    readAndReplaceFileContent(`${nodeModulesDir}/core/base.component.js`, (c) => c.replace(/\?\?/g, '||'));
    readAndReplaceFileContent(`${nodeModulesDir}/components/advanced/carousel/carousel.component.js`, (c) => c.replace(/\?\?/g, '||'));
    readAndReplaceFileContent(`${nodeModulesDir}/components/input/rating/rating.component.js`, (c) => c.replace(/\?\?/g, '||'));
    if(expoVersion != '52.0.17'){
        readAndReplaceFileContent(`${expoDir}/node_modules/expo-camera/build/useWebQRScanner.js`, (c) => {
            if (c.indexOf('@koale/useworker') > 0) {
                return fs.readFileSync(`${__dirname}/../templates/expo-camera-patch/useWebQRScanner.js`, {
                    encoding: 'utf-8'
                })
            }
            return c;
        });    
    }
    await readAndReplaceFileContent(`${expoDir}/node_modules/expo-font/build/ExpoFontLoader.web.js`, (content)=>{
        if(expoVersion == '52.0.17'){
            return content.replace(/src\s*:\s*url\(\$\{resource\.uri\}\);/g, 'src:url(.${resource.uri.replace("//rn-bundle//","/")});');
        }
        return content.replace(/src\s*:\s*url\(\$\{resource\.uri\}\);/g, 'src:url(.${resource.uri});');
    });
    // https://github.com/expo/expo/issues/24273#issuecomment-2132297993
    await readAndReplaceFileContent(`${expoDir}/node_modules/@expo/metro-config/build/serializer/environmentVariableSerializerPlugin.js`, (content)=>{
        content = content.replace('getEnvPrelude(str)', '//getEnvPrelude(str)');
        return content.replace('// process.env', '// process.env \n firstModule.output[0].data.code = firstModule.output[0].data.code + str;');
    });
    taskLogger.succeed(previewSteps[4].succeed);
    } catch (e) {
        logger.error({
            label: loggerLabel,
            message: e+' Encountered an error while installing dependencies.'
          });
        taskLogger.error(e+' Encountered an error while installing dependencies.');
    }
}

function clean(path) {
    if (fs.existsSync(path)) {
        rimraf.sync(path, {recursive: true});
    }
    fs.mkdirSync(path, {recursive: true});
}

async function getProjectName(previewUrl) {
    return JSON.parse(
        (await axios.get(`${previewUrl}/services/application/wmProperties.js`))
            .data.split('=')[1].replace(';', '')).displayName;
}

function getWmProjectDir(projectDir) {
    return `${projectDir}/src/main/webapp`;
}

function getExpoProjectDir(projectDir) {
    return `${projectDir}/target/generated-expo-web-app`;
}

async function setup(previewUrl, _clean, authToken) {
    taskLogger.setTotal(previewSteps[0].total);
    taskLogger.start(previewSteps[0].start);
    const projectName = await getProjectName(previewUrl);
    const projectDir = `${global.rootDir}/wm-projects/${projectName.replace(/\s+/g, '_').replace(/\(/g, '_').replace(/\)/g, '_')}`;
    if (_clean) {
        clean(projectDir);
    } else {
        fs.mkdirpSync(getWmProjectDir(projectDir));
    }
    taskLogger.incrementProgress(1);
    taskLogger.succeed(previewSteps[0].succeed);
    const syncProject = await setupProject(previewUrl, projectName, projectDir, authToken);
    taskLogger.start(previewSteps[3].start);
    taskLogger.setTotal(previewSteps[3].total);
    await transpile(projectDir, previewUrl, false);
    await installDependencies(projectDir);
    return {projectDir, syncProject};
}

async function watchProjectChanges(previewUrl, onChange, lastModifiedOn) {
    try {
        const response = await axios.get(`${previewUrl}/rn-bundle/index.html`, {
            headers: {
                'if-modified-since' : lastModifiedOn || new Date().toString()
            }
        }).catch((e) => e.response);
        if (response.status === 200 && response.data.indexOf('<title>WaveMaker Preview</title>') > 0) {
            lastModifiedOn = response.headers['last-modified'];
            onChange();
        }
    } catch(e) {
        logger.debug({
            label: loggerLabel,
            message: e
        });
    }
    setTimeout(() => watchProjectChanges(previewUrl, onChange, lastModifiedOn), 5000);
}

function getLastModifiedTime(path) {
    if (fs.existsSync(path)) {
        return fs.lstatSync(path).mtime || 0;
    }
    return 0;
}

let lastKnownModifiedTime = {
    'rn-runtime': 0,
    'rn-codegen': 0,
    'ui-variables': 0,
};
function watchForPlatformChanges(callBack) {
    let codegen = process.env.WAVEMAKER_STUDIO_FRONTEND_CODEBASE;
    if (!codegen) {
        return;
    }
    setTimeout(() => {
        let currentModifiedTime = {
            'rn-runtime': getLastModifiedTime(`${codegen}/wavemaker-rn-runtime/dist/new-build`),
            'rn-codegen': getLastModifiedTime(`${codegen}/wavemaker-rn-codegen/dist/new-build`),
            'ui-variables': getLastModifiedTime(`${codegen}/wavemaker-ui-variables/dist/new-build`),
        };

        if (!lastKnownModifiedTime || !lastKnownModifiedTime['rn-runtime']) {
            lastKnownModifiedTime = currentModifiedTime;
        }
        
        const doBuild = lastKnownModifiedTime['rn-runtime'] < currentModifiedTime['rn-runtime']
                || lastKnownModifiedTime['rn-codegen'] < currentModifiedTime['rn-codegen']
                || lastKnownModifiedTime['ui-variables'] < currentModifiedTime['ui-variables'];
        
        
        lastKnownModifiedTime = currentModifiedTime;

        if (doBuild && callBack) {
            console.log('\n\n\n')
            logger.info({
                label: loggerLabel,
                message: 'Platform Changed. Building again.'
            });
            callBack().then(() => {
                watchForPlatformChanges(callBack);
            });
        } else {
            watchForPlatformChanges(callBack);
        }
    }, 5000);
}

async function runWeb(previewUrl, clean, authToken) {
    logger.info({
        label: loggerLabel,
        message: `Local preview processing has started. Please ensure that the preview is active.`
    });
    try {
        const {projectDir, syncProject} = await setup(previewUrl, clean, authToken);
        let isExpoStarted = false;
        watchProjectChanges(previewUrl, () => {
            const startTime = Date.now();
            syncProject()
            .then(() => {
                logger.info({
                    label: loggerLabel,
                    message: `Sync Time: ${(Date.now() - startTime)/ 1000}s.`
                });
            })
            .then(() => {
                return transpile(projectDir, previewUrl, true).then(() => {
                    if (!isExpoStarted) {
                        isExpoStarted = true;
                        launchServiceProxy(projectDir, previewUrl);
                        return exec('npx', ['expo', 'start', '--web', '--offline', `--port=${webPreviewPort}`], {
                            cwd: getExpoProjectDir(projectDir)
                        });
                    }
                }).then(() => {
                    isExpoStarted = true;
                    logger.info({
                        label: loggerLabel,
                        message: `Total Time: ${(Date.now() - startTime)/ 1000}s.`
                    });
                });
            });
        });
        watchForPlatformChanges(() => transpile(projectDir, previewUrl, false));
    } catch(e) {
        logger.error({
            label: loggerLabel,
            message: e
        });
    }
}

module.exports = {
    runWeb: (previewUrl, clean, authToken, proxyHost, _basePath) => {
        proxyHost = proxyHost || 'localhost';
        proxyUrl = `http://${proxyHost}:${proxyPort}`;
        basePath = _basePath;
        return runWeb(previewUrl, clean, authToken);
    }
};
