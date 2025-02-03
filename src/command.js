const fs = require('fs-extra');
const logger = require('./logger');
const plist = require('plist');
const path = require('path');
const android = require('./android');
const { unzip } = require('./zip');
let { showConfirmation,VERSIONS, 
    canDoAndroidBuild, canDoIosBuild, canDoEmbed 
} = require('./requirements');

const {
    exec
} = require('./exec');

const crypto = require('crypto');
const config = require('./config');
const ios = require('./ios');
const { resolve } = require('path');
const { isWindowsOS, readAndReplaceFileContent } = require('./utils');
const taskLogger = require('./custom-logger/task-logger')();
const loggerLabel = 'wm-reactnative-cli';

function getFileSize(path) {
    const stats = path && fs.statSync(path);
    return (stats && stats['size']) || 0;
}

async function updatePackageJsonFile(path) {
    try {
        let data = fs.readFileSync(path, 'utf-8');
        //downgrading expo-av to 11 to address the build failure issue
        data = data.replace(/"expo-av"[\s]*:[\s]*"~13.0.1"/, '"expo-av": "~11.0.1"');
        const jsonData = JSON.parse(data);
        jsonData['main'] = "index";
        if (config.embed) {
            jsonData['dependencies']['@wavemaker/expo-native-module'] = "latest";
        }
        if(!jsonData['devDependencies']['@babel/plugin-proposal-optional-chaining']){
            jsonData['devDependencies']['@babel/plugin-proposal-optional-chaining'] = "^7.21.0";
        }
        if(!jsonData['devDependencies']['@babel/plugin-proposal-nullish-coalescing-operator']){
            jsonData['devDependencies']['@babel/plugin-proposal-nullish-coalescing-operator'] = "^7.18.6";
        }
        if (!jsonData['dependencies']['lottie-react-native']
            || jsonData['dependencies']['lottie-react-native'] === '5.1.5') {
            jsonData['dependencies']['lottie-react-native'] = "^5.1.5";
            jsonData['dependencies']['react-lottie-player'] = "^1.5.4";
        }
        if (jsonData['dependencies']['expo-file-system'] === '^15.1.1') {
            jsonData['dependencies']['expo-file-system'] = '15.2.2'
        }
        if (jsonData['dependencies']['axios'] === '^1.4.0') {
            jsonData['dependencies']['axios'] = '1.6.8';
        }
        const resolutions = jsonData["resolutions"] || {};
        if (!resolutions['expo-application']) {
            resolutions['expo-application'] = '5.8.4';
        }
        if (!resolutions['axios']) {
            resolutions['axios'] = '1.6.8';
        }
        if (jsonData['dependencies']['expo'] === '50.0.17') {
            resolutions['metro'] = '0.80.9';
        }
        jsonData["resolutions"] = resolutions;
        if (config.platform === 'android') {
            jsonData['dependencies']['@react-native-cookies/cookies'] = '6.2.1';
        }
        fs.writeFileSync(path, JSON.stringify(jsonData), 'utf-8');
        logger.info({
            'label': loggerLabel,
            'message': 'updated package.json file'
        });
    } catch (e) {
        resolve('error', e);
    }
}

