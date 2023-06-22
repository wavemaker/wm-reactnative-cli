/* NOTE: This is a Studio Managed File. DO NOT EDIT THIS FILE. Your changes may be reverted by Studio.*/

/**
 *  Check the node version to be make sure user installed project supported node.
 *  React Native project (expo format) is generated by this file. 
 * 
 *  CONSOLE ARGUMENTS:-
 *  runtimeUIVersion:String: Runtime version (Eg: 10.6.6-next.10243) and  wavemaker-app-runtime-wm-build
 *  appSrc:String: Source folder to generate the react native app (current directory Eg: '.')
 *  appTarget: Target folder to save the generated app (Eg: 'target/ui-build/generated-app')
 */

 const { execSync } = require("child_process");
 const fs = require('fs');
 const os = require('os');
 const Path = require('path');
 const UI_BUILD_ERROR_LOG = 'UI BUILD ERROR';
 
 const MSG_CODEGEN_LOG = 'CODEGEN REACT NATIVE APP: ';
 
 const MSG_RN_CODEGEN_SUCCESS = 'REACT_NATIVE_CODEGEN_SUCCESS';
 
 const NPM_PACKAGE_SCOPE = '@wavemaker';

 /**
 * This function is executed successfully if the system node version is in a specified range. If not, the process will be killed
 * 
 */
const checkNodeVersion = () => {
    if (!isSystemHasValidNodeVersion()) {
        console.log("\x1b[31m", "-------******* Project configuration doesn't meet, Please install and use Node Version 12.X.X *******-------");
        console.log("\x1b[31m", "-------******* Your current Node Version is: " + process.versions.node + " *******-------");
        process.exit(1);
    } else {
        console.log("\x1b[47m\x1b[32m%s\x1b[0m", "-------******* Good to Go with your Node Version: " + process.versions.node + " *******-------");
    }

}

/**
 *  Return 1 if systemInstalledVersion > requiredVersion
 *  Return -1 if systemInstalledVersion < requiredVersion
 *  Return 0 if systemInstalledVersion == requiredVersion
 */
const compareNodeVersion = (requiredVersion) => {
    let systemInstalledVersion = process.versions.node;
    if (systemInstalledVersion === requiredVersion) {
        return 0;
    }

    let systemInstalledVersion_components = systemInstalledVersion.split(".");
    let requiredVersion_components = requiredVersion.split(".");

    let len = Math.min(systemInstalledVersion_components.length, requiredVersion_components.length);

    // loop while the components are equal
    for (let i = 0; i < len; i++) {
        // systemInstalledVersion bigger than requiredVersion
        if (parseInt(systemInstalledVersion_components[i]) > parseInt(requiredVersion_components[i])) {
            return 1;
        }

        // requiredVersion bigger than systemInstalledVersion
        if (parseInt(systemInstalledVersion_components[i]) < parseInt(requiredVersion_components[i])) {
            return -1;
        }
    }

    // If one's a prefix of the other, the longer one is greater.
    if (systemInstalledVersion_components.length > requiredVersion_components.length) {
        return 1;
    }

    if (systemInstalledVersion_components.length < requiredVersion_components.length) {
        return -1;
    }

    // Otherwise they are the same.
    return 0;
}

/**
 *  To restrict the node version in the given range
 * @returns boolean true/false
 */
const isSystemHasValidNodeVersion = () => {
    const nodeMinVersion = '12.0.0';
    const nodeMaxVersion = '14.15.9999';
    if (compareNodeVersion(nodeMinVersion) >= 0 && compareNodeVersion(nodeMaxVersion) < 0) {
        return true;
    } else {
        return false;
    }
}

/**
 * To check the system node version is valid or not for the project
 */
