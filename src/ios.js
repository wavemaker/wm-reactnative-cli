const fs = require('fs-extra');
const logger = require('./logger');
const config = require('./config');
const plist = require('plist');
const xcode = require('xcode');
const path = require('path');
const pparse = require('./mobileprovision-parse');
const {
    exec
} = require('./exec');
const {
    validateForIos
 } = require('./requirements');
 const { readAndReplaceFileContent, iterateFiles } = require('./utils');
 const { newPostInstallBlock } =  require('../templates/ios-build-patch/podFIlePostInstall');
const taskLogger = require('./custom-logger/task-logger').spinnerBar;
const {androidBuildSteps} = require('./custom-logger/steps');

 const loggerLabel = 'Generating ipa file';

async function importCertToKeyChain(keychainName, certificate, certificatePassword) {
    await exec('security', ['create-keychain', '-p', keychainName, keychainName], {log: false});
    await exec('security', ['unlock-keychain', '-p', keychainName, keychainName], {log: false});
    await exec('security', ['set-keychain-settings', '-t', '3600', keychainName], {log: false});
    let keychains = await exec('security', ['list-keychains', '-d', 'user'], {log: false});
    keychains = keychains.map(k => k.replace(/[\"\s]+/g, '')).filter(k => k !== '');
    await exec('security', ['list-keychains', '-d', 'user', '-s', keychainName, ...keychains], {log: false});
    await exec('security',
        ['import',
        certificate,
        '-k', keychainName,
        '-P', certificatePassword,
        '-T', '/usr/bin/codesign',
        '-T', '/usr/bin/productsign',
        '-T', '/usr/bin/productbuild',
        '-T', '/Applications/Xcode.app'], {log: false});
    await exec('security', ['set-key-partition-list', '-S', 'apple-tool:,apple:,codesign', '-s', '-k', keychainName, keychainName], {log: false});
    logger.info({
        label: loggerLabel,
        message: `Cerificate at (${certificate}) imported in (${keychainName})`
    });
    let signingDetails = await exec('security', ['find-identity', '-v', '-p', 'codesigning'], {log: false});
    console.log(signingDetails);
    return async () => {
        keychains = keychains.map(k => k.replace(/[\"\s]+/g, ''));
        await exec('security', ['list-keychains', '-d', 'user', '-s', ...keychains], {log: false});
        await deleteKeyChain(keychainName);
        logger.info({
            label: loggerLabel,
            message: `removed keychain (${keychainName}).`
        });
    };
}

async function deleteKeyChain(keychainName) {
    await exec('security', ['delete-keychain', keychainName]);
}


async function extractUUID(provisionalFile) {
    const content = await exec('grep', ['UUID', '-A1', '-a', provisionalFile], {log: false});
    return content.join('\n').match(/[-A-F0-9]{36}/i)[0];
}

async function getLoginKeyChainName() {
    const content = await exec('security list-keychains | grep login.keychain', null, {
        shell: true
    });
    return content[0].substring(content[0].lastIndexOf('/') + 1, content[0].indexOf('-'));
}

async function extractTeamId(provisionalFile) {
    const content = await exec('grep', ['TeamIdentifier', '-A2', '-a', provisionalFile], {log: false});
    return content[2].match(/>[A-Z0-9]+/i)[0].substr(1);
}

async function getUsername() {
    const content = await exec('id', ['-un'], false);
    return content[0];
}

function updateJSEnginePreference() {
    const jsEngine = require(config.src + 'app.json').expo.jsEngine;
    const podJSON = config.src + 'ios/Podfile.properties.json';
    if (fs.existsSync(podJSON)) {
        let data = require(podJSON, 'utf8');
        data['expo.jsEngine'] = jsEngine;
        fs.writeFileSync(podJSON, JSON.stringify(data, null, 4));
        logger.info({
            label: loggerLabel,
            message: `js engine is set as ${jsEngine}`
        });
    }
}

function addResourceFileToProject(iosProject, path, opt, group) {
    const file = iosProject.addFile(path, group);
    file.uuid = iosProject.generateUuid();
    iosProject.addToPbxBuildFileSection(file);        // PBXBuildFile
    iosProject.addToPbxResourcesBuildPhase(file);     // PBXResourcesBuildPhase
    iosProject.addToPbxFileReferenceSection(file);    // PBXFileReference
    if (group) {
        if (iosProject.getPBXGroupByKey(group)) {
            iosProject.addToPbxGroup(file, group);        //Group other than Resources (i.e. 'splash')
        }
        else if (iosProject.getPBXVariantGroupByKey(group)) {
            iosProject.addToPbxVariantGroup(file, group);  // PBXVariantGroup
        }
    }
    return file;
}


async function embed(args) {
    const rnIosProject = config.src;
    const embedProject = `${rnIosProject}ios-embed`;
    fs.copySync(args.mp, embedProject);
    const rnModulePath = `${embedProject}/rnApp`;
    fs.removeSync(rnModulePath);
    fs.mkdirpSync(rnModulePath);
    fs.copyFileSync(`${__dirname}/../templates/embed/ios/ReactNativeView.swift`, `${rnModulePath}/ReactNativeView.swift`);
    fs.copyFileSync(`${__dirname}/../templates/embed/ios/ReactNativeView.h`, `${rnModulePath}/ReactNativeView.h`);
    fs.copyFileSync(`${__dirname}/../templates/embed/ios/ReactNativeView.m`, `${rnModulePath}/ReactNativeView.m`);
    const projectName = fs.readdirSync(`${config.src}ios-embed`)
    .find(f => f.endsWith('xcodeproj'))
    .split('.')[0];
            
    // xcode 16 issue https://github.com/CocoaPods/CocoaPods/issues/12456 - not required can be removed
    await readAndReplaceFileContent(`${embedProject}/${projectName}.xcodeproj/project.pbxproj`, (content) => {
        content = content.replaceAll("PBXFileSystemSynchronizedRootGroup", "PBXGroup")
        return content.replaceAll(`objectVersion = 77`, `objectVersion = 56`)
    })
    
    fs.copyFileSync(`${rnIosProject}/ios/Podfile`, `${rnIosProject}/ios-embed/Podfile`);
    await readAndReplaceFileContent(`${embedProject}/Podfile`, (content) => {
        return content.replace(/target .* do/g, `target '${projectName}' do`);
    })
    await readAndReplaceFileContent(
        `${rnIosProject}/app.js`,
        (content) => content.replace('props = props || {};', 'props = props || {};\n\tprops.landingPage = props.landingPage || props.pageName;'));
    await exec('npx', ['react-native', 'bundle', '--platform',  'ios',
            '--dev', 'false', '--entry-file', 'index.js',
            '--bundle-output', 'ios-embed/rnApp/main.jsbundle',
            '--assets-dest', 'ios-embed/rnApp'], {
        cwd: config.src
    });
    await exec('pod', ['install'], {
        cwd: embedProject
    });
    logger.info({
        label: loggerLabel,
        message: 'Changed Native Ios project.'
    });
}

async function invokeiosBuild(args) {
    taskLogger.info("Invoke IOS build")
    const certificate = args.iCertificate;
    const certificatePassword = args.iCertificatePassword;
    const provisionalFile = args.iProvisioningFile;
    const buildType = args.buildType;
    const errors = validateForIos(certificate, certificatePassword, provisionalFile, buildType);
        if (errors.length > 0) {
            return {
                success: false,
                errors: errors
            }
        }
        updateJSEnginePreference();
        const random = Date.now();
        const username = await getUsername();
        const keychainName = `wm-reactnative-${random}.keychain`;
        const provisionuuid =  await extractUUID(provisionalFile);
        
        logger.info({
            label: loggerLabel,
            message: `provisional UUID : ${provisionuuid}`
        });
        taskLogger.info(`provisional UUID : ${provisionuuid}`);
        const developmentTeamId = await extractTeamId(provisionalFile);
        logger.info({
            label: loggerLabel,
            message: `developmentTeamId : ${developmentTeamId}`
        });
        taskLogger.info(`developmentTeamId : ${developmentTeamId}`);
        const ppFolder = `/Users/${username}/Library/MobileDevice/Provisioning\ Profiles`;
        fs.mkdirSync(ppFolder, {
            recursive: true
        })
        const targetProvisionsalPath = `${ppFolder}/${provisionuuid}.mobileprovision`;
        fs.copyFileSync(provisionalFile, targetProvisionsalPath);
        logger.info({
            label: loggerLabel,
            message: `copied provisionalFile (${provisionalFile}).`
        });
        taskLogger.info(`copied provisionalFile (${provisionalFile}).`);
        const removeKeyChain = await importCertToKeyChain(keychainName, certificate, certificatePassword);
        
        // Extract code signing identity from the keychain after importing
        let codeSignIdentity;
        try {
            const identities = await exec('security', ['find-identity', '-v', '-p', 'codesigning', keychainName], {log: false});
            // Find the first valid identity line (format: "1) HASH "Certificate Name"")
            const identityLine = identities.find(line => line.match(/\d+\)\s+[A-F0-9]+\s+".*"/));
            if (identityLine) {
                // Extract the certificate name from quotes
                const match = identityLine.match(/"([^"]+)"/);
                if (match && match[1]) {
                    codeSignIdentity = match[1];
                    logger.info({
                        label: loggerLabel,
                        message: `Code Sign Identity: ${codeSignIdentity}`
                    });
                    taskLogger.info(`Code Sign Identity: ${codeSignIdentity}`);
                } else {
                    throw new Error('Could not parse certificate name from identity');
                }
            } else {
                throw new Error('No valid code signing identity found in keychain');
            }
        } catch (e) {
            logger.error({
                label: loggerLabel,
                message: `Failed to extract code signing identity: ${e.message}`
            });
            // Fallback to openssl method
            logger.info({
                label: loggerLabel,
                message: 'Attempting fallback method using openssl...'
            });
            try {
                let opensslOutput = await exec(`openssl pkcs12 -in ${certificate} -passin pass:${certificatePassword} -nodes | openssl x509 -noout -subject -nameopt multiline | grep commonName | sed -n 's/ *commonName *= //p'`, null, {
                    shell: true
                });
                // Filter out any error/usage lines and get the actual certificate name
                codeSignIdentity = opensslOutput.find(line => line && !line.includes('usage:') && !line.includes('pkcs12'));
                if (!codeSignIdentity) {
                    throw new Error('Openssl fallback failed - no valid certificate name found');
                }
                logger.info({
                    label: loggerLabel,
                    message: `Code Sign Identity (via openssl): ${codeSignIdentity}`
                });
            } catch (opensslError) {
                throw new Error(`Failed to extract code signing identity: ${opensslError.message}`);
            }
        }
        let useModernBuildSystem = 'YES';

        try {
            // XCode14 issue https://github.com/expo/expo/issues/19759
            // This is not required when expo 47 is used.
            await readAndReplaceFileContent(`${config.src}ios/Podfile`, (content) => {
                return content.replace('__apply_Xcode_12_5_M1_post_install_workaround(installer)', 
                '__apply_Xcode_12_5_M1_post_install_workaround(installer)' + '\n' +
                '    # Add these lines for Xcode 14 builds' + '\n' +
                '    installer.pods_project.targets.each do |target| ' +   '\n' +
                '       if target.respond_to?(:product_type) and target.product_type == "com.apple.product-type.bundle"' + '\n' +
                '           target.build_configurations.each do |config|'+ '\n' +
                '               config.build_settings[\'CODE_SIGNING_ALLOWED\'] = \'NO\'' + '\n' +
                '           end' + '\n' +
                '       end' + '\n' +
                '   end')
            });

            const appJsonPath = path.join(config.src, 'app.json');
            const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
            const buildPropertiesPlugin = appJson.expo.plugins && appJson.expo.plugins.find(plugin => plugin[0] === 'expo-build-properties');

            if (buildPropertiesPlugin){
                const iosConfig = buildPropertiesPlugin[1].ios;
                if (iosConfig && iosConfig.useFrameworks === 'static'){
                    await readAndReplaceFileContent(`${config.src}ios/Podfile`, (podfileContent) => {
                        const postInstallRegex = /^(\s*)post_install\s+do\s+\|installer\|[\s\S]*?^\1end$/m;
                        const modifiedPodContent = podfileContent.replace(postInstallRegex, newPostInstallBlock);
                        return modifiedPodContent;
                    });
                }
            }

            await exec('pod', ['install'], {cwd: config.src + 'ios'});
            return await xcodebuild(args, codeSignIdentity, provisionuuid, developmentTeamId);
        } catch (e) {
            console.error(e);
            return {
                errors: e,
                success: false
            }
        } finally {
            await removeKeyChain();
        }
}

async function getPackageType(provisionalFile) {
    const data = await pparse(provisionalFile);
    //data.
    if (data.type === 'appstore') {
        return 'app-store';
    }
    if (data.type === 'inhouse') {
        return 'enterprise';
    } 
    if (data.type === 'adhoc') {
        return 'ad-hoc';
    }
    throw new Error('Not able find the type of provisioning file.');
}

async function createExportPList(projectPath, {
    appId,
    provisioningProfile,
    teamId,
    packageType,
    codeSignIdentity,
    buildType
}) {
    const exportOptions = {
        compileBitcode: true,
        provisioningProfiles : { [appId]: String(provisioningProfile) },
        signingCertificate: codeSignIdentity,
        signingStyle: 'manual',
        teamId: teamId,
        method: packageType,
        testFlightInternalTestingOnly: false
    };
    if (buildType === 'development') {
        exportOptions.stripSwiftSymbols = false;
    } else {
        exportOptions.stripSwiftSymbols = true;
    }
    const exportOptionsPlist = plist.build(exportOptions);
    const exportOptionsPath = path.join(projectPath, 'exportOptions.plist');
    fs.writeFileSync(exportOptionsPath, exportOptionsPlist, 'utf-8');
    return 'success'
}

const removePushNotifications = (projectDir, projectName) => {
    const dir = `${projectDir}ios/${projectName}/`;
    const entitlements = dir + fs.readdirSync(dir).find(f => f.endsWith('entitlements'));
    const o = plist.parse(fs.readFileSync(entitlements, 'utf8'));
    delete o['aps-environment'];
    fs.writeFileSync(entitlements, plist.build(o), 'utf8');
    logger.info({
        label: loggerLabel,
        message: `removed aps-environment from entitlements`
    });
};

const endWith = (str, suffix) => {
    if (!str.endsWith(suffix)) {
        return str += suffix;
    }
    return str;
};

function findFile(path, nameregex) {
    const files = fs.readdirSync(path);
    const f = files.find(f => f.match(nameregex));
    return f ? endWith(path, '/') + f : '';
}

async function xcodebuild(args, CODE_SIGN_IDENTITY_VAL, PROVISIONING_UUID, DEVELOPMENT_TEAM) {
    try {
        taskLogger.enableProgressBar();
        taskLogger.start(androidBuildSteps[4].start);
        taskLogger.setTotal(androidBuildSteps[4].total);
        let xcworkspacePath = findFile(config.src + 'ios', /\.xcworkspace?/) || findFile(config.src + 'ios', /\.xcodeproj?/);
        if (!xcworkspacePath) {
            return {
                errors: '.xcworkspace or .xcodeproj files are not found in ios directory',
                success: false
            }
        }
        const projectName = fs.readdirSync(`${config.src}ios`)
            .find(f => f.endsWith('xcodeproj'))
            .split('.')[0];
        const pathArr = xcworkspacePath.split('/');
        const xcworkspaceFileName = pathArr[pathArr.length - 1];
        const fileName = xcworkspaceFileName.split('.')[0];
        taskLogger.incrementProgress(0.4);
        
        let _buildType;
        if (args.buildType === 'development' || args.buildType === 'debug') {
            _buildType = 'Debug';
            
            // Get Expo SDK version from package.json
            const packageJson = JSON.parse(fs.readFileSync(`${config.src}package.json`, 'utf8'));
            const expoVersion = packageJson.dependencies?.expo ? parseInt(packageJson.dependencies.expo.replace(/[^0-9]/g, '').substring(0, 2)) : 0;
            
            if (expoVersion >= 54) {
                // Expo 54+: Modify bundling script to force bundling with --dev false
                logger.info({
                    label: loggerLabel,
                    message: 'Expo 54+: Configuring production mode bundle for Debug build...'
                });
                
                await readAndReplaceFileContent(`${config.src}ios/${projectName}.xcodeproj/project.pbxproj`, (content) => {
                    // Replace SKIP_BUNDLING with FORCE_BUNDLING
                    content = content.replace('SKIP_BUNDLING=1', 'FORCE_BUNDLING=1');
                    
                    // Add --dev false flag to the bundling command by setting EXTRA_PACKAGER_ARGS
                    // This is the standard way React Native handles additional bundler arguments
                    content = content.replace(
                        'if [[ \\"$CONFIGURATION\\" = *Debug* ]]; then\\n  export FORCE_BUNDLING=1\\nfi',
                        'if [[ \\"$CONFIGURATION\\" = *Debug* ]]; then\\n  export FORCE_BUNDLING=1\\n  export EXTRA_PACKAGER_ARGS=\\"--dev false\\"\\nfi'
                    );
                    
                    return content;
                });
                
                // Modify AppDelegate.swift to load from embedded bundle
                const appDelegateSwiftPath = `${config.src}ios/${projectName}/AppDelegate.swift`;
                if (fs.existsSync(appDelegateSwiftPath)) {
                    await readAndReplaceFileContent(appDelegateSwiftPath, (content) => {
                        return content.replace(
                            `#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif`,
                            `return Bundle.main.url(forResource: "main", withExtension: "jsbundle")`
                        );
                    });
                }
                
                logger.info({
                    label: loggerLabel,
                    message: 'Expo 54+: Configured to bundle with production mode (no Metro/devtools)'
                });
            } else {
                // Expo 52 and below: Use legacy Objective-C AppDelegate.mm modification
                await readAndReplaceFileContent(`${config.src}ios/${projectName}.xcodeproj/project.pbxproj`, (content) => {
                    return content.replace('SKIP_BUNDLING=1', 'FORCE_BUNDLING=1');
                });
                if (fs.existsSync(`${config.src}ios/${projectName}/AppDelegate.mm`)) {
                    await readAndReplaceFileContent(`${config.src}ios/${projectName}/AppDelegate.mm`, (content) => {
                        return content.replace(
                            'return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];',
                            'return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];')
                            .replace(
                                'return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];',
                                'return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];');
                    });
                }
            }
        } else {
            _buildType = 'Release';
        }
        
        const env = {
            RCT_NO_LAUNCH_PACKAGER: 1
        };
        taskLogger.incrementProgress(0.4);
        await exec('xcodebuild', [
            '-workspace', fileName + '.xcworkspace',
            '-scheme', fileName,
            '-configuration', _buildType,
            '-destination', 'generic/platform=iOS',
            '-archivePath', 'build/' + fileName + '.xcarchive', 
            'CODE_SIGN_IDENTITY=' + CODE_SIGN_IDENTITY_VAL,
            'PROVISIONING_PROFILE=' + PROVISIONING_UUID,
            'CODE_SIGN_STYLE=Manual',
            'archive'], {
            cwd: config.src + 'ios',
            env: env
        });
        
        let packageType = 'development';
        if (args.buildType === 'release') {
            packageType = await getPackageType(args.iProvisioningFile);
        }
        const status = await createExportPList(config.src + 'ios', {
            appId: config.metaData.id,
            provisioningProfile: PROVISIONING_UUID,
            teamId: DEVELOPMENT_TEAM,
            packageType: packageType,
            codeSignIdentity: CODE_SIGN_IDENTITY_VAL,
            buildType: args.buildType
        });

        if (status === 'success') {
            await exec('xcodebuild', [
                '-exportArchive',
                '-archivePath', 'build/' + fileName + '.xcarchive',
                '-exportOptionsPlist', './exportOptions.plist', 
                '-exportPath',
                'build'], {
                cwd: config.src + 'ios',
                env: env
            });
            const output =  args.dest + 'output/ios/';
            const outputFilePath = `${output}${fileName}(${config.metaData.version}).${args.buildType}.ipa`;
            fs.mkdirSync(output, {recursive: true});
            fs.copyFileSync(findFile(`${args.dest}ios/build/`, /\.ipa?/), outputFilePath);
            return {
                success: true,
                output: outputFilePath
            }
        }
        taskLogger.succeed(androidBuildSteps[4].succeed);
    } catch (e) {
        logger.error({
            label: loggerLabel,
            message: e
        });
        taskLogger.fail(androidBuildSteps[4].fail);
        console.error(e);
        return {
            errors: e,
            success: false
        }
    }
}

module.exports = {
    invokeiosBuild: invokeiosBuild,
    embed: embed
}