function updateAppJsonFile(src) {
    const path = (src || config.src) + 'app.json';
    logger.info({
        label: loggerLabel,
        message: 'path at app.json ' + path
    })
    try {
        if (fs.existsSync(path)) {
            let data = fs.readFileSync(path, 'utf8');
            const jsonData = JSON.parse(data);
            jsonData['expo']['name'] = config.metaData.name;
            jsonData['expo']['slug'] = config.metaData.name;
            jsonData['expo']['android']['package'] = config.metaData.id;
            jsonData['expo']['ios']['bundleIdentifier'] = config.metaData.id;
            jsonData['expo']['jsEngine'] = config.metaData.preferences.enableHermes ? 'hermes' : 'jsc';
            jsonData['expo']['icon'] = config.metaData.icon.src;
            jsonData['expo']['splash']['image'] = config.metaData.splash.src;
            jsonData['expo']['android']['adaptiveIcon']['foregroundImage'] = config.metaData.icon.src;
            fs.writeFileSync(path, JSON.stringify(jsonData), 'utf-8');
        }
    } catch (e) {
        resolve('error', e);
    }
}

 async function build(args) {
    const directories = await setupBuildDirectory(args.src, args.dest, args.platform);
    if (!directories) {
        return {
            success : false,
            errors: 'could not setup the build directories.'
        };
    }
    args.src = directories.src;
    args.dest = directories.dest;
 
    config.metaData = await readWmRNConfig(args.src);

    if (config.metaData.icon.src.startsWith('resources')) {
        config.metaData.icon.src = 'assets/' + config.metaData.icon.src;
    }
    if (config.metaData.splash.src.startsWith('resources')) {
        config.metaData.splash.src = 'assets/' + config.metaData.splash.src;
    }

     config.platform = args.platform;
     
     if (args.dest) {
        args.dest = path.resolve(args.dest) + '/';
     }
    taskLogger.succeed("Setup directories finished");

    await prepareProject(args);
    if (args.targetPhase === 'PREPARE')
    {
        return;
    }
    if (!args.autoEject) {
        const response = await showConfirmation(
            'Would you like to eject the expo project (yes/no) ?'
        );
        if (response !== 'y' && response !== 'yes') {
            process.exit();
        }
    }
    let response;
    if (args.dest) {
        if (!config.metaData.ejected) {
            response = await ejectProject(args);
        }
    } else {
        response = await ejectProject(args);
    }

    if (response && response.errors) {
        return response;
    }

    if (args.ejectProject || config.embed)  {
        return;
    }

    if (args.dest) {
        config.src = args.dest;
    }
    // TODO: iOS app showing blank screen
    if (!(config.metaData.sslPinning && config.metaData.sslPinning.enabled)) {
        await readAndReplaceFileContent(`${config.src}/App.js`, content => {
            return content.replace('if (isSslPinningAvailable()) {', 
                'if (false && isSslPinningAvailable()) {');
        });
    }

    if(args.architecture && args.platform==='android') {
        await readAndReplaceFileContent(`${config.src}/android/gradle.properties`, content => {
            return content.replace(/^reactNativeArchitectures=.*$/m,`reactNativeArchitectures=${args.architecture.join(',')}`);
        })
    }

    config.outputDirectory = config.src + 'output/';
    config.logDirectory = config.outputDirectory + 'logs/';
    logger.info({
        label: loggerLabel,
        message: `Building at : ${config.src}`
    });

    taskLogger.info(`Building at : ${config.src}`);

    try {
        let result;
        // await clearUnusedAssets(config.platform);
        if (config.platform === 'android') {
            result = await android.invokeAndroidBuild(args);
        } else if (config.platform === 'ios') {
            try{
                taskLogger.start("Installing pods....")
                await exec('pod', ['install'], {
                    cwd: config.src + 'ios'
                });
            }catch(e){
                taskLogger.fail("Pod install failed");
            }
            result = await ios.invokeiosBuild(args);
        }
        if (result.errors && result.errors.length) {
            logger.error({
                label: loggerLabel,
                message: args.platform + ' build failed due to: \n\t' + result.errors.join('\n\t')
            });
            taskLogger.fail(args.platform + ' build failed due to: \n\t' + result.errors.join('\n\t'));
        } else if (!result.success) {
            logger.error({
                label: loggerLabel,
                message: args.platform + ' BUILD FAILED'
            });
            taskLogger.fail(args.platform + ' BUILD FAILED');
        } else {
            logger.info({
                label: loggerLabel,
                message: `${args.platform} BUILD SUCCEEDED. check the file at : ${result.output}.`
            });
            taskLogger.info(`${args.platform} BUILD SUCCEEDED. check the file at : ${result.output}.`);
            logger.info({
                label: loggerLabel,
                message: `File size : ${Math.round(getFileSize(result.output) * 100 / (1024 * 1024)) / 100} MB.`
            });
            taskLogger.info(`File size : ${Math.round(getFileSize(result.output) * 100 / (1024 * 1024)) / 100} MB.`);
        }
        return result;
    } catch(e) {
        logger.error({
            label: loggerLabel,
            message: 'BUILD Failed. Due to :' + e
        });
        taskLogger.fail('BUILD Failed. Due to :' + e);
        return {
            success : false,
            errors: e
         };
    }
}