checkNodeVersion();


 /**
  * Read the console arguments and prepare the object.
  * @returns console arguments as key value pairs
  */
 const getArgs = () => {
     const args = {};
     process.argv
         .slice(2, process.argv.length)
         .forEach(arg => {
             if (arg.slice(0, 2) === '--') {
                 const longArg = arg.split('=');
                 const longArgFlag = longArg[0].slice(2, longArg[0].length);
                 const longArgValue = longArg.length > 2 ? longArg.slice(1, longArg.length).join('=') : longArg[1];
                 args[longArgFlag] = longArgValue;
             }
         });
     return args;
 }

 const args = getArgs();

 
 // TO capture the ctrl+C signal
 process.on('SIGINT', function (e) {
     console.log("Caught interrupt signal", e);
     process.exit(1);
 });
 
 /**
  *  To check the npm package installation successs or not
  * @param {*} path  File path where installation success message was written
  * @param {*} msg   Success messsage to confirm that package was installed
  * @returns boolean true/false
  */
 const isNPMPackageExist = (path, msg) => {
     if (fs.existsSync(path)) {
         const successMsg = fs.readFileSync(path, { encoding: 'utf8', flag: 'r' });
         if (successMsg == msg) {
             return true;
         }
 
     } else {
         return false;
     }
 }
 
 /**
  * To run the system command via node  child process.
  * @param {*} cmd Command in string format to execute in node environment
  * @param {*} errorCallback callback if anything needs to be handled on command failure 
  */
 const executeSyncCmd = (cmd, errorCallback, msg) => {
     try {
         console.log(msg + 'Current running cmd: ' + cmd)
         execSync(cmd, { stdio: 'inherit' });
     } catch (err) {
         if (errorCallback) {
             errorCallback(err);
         }
         console.log(msg + 'FAILED command: ' + cmd, err);
         process.exit(err.code || err.pid);
     }
 }
 
 /**
  *  Check  node modules package were installed or not
  *  Create dir for  packages with the version name
  *  Run npm install
  *  Write  success file to be make sure it was installed successfully.
  */
 const downloadNPMPackage = (packageInfo) => {
     const HOME_DIR = os.homedir();
     const PATH_NPM_PACKAGE = (packageInfo.baseDir || HOME_DIR + '/.wm/node_modules/' ) + packageInfo.name + '/' + packageInfo.version;
     const PATH_NPM_PACKAGE_SUCCESS = PATH_NPM_PACKAGE + '/.SUCCESS';
 
     // To check global app runtime node modules.
     if (!isNPMPackageExist(PATH_NPM_PACKAGE_SUCCESS, packageInfo.successMsg)) {
         fs.mkdirSync(PATH_NPM_PACKAGE, { recursive: true });
         let npmInstallCMD = 'npm install ';
         if (packageInfo.packageJsonFile && fs.existsSync(packageInfo.packageJsonFile)) {
             fs.copyFileSync(packageInfo.packageJsonFile, PATH_NPM_PACKAGE + '/package.json');
         } else {
             npmInstallCMD = 'npm init -y &&  ' + npmInstallCMD + packageInfo.scope + '/' + packageInfo.name + '@' + packageInfo.version;
         }
 
         executeSyncCmd('cd ' + PATH_NPM_PACKAGE + ' && ' + npmInstallCMD, () => {
             console.log(packageInfo.infoMsg + ' Something wrong with npm installation');
         }, packageInfo.infoMsg);
 
         fs.writeFileSync(PATH_NPM_PACKAGE_SUCCESS, packageInfo.successMsg);
     } else {
         console.log(packageInfo.infoMsg + ' Node packages already installed!');
     }
 
     return PATH_NPM_PACKAGE;
 
 }

 /**
   * Download react native codegen package and install if it is doesn't exist
   * @returns Return the codegen package path
  */
  const downloadCodegenAndGetTheInstallationPath = (basedir) => {
     let codegenPackageInfo = {
         scope: NPM_PACKAGE_SCOPE,
         version: args.runtimeUIVersion,
         name: 'rn-codegen',
         packageJsonFile: '',
         successMsg: MSG_RN_CODEGEN_SUCCESS,
         infoMsg: MSG_CODEGEN_LOG
 
     };
     codegenPackageInfo.baseDir = basedir;
     const PATH_RN_CODEGEN =  downloadNPMPackage(codegenPackageInfo);
     return PATH_RN_CODEGEN + '/node_modules/' + codegenPackageInfo.scope + '/' + codegenPackageInfo.name + '/';
 }
 

 /**
  * To check the platform is windows or not
  * @returns boolean
  */
 const isWindows = () => {
     return process.platform === "win32";
 }

