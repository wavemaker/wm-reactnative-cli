#!/usr/bin/env node

const {
    prepareProject,ejectProject, build, embed
} = require('./src/command');
const os = require('os');
const { LocalStorage } = require('node-localstorage');
const {
    runExpo, runAndroid, runIos, sync, runESBuildWebPreview
} = require('./src/expo-launcher');
const { runWeb } = require('./src/web-preview-launcher');
const updateNotifier = require('update-notifier');
const pkg = require('./package.json');
const { canDoAndroidBuild, canDoIosBuild, showConfirmation } = require('./src/requirements');
updateNotifier({
    pkg: pkg,
    updateCheckInterval : 60 * 60 * 1000
}).notify({
	defer: false
});
const prompt = require('prompt');
const logger = require('./src/logger');
const {calculateTotalSteps, androidBuildSteps, previewSteps} = require('./src/custom-logger/steps');
const {overallProgressBar} = require('./src/custom-logger/progress-bar');
const { audit } = require('./src/audit');
const { snyk } = require('./src/snyk');
const taskLogger = require('./src/custom-logger/task-logger').spinnerBar;

console.log("wm = reactnative-cli version: ", pkg.version);

global.rootDir = process.env.WM_REACTNATIVE_CLI || `${os.homedir()}/.wm-reactnative-cli`;
global.localStorage = new LocalStorage(`${global.rootDir}/.store`);
// src is the web react native project zip

async function handleDeprecatedCommands(args) {
    const syncCommand = `wm-reactnative sync ${args.previewUrl} ${args.clean ? '--clean' : ''} ${args.useProxy ? '--useProxy' : ''}`;
    const response = await showConfirmation(
        `Would you like to execute ${syncCommand} (yes/no) ?`
    );
    if (response !== 'y' && response !== 'yes') {
        process.exit();
    }
    sync(args.previewUrl, args.clean, args.useProxy);
}