async function extractRNZip(src)  {
    let folderName = isWindowsOS() ? src.split('\\').pop() : src.split('/').pop();
    const isZipFile = folderName.endsWith('.zip');

    folderName = isZipFile ? folderName.replace('.zip', '') : folderName;

    const tmp = `${require('os').homedir()}/.wm-reactnative-cli/temp/${folderName}/${Date.now()}`;

    if (src.endsWith('.zip')) {
        const zipFile = src;
        src = tmp + '/src';

        if (!fs.existsSync(src)) {
            fs.mkdirsSync(src);
        }
        await unzip(zipFile, src);
    }
    return path.resolve(src) + '/';
}

async function setupBuildDirectory(src, dest, platform) {
    src = await extractRNZip(src);
    const metadata = await readWmRNConfig(src);
    if (fs.existsSync(dest)) {
        if (fs.readdirSync(dest).length) {
            const response = await showConfirmation('Would you like to empty the dest folder (i.e. ' + dest + ') (yes/no) ?');
            if (response !== 'y' && response !== 'yes') {
                // logger.error({
                //     label: loggerLabel,
                //     message: 'Non empty folder cannot be used as desination. Please choose a different destination and build again.'
                // });
                // return;
            }else{
                // using removeSync when dest is directory and unlinkSync works when dest is file.
                const fsStat = fs.lstatSync(dest);
                if (fsStat.isDirectory()) {
                    fs.removeSync(dest);
                } else if (fsStat.isFile()) {
                    fs.unlinkSync(dest);
                }   
            }
        }
    }
    dest = dest || await getDefaultDestination(metadata.id, platform);
    if(isWindowsOS()){
        const buildDirHash = crypto.createHash("shake256", { outputLength: 8 }).update(dest).digest("hex");
        dest = path.resolve(`${global.rootDir}/wm-build/` + buildDirHash + "/");
    }
    dest = path.resolve(dest)  + '/';
    if(src === dest) {
        logger.error({
            label: loggerLabel,
            message: 'source and destination folders are same. Please choose a different destination.'
        });
        return;
    }
    fs.mkdirsSync(dest);
    fs.copySync(src, dest);
    const logDirectory = dest + 'output/logs/';
    fs.mkdirSync(logDirectory, {
        recursive: true
    });
    logger.setLogDirectory(logDirectory);
    return {
        src: src,
        dest: dest
    };
}

async function getDefaultDestination(id, platform) {
    const version = '1.0.0';
    const path = `${require('os').homedir()}/.wm-reactnative-cli/build/${id}/${version}/${platform}`;
    fs.mkdirSync(path, {
        recursive: true
    });
    let next = 1;
    if (fs.existsSync(path)) {
        next = fs.readdirSync(path).reduce((a, f) => {
            try {
                const c = parseInt(f);
                if (a <= c) {
                    return c + 1;
                }
            } catch(e) {
                //not a number
            }
            return a;
        }, next);
    }
    const dest = path + '/' + next;
    fs.mkdirSync(dest, {
        recursive: true
    });
    return dest;
}

async function readWmRNConfig(src) {
    src = path.resolve(src) + '/';
    let jsonPath = src + 'wm_rn_config.json';
    let data = await fs.readFileSync(jsonPath);
    data = JSON.parse(data);
    data.preferences = data.preferences || {};
    data.preferences.enableHermes = true;
    return data;
}

async function writeWmRNConfig(content) {
    src = path.resolve(config.src) + '/';
    let jsonPath = src + 'wm_rn_config.json';
    let data = await fs.readFileSync(jsonPath);
    data = JSON.parse(data);
    if (content) {
        Object.assign(data, content);
    }
    await fs.writeFile(jsonPath, JSON.stringify(data), error => {
        if (error) {
            throw error;
        }
        logger.info({
            'label': loggerLabel,
            'message': 'updated wm_rn_config.json file'
        })
    })
}

// src points to unzip proj
async function ejectProject(args) {
    try {
        if(args.platform){
            await exec('npx', ['expo','prebuild', "--platform", args.platform], {
                cwd: config.src
            });
        }else{
            await exec('npx', ['expo','prebuild'], {
                cwd: config.src
            });
        }
        logger.info({
            label: loggerLabel,
            message: 'expo eject succeeded',
        });
        if (args.localrnruntimepath) {
            const linkFolderPath =
            config.src + 'node_modules/@wavemaker/app-rn-runtime';
            // using removeSync when target is directory and unlinkSync works when target is file.
            if (fs.existsSync(linkFolderPath)) {
                fs.removeSync(linkFolderPath);
            }
            await fs.mkdirsSync(linkFolderPath);
            await fs.copySync(args.localrnruntimepath, linkFolderPath);
            logger.info({
                label: loggerLabel,
                message: 'copied the app-rn-runtime folder',
            });
            taskLogger.info("copied the app-rn-runtime folder");
        }
        taskLogger.succeed("Project ejected successfully.");
    } catch (e) {
        logger.error({
            label: loggerLabel,
            message: args.platform + ' eject project Failed. Due to :' + e,
        });
        taskLogger.fail("Project ejection failed.");
        return { errors: e, success: false };
    }
}

