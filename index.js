#!/usr/bin/env node

const { prepareProject, ejectProject, build, embed } = require('./src/command');
const os = require('os');
const { LocalStorage } = require('node-localstorage');
const {
    runExpo, runAndroid, runIos, sync, runESBuildWebPreview
} = require('./src/expo-launcher');
const { runWeb } = require('./src/web-preview-launcher');
const updateNotifier = require('update-notifier');
const pkg = require('./package.json');
const { canDoAndroidBuild, canDoIosBuild } = require('./src/requirements');
updateNotifier({
  pkg: pkg,
    updateCheckInterval : 60 * 60 * 1000
}).notify({
	defer: false
});

global.rootDir = process.env.WM_REACTNATIVE_CLI || `${os.homedir()}/.wm-reactnative-cli`;
global.localStorage = new LocalStorage(`${global.rootDir}/.store`);
// src is the web react native project zip
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
            }, args => {
            args.platform = 'android';
                build(args)
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
    }
  ).command(
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
        //   default: './',
          describe:
            'dest folder where the react native project will be extracted to',
          type: 'string',
        });
    },
    async (args) => {
        prepareProject(args);
    }
  ).command('embed', '', (yargs) => {
    yargs
      .command(
        'android [src]',
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
        (args) => {
          if (args.clean) {
            localStorage.clear();
          }
                runExpo(args.previewUrl, args.web, args.clean)
        }).command('web-preview <previewUrl>',
            'launches React Native app in web browser.',
            yargs => {},
            (args) => {
                if (args.clean) {
                    localStorage.clear();
                }
                const splits = args.previewUrl.split('#');
                args.previewUrl = splits[0];
                const authToken = splits[1];
                if (args.esbuild) {
                    runESBuildWebPreview(args.previewUrl, args.clean, authToken);
                } else {
                    runWeb(args.previewUrl, args.clean, authToken);
                }
        }).command('android <previewUrl>',
        'launches React Native app in a Android device.',
            yargs => {},
        async (args) => {
          if (args.clean) {
            localStorage.clear();
          }
          if (await canDoAndroidBuild()) {
            runAndroid(args.previewUrl, args.clean);
          }
        }).command('ios <previewUrl>',
        'launches React Native app in a iOS device.',
        yargs => {},
        async (args) => {
          if (args.clean) {
            localStorage.clear();
          }
          if (await canDoIosBuild()) {
            runIos(args.previewUrl, args.clean);
          }
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
        }).option('clean', {
          describe: 'If set to true then all existing folders are removed.',
          default: false,
            type: 'boolean'
        });
    }, (args) => {
        if (args.clean) {
            localStorage.clear();
        }
        sync(args.previewUrl, args.clean);
    })
  .help('h')
  .alias('h', 'help').argv;