const args = require('yargs')
    .command('build', 'build the project to generate android and ios folders', yargs => {
            yargs.command('android [src] [options]', 'build for android', yargs => {
                yargs.option('appId', {
                    alias: 'appId',
                    describe: 'unique application identifier',
                    type: 'string'
                })
                .option('aks', {
                    alias: 'aKeyStore',
                    describe: '(Android) path to keystore',
                    type: 'string'
                })
                .option('asp', {
                    alias: 'aStorePassword',
                    describe: '(Android) password to keystore',
                    type: 'string'
                })
                .option('aka', {
                    alias: 'aKeyAlias',
                    describe: '(Android) Alias name',
                    type: 'string'
                })
                .option('akp', {
                    alias: 'aKeyPassword',
                    describe: '(Android) password for key.',
                    type: 'string'
                })
                .option('p', {
                    alias: 'packageType',
                    describe: 'apk (or) bundle',
                    default: 'apk',
                    choices: ['apk', 'bundle']
                })
                .option('architecture', {
                    alias: 'arch',
                    describe: 'Specify the target architectures for the build (e.g., armeabi-v7a, arm64-v8a, x86, x86_64)',
                    type: 'array',
                    choices: ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'],
                })
            }, args => {
                args.platform = 'android';
                if(args.interactive){
                    overallProgressBar.enable();
                    // taskLogger.enableProgressBar();
                }else{
                    overallProgressBar.disable();
                    // taskLogger.disableProgressBar();
                }
                global.verbose = args.verbose;
                const totalCount = calculateTotalSteps(androidBuildSteps);
                overallProgressBar.setTotal(totalCount);
                build(args);
            })
            .command('ios [src] [options]', 'build for iOS', yargs => {
                yargs.option('ic', {
                    alias: 'iCertificate',
                    describe: '(iOS) path of p12 certificate to use',
                    type: 'string'
                })
                .option('icp', {
                    alias: 'iCertificatePassword',
                    describe: '(iOS) password to unlock certificate',
                    type: 'string'
                })
                .option('ipf', {
                    alias: 'iProvisioningFile',
                    describe: '(iOS) path of the provisional profile to use',
                    type: 'string'
                });
            }, args => {
                args.platform = 'ios';
                if(args.interactive){
                    overallProgressBar.enable();
                    // taskLogger.enableProgressBar();
                }else{
                    overallProgressBar.disable();
                    // taskLogger.disableProgressBar();
                }
                global.verbose = args.verbose;
                const totalCount = calculateTotalSteps(androidBuildSteps);
                overallProgressBar.setTotal(totalCount);
                build(args)
            })
            yargs.positional('src', {
                describe: 'path of rn project',
                default: './',
                type: 'string',
                normalize: true
            })
            .option('dest', {
                alias: 'dest',
                describe: 'dest folder where the react native project will be extracted to',
                type: 'string'
            })
            .option('bt', {
                alias: 'buildType',
                describe: 'development (or) debug (or) production (or) release',
                default: 'debug',
                coerce: (val) => {
                    if (val === 'development') {
                        return 'debug';
                    }
                    if (val === 'production') {
                        return 'release';
                    }
                    return val;
                },
                choices: ['development', 'debug', 'production', 'release']
            })
            .option('localrnruntimepath', {
                alias: 'localrnruntimepath',
                describe: 'local path pointing to the app-rn-runtime folder',
                type: 'string'
            })
            .option('auto-eject', {
                alias: 'autoEject',
                describe: 'If set to true then project will be eject automatically without prompting any confirmations',
                default: false,
                type: 'boolean'
            })
            .option('verbose', {
                describe: 'If set to true, then detailed logs will be displayed.',
                default: false,
                type: 'boolean'
            })
            .option('interactive', {
                alias: 'i',
                describe: 'if set true, progress bar will show',
                default: false,
                type: 'boolean'
            });
    })
    .command('eject expo [src] [dest]',
        'Removes Expo and generate pure react native project.',
        yargs => {
            yargs.positional('src', {
                describe: 'path of React Native project',
                default: './',
                type: 'string',
                normalize: true
            })
            .option('dest', {
                alias: 'dest',
                describe: 'dest folder where the react native project will be extracted to',
                type: 'string'
            })
        },
        (args) => {
            ejectProject(args);
    }).command(
        'prepare expo [src] [dest]',
        'Prepare Expo and generate RN native project.',
        (yargs) => {
          yargs
            .positional('src', {
              describe: 'path of React Native project',
              default: './',
              type: 'string',
              normalize: true,
            })
            .option('dest', {
              alias: 'dest',
              describe:
                'dest folder where the react native project will be extracted to',
              type: 'string',
            });
        },
        async (args) => {
            prepareProject(args);
        }
      ).command('embed', '',
        yargs => {
            yargs.command('android [src]',
                'Embed React Native project with Native Android project',
                yargs => {},
                (args) => {
                args.platform = 'android';
                return embed(args);
            }).command('ios [src]',
                'Embed React Native project with Native iOS project.',
                yargs => {},
                (args) => {
                args.platform = 'ios';
                return embed(args);
            }).positional('src', {
                describe: 'path of React Native project',
                default: './',
                type: 'string',
                normalize: true
            })
            .option('dest', {
                alias: 'dest',
                describe: 'dest folder where the react native project will be extracted to',
                type: 'string'
            })
            .option('modulePath', {
                alias: 'mp',
                describe: 'path to the app module that needs to be embedded.',
                type: 'string',
                requiresArg: true
            });
        }
    ).command('run', '', (yargs) => {
        yargs.command('expo <previewUrl>',
            'Embed React Native project with Native Android project',
            yargs => {
                yargs.option('web', {
                    describe: 'If set to true then web will be started.',
                    default: false,
                    type: 'boolean'
                });
            },
            async (args) => {
                console.log(`Command run expo is no longer supported, instead use sync command`);
                await handleDeprecatedCommands(args)
                // if (args.clean) {
                //     localStorage.clear();
                // }
                // runExpo(args.previewUrl, args.web, args.clean)
        }).command('web-preview <previewUrl>',
            'launches React Native app in web browser.',
            yargs => {
                yargs.option('proxyHost', {
                    describe: 'If provided, this will be used as the host name to the proxy server. By default, ip address is used as host name.'
                }).option('basePath', {
                    describe: 'Base Path at which the web preview has to be server.',
                    default: '/rn-bundle/',
                })
                .option('verbose', {
                    describe: 'If set to true, then detailed logs will be displayed.',
                    default: false,
                    type: 'boolean'
                })
                .option('interactive', {
                    alias: 'i',
                    describe: 'if set true, progress bar will show',
                    default: false,
                    type: 'boolean'
                });
            },
            (args) => {
                if (args.clean) {
                    localStorage.clear();
                }
                if(args.interactive){
                    overallProgressBar.enable();
                    // taskLogger.enableProgressBar();
                }else{
                    overallProgressBar.disable();
                    // taskLogger.disableProgressBar();
                }
                global.verbose = args.verbose;
                const totalCount = calculateTotalSteps(previewSteps);
                const splits = args.previewUrl.split('#');
                args.previewUrl = splits[0];
                const authToken = splits[1];
                if (args.esbuild) {
                    overallProgressBar.setTotal(totalCount-previewSteps[4].total);
                    runESBuildWebPreview(args.previewUrl, args.clean, authToken);
                } else {
                    overallProgressBar.setTotal(totalCount);
                    runWeb(args.previewUrl, args.clean, authToken, args.proxyHost, args.basePath);
                }
        }).command('android <previewUrl>',
            'launches React Native app in a Android device.',
            yargs => {},
            async (args) => {
                console.log(`Command run android is no longer supported, instead use sync command`);
                await handleDeprecatedCommands(args);
                // if (args.clean) {
                //     localStorage.clear();
                // }
                // if (await canDoAndroidBuild()) {
                //     runAndroid(args.previewUrl, args.clean);
                // }
        }).command('ios <previewUrl>',
            'launches React Native app in a iOS device.',
            yargs => {},
            async (args) => {
                console.log(`Command run ios is no longer supported, instead use sync command`);
                await handleDeprecatedCommands(args);
                // if (args.clean) {
                //     localStorage.clear();
                // }
                // if (await canDoIosBuild()) {
                //     runIos(args.previewUrl, args.clean);
                // }
        }).positional('previewUrl', {
            describe: 'Pereview Url of the React Native app.',
            type: 'string'
        }).option('clean', {
            describe: 'If set to true then all existing folders are removed.',
            default: false,
            type: 'boolean'
        });
    })
    .command('sync [previewUrl]', '', (yargs) => {
        yargs.positional('previewUrl', {
            describe: 'Pereview Url of the React Native app.',
            type: 'string'
        }).option('useProxy', {
            describe: 'If set to true then all preview requests are routed through a internal proxy server.',
            default: false,
            type: 'boolean'
        }).option('clean', {
            describe: 'If set to true then all existing folders are removed.',
            default: false,
            type: 'boolean'
        })
        .option('verbose', {
            describe: 'If set to true, then detailed logs will be displayed.',
            default: false,
            type: 'boolean'
        })
        .option('interactive', {
            alias: 'i',
            describe: 'if set true, progress bar will show',
            default: false,
            type: 'boolean'
        });
    }, (args) => {
        if (args.clean) {
            localStorage.clear();
        }
        if(args.interactive){
            overallProgressBar.enable();
            // taskLogger.enableProgressBar();
        }else{
            overallProgressBar.disable();
            // taskLogger.disableProgressBar();
        }
        global.verbose = args.verbose;
        const totalCount = calculateTotalSteps(previewSteps);
        overallProgressBar.setTotal(totalCount);
        sync(args.previewUrl, args.clean, args.useProxy);
    })
    .command('snyk [src]', '', yargs => {
        yargs.positional('src', {
            describe: 'path of rn project',
            default: './',
            type: 'string',
            normalize: true
        })
    }, (args)=> {   
        snyk(args);
    })
    .command('audit [src]', '', yargs => {
        yargs.positional('src', {
            describe: 'path of rn project',
            default: './',
            type: 'string',
            normalize: true
        })
    }, (args)=> {   
        audit(args);
    })
    .help('h')
    .alias('h', 'help').argv;