const applyPatchIfAvailable = (sourceDir, appTarget, targetPlatform) => {
    console.log(`sourceDir : ${sourceDir}, appTarget: ${appTarget}, targetPlatform: ${targetPlatform} `);
    let isPatchAvailable = false; 
    if (targetPlatform === 'default' && fs.existsSync(`${appTarget}/package.json`)) {
        const package = require(`${appTarget}/package.json`);
        const rnCodgenPath = package["devDependencies"] && package["devDependencies"]["@wavemaker/rn-codegen"];
        if (rnCodgenPath && rnCodgenPath.startsWith('file:')) {
            isPatchAvailable = true;
        }
    }
    if (!isPatchAvailable) {
        return;
    }
    executeSyncCmd('cd ' + appTarget + ' && npm install');
    console.log(' Patch installed');
    executeSyncCmd(['cd ' + appTarget + ' && node  ' + appTarget + '/node_modules/@wavemaker/rn-codegen/index.js',
        'transpile',
        (args.nodeVMArgs || ''),
        '--profile="' + targetPlatform + '"',
        sourceDir + '/src/main/webapp',
        appTarget].join(' '));
    //fs.rmSync(`${appTarget}/node_modules`, {recursive: true, force: true});
 }

 const init = () => {
     const sourceDir = Path.resolve(args.appSrc || '.');
     let appTarget = Path.resolve(args.appTarget || `${sourceDir}/generated-rn-app`);
    /**
     * By default optimizeUIBuild will be true.
     * If environment is windows then optimizeUIBuild flag will be false which install all node modules.
   */
    let  optimizeUIBuild;
    if(args.optimizeUIBuild) {
         optimizeUIBuild = args.optimizeUIBuild === 'true';
    } else {         
         optimizeUIBuild =  !isWindows();
    }

    /**
     *  If optimization enabled download it in .wm folder at homedir
     *  If optimization not enabled download it in appTarget folder
     */
    let baseDir = optimizeUIBuild ? undefined : appTarget.split('/').slice(0,2).join('/') + '/';
    const codegenPath = downloadCodegenAndGetTheInstallationPath(baseDir);
    const targetPlatform = args.targetPlatform || 'default';
    executeSyncCmd(['node  --max-old-space-size=256 ' + codegenPath + 'index.js',
        'transpile',
        (args.nodeVMArgs || ''),
        '--profile="' + targetPlatform + '"',
        '--page="'+ (args.page || '') +'"',
        sourceDir + '/src/main/webapp',
        appTarget].join(' '));
    applyPatchIfAvailable(sourceDir, appTarget, targetPlatform);
 }
 //init();
 /********************************************************************
* Following code snippet stops the web preview.
* To enable web preview generation is studio, comment the below code
* and uncomment the init menthod.
**********************************************************************/
if (args.targetPlatform === '"web-preview"') {
    (function(){
        const rnBundlePath = __dirname + '/src/main/webapp/rn-bundle';
        if (!fs.existsSync(rnBundlePath)) {
            fs.mkdirSync(rnBundlePath);
        }
        fs.writeFileSync(rnBundlePath + '/index.html', `
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0"> 
                <title>WaveMaker Preview</title>
            </head>
            <body style="height: 100vh; display: flex; padding: 16px;
                justify-content: center; flex-direction: column;
                font-family:Arial, Helvetica, sans-serif;
                background-color: #111; color: #f4f4f4;line-height: 24px;overflow: hidden;">
                <div>
                    <b style="color: #82d3e0;">1.</b> Studio web preview is stopped.<br> 
                    <b style="color: #82d3e0;">2.</b> Execute the following command in your local terminal. 
                    <br>
                    <span style="display:none">Modified at : ${Date.now()}</span>
                </div>
                <div>
                    <div style="background-color: #ccc;color: #333; padding: 16px;
                        border-radius: 8px; font-family:monospace, 'Courier New', Courier;overflow: auto;margin: 8px 0;">
                        wm-reactnative run web-preview 
                        <script>
                            document.write('"' + location.href.split('/rn-bundle')[0] + '"')
                        </script> --clean
                    </div>
                </div>
                <div>
                <b style="color: #82d3e0;">3.</b> Then, open <a style="color: #82d3e0;" href="http://localhost:19009" target="_blank">http://localhost:19009</a> in a web browser. 
                <br><span><br><br><br><i style="color: #eee;">To know more, <a href="https://docs.wavemaker.com/learn/react-native/expo-debug" target="_blank" style="color: #82d3e0;">please visit this link</a>.</span></i>
                <span style="display:none">Modified at : ${Date.now()}</span>
                </div>
            </body>
        </html>
        `, {encoding: 'utf-8'});
    }());
} else {
    init();
}
 