async function prepareProject(args) {
    try {
        taskLogger.start("Verifying prerequisites...");
        config.src = args.dest;
        logger.info({
            label: loggerLabel,
            message: 'destination folder where app is build at ' + args.dest,
        });
        taskLogger.info('destination folder where app is build at ' + args.dest);
        if (!args.platform) {
            args.platform = 'android';
        }
        config.platform = args.platform;
        config.buildType = args.buildType;

        if (args.platform !== 'android') {
            VERSIONS.JAVA = '1.8.0';
        }
        const prerequisiteError = {
            errors: 'check if all prerequisites are installed.',
            success: false
        };
        if (config.embed) {
            if (!await canDoEmbed()) {
                return prerequisiteError;
            }
        }
        if (args.platform === 'android') {
            if (!await canDoAndroidBuild()) {
                return prerequisiteError;
            }
        }
        if (args.platform === 'ios') {
            if (!await canDoIosBuild()) {
                return prerequisiteError;
            }
        }
        taskLogger.succeed("All required prerequisites are met.");
        taskLogger.start("Installing dependencies...");
        updateAppJsonFile(config.src);
        logger.info({
            label: loggerLabel,
            message: 'app.json updated.... ' + args.dest
        })
        await updatePackageJsonFile(config.src + 'package.json');
        try{
            await exec('yarn', ['install'], {
                cwd: config.src
            });
        }catch(e){
            taskLogger.fail("Dependency installation failed.");
        }
        taskLogger.succeed("All dependencies installed successfully.")
    } catch (e) {
        logger.error({
            label: loggerLabel,
            message: args.platform + ' prepare project Failed. Due to :' + e,
        });
        taskLogger.fail(args.platform + ' prepare project Failed. Due to :' + e);
        return { errors: e, success : false };
    }
}

async function clearUnusedAssets(platform) {
    await readAndReplaceFileContent(config.src + 'app.theme.js', (content) => {
        if (platform === 'ios') {
            return content.replace(/ios:\s\{(.|\n)*?\},?/gm, ``);
        }
        return content.replace(/android:\s\{(.|\n)*?\},?/gm, ``);
    });
    logger.info({
        'label': loggerLabel,
        'message': '***** updated theme related files based on selected platform ...***'
    });

    const folderToExclude = platform === 'android' ? 'ios' : 'android';
    const path = config.src + 'theme/' + folderToExclude;
    if (fs.existsSync(path)) {
        const fsStat = fs.lstatSync(path);
        if (fsStat.isDirectory()) {
            fs.removeSync(path);
        } else if (fsStat.isFile()) {
            fs.unlinkSync(path);
        }
        logger.info({
            'label': loggerLabel,
            'message': '***** Removed the unused platform theme folder ...***'
        });
    }
}

module.exports = {
    ejectProject: (args) => {
        args.autoEject = true;
        args.ejectProject = true;
        args.platform === 'expo'
        build(args);
    },
    embed: async (args) => {
        args.autoEject = true;
        config.embed = true;
        await build(args);
        if (args.platform === 'android') {
            await android.embed(args);
            logger.info({
                label: loggerLabel,
                message: `Build Success. Check the embedded project at : ${args.dest}android-embed.`
            });
        } else if (args.platform === 'ios') {
            await ios.embed(args);
            logger.info({
                label: loggerLabel,
                message: `Build Success. Check the embedded project at : ${args.dest}ios-embed.`
            });
        }
    },
    build: build,
    prepareProject: async (args) => {
        args.targetPhase = 'PREPARE';
        args.platform= 'expo';
        await build(args);
        logger.info({
            label: loggerLabel,
            message: `Project is prepared at : ${args.dest}.`,
        });
    },
};
