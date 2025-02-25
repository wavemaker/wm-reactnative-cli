# wm-reactnative-cli

A command line utility to build react native apps created using WaveMaker product.

The main goal of wm-reactnative-cli is to simplify generation of APK or IPA for WaveMaker developers. ```wm-reactnative-cli``` combines multiple react-native commands into a single command. First, one has to make sure all the required hardware and software are available and installed. Then execute the command with the appropriate values for arguments.

### Command to Install

~~~
npm install -g @wavemaker/wm-reactnative-cli
~~~

### Adding Environment Variable

#### For Windows

-   Go to System Setting and Select Environment Variables.

    ![Windows System settings](./assets/EnvironmentVariable.png)

-   Select New Variable under the System section and add `WM_REACTNATIVE_CLI` and its respective path.

    ![CLI System Variable](./assets/CLI-EnvironmentVariable.png)

#### For Linux/MAC

-   use nano ~/.bashrc then add the following at the end of the file (after updating the paths) and save it.

~~~
export WM_REACTNATIVE_CLI="$HOME/cli/"
~~~

**_NOTE:_** To avoid cmake errors caused due to long paths in Windows, we suggest making the cli path shorter using this variable

## Android Build

### Requirements

-   Linux or MAC or Windows
-   Node 18.x ([https://nodejs.org/en/blog/release/v14.15.1/](https://nodejs.org/en/download/))
-   GIT ([https://git-scm.com/download](https://git-scm.com/download))
-   Java 17 ([https://openjdk.org/install/](https://openjdk.org/install/))
-   Yarn (npm install -g yarn)
-   Gradle 8 ([https://gradle.org/releases/](https://gradle.org/releases/))
-   Make sure JAVA_HOME, ANDROID_SDK and GRADLE_HOME are set in the environment variables and also in PATH.

#### Adding Environment Variables

#### For Windows

-   Go to System Setting and Select Environment Variables.
    
    ![Windows System settings](./assets/EnvironmentVariable.png)
-   Select New Variable under the System section and add variables and their respective paths.
    ![New System Variable](./assets/EnvironmentVariable1.png)

#### For Linux/MAC

-   use nano ~/.bashrc then add the following at the end of the file (after updating the paths) and save it.
~~~
export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
export ANDROID_HOME="/usr/lib/android-sdk"
export ANDROID_SDK="/usr/lib/android-sdk"
export ANDROID_SDK_ROOT="/usr/lib/android-sdk"
export GRADLE_HOME="$HOME/gradle/gradle-8.2.1"
~~~

### Command

wm-reactnative build android <src_dir> [additional_arguments]


|&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**Argument**&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;| **Description** |
|--|--|
| **src_dir** | **DEFAULT:** current working directory.<br> Path to the reactnative expo zip (or) path to the reactnative expo project folder. |
|**\-\-dest**|**OPTIONAL:** directory where the app has to be copied and built. If it is not specified then .wm-reactnative-cli folder inside the home directory, will contain the build folders |
|**\-\-auto-eject**|**OPTIONAL:** On setting this flag to true, expo eject will be invoke automatically.|
|**\-\-aKeyStore**|Absolute path of the key store. If keystore is not given then android debug key is used.|
|**\-\-aStorePassword**|Password to key store|
|**\-\-aKeyAlias**|Alias name of the key|
|**\-\-aKeyPassword**|Key Password|
|**\-\-buildType**|**DEFAULT:** development<br>development or production<br>Use ‘production’ with keystore specified.|
|**\-\-architecture**|Specifies the target Application Binary Interfaces (ABIs) for the build.<br>**DEFAULT:** All <br>**CHOICES:** armeabi-v7a, arm64-v8a, x86, x86_64. <br>**Example for single ABI:** --architecture=armeabi-v7a <br>**Example for multiple ABIs:** --architecture=armeabi-v7a  --architecture=arm64-v8a |


### Example 1

~~~
wm-reactnative build android "/path/to/src"
~~~
### Example 2
~~~
wm-reactnative build android "/path/to/src" \
--dest="/path/to/dest" \
--aKeyStore="/path/to/file.keystore" \
--aStorePassword="store_password" \
--aKeyAlias="key_alias_name" \
--aKeyPassword="key" \
--buildType="production"
--auto-eject=true
~~~

## IOS build

### Requirements

-   MAC machine
-   Latest XCODE
-   CocoaPods ([https://guides.cocoapods.org/using/getting-started.html#toc_3](https://guides.cocoapods.org/using/getting-started.html#toc_3))
-   Node 18.x ([https://nodejs.org/en/blog/release/v12.22.0/](https://nodejs.org/en/download/))
-   GIT ([https://git-scm.com/download/mac](https://git-scm.com/download/mac))
-   Yarn (npm install -g yarn)
-   Apple developer or distribution P12 certificates
-   Provisioning profile
-   Install wm-reactnative-cli (npm install -g @wavemaker/wm-reactnative-cli)
-   For development build, development certificate and development provisioning file are required.
-   For production build, distribution certificate and distribution provisioning file are required.
-   Use Libre SSL (brew install libressl). Make sure openssl (openssl version) should use Libre ssl.

**NOTE:** Before building an app, please make sure that neither iPhone nor iPad is not connected to Mac.

### Command

wm-reactnative build ios <src_dir> [additional_arguments]


|&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**Argument**&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;| **Description** |
|--|--|
| **src_dir** | **DEFAULT:** current working directory.<br> Path to the reactnative expo zip (or) path to the reactnative expo project folder. |
|**\-\-dest**|**OPTIONAL:** directory where the app has to be copied and built. If it is not specified then .wm-reactnative-cli folder inside the home directory, will contain the build folders |
|**\-\-auto-eject**|**OPTIONAL:** On setting this flag to true, expo eject will be invoke automatically.|
|**\-\-iCertificate**|Absolute path of P12 certificate location|
|**\-\-iCertificatePassword**|Password to unlock the certificate.|
|**\-\-iProvisioningFile**|Absolute path of provisioning file|
|**\-\-buildType**|**DEFAULT:** development<bR>development or production <br>Use ‘production’ with an AppStore distribution certificate.|


### Example


~~~
wm-reactnative build ios "/path/to/src" \
--iCertificate="/path/to/distribution.p12" \
--iCertificatePassword="unlock_password" \
--iProvisioningFile="/path/to/profile.mobileprovision" \
--buildType="production"
~~~


## Run web-preview

### Requirements
- Node >= 18.16.1 
- GIT ([https://git-scm.com/download](https://git-scm.com/download))
- npm 9.5.x
- Yarn (npm install -g yarn)
- Expo cli (npm install -g expo-cli@latest)

### Command

wm-reactnative run web-preview <preview_url> [additional_arguments]

|&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**Argument**&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;| **Description** |
|--|--|
| **preview_url** | app preview url |
|**\-\-clean**|**DEFAULT:** false <br> if true, existing project directory is removed |

## Sync

### Requirements
- Node >= 18.16.1 
- GIT ([https://git-scm.com/download](https://git-scm.com/download))
- npm 9.5.x
- Yarn (npm install -g yarn)
- Expo cli (npm install -g expo-cli@latest)

### Command

wm-reactnative sync <preview_url> [additional_arguments]

|&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;**Argument**&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;| **Description** |
|--|--|
| **preview_url** | app preview url |
|**\-\-clean**|**DEFAULT:** false <br> if true, existing project directory is removed |
|**\-\-useProxy**|**DEFAULT:** false <br> if true, then all preview requests are routed through a internal proxy server. |

After the build is complete:

- Locate the directory where the Expo app has been generated in command logs.
- Use the cd command to navigate to the generated Expo app directory:
~~~
cd <path-to-generated-expo-app>
~~~
## Expo Preview
### Start the Expo Metro bundler 

~~~
npm start
~~~

## React Native Preview

Eject the Expo app to a React Native app by executing the below command (generate android and ios folders)
~~~
npx expo prebuild
~~~


### Start the React Native Metro bundler
~~~
npx react-native start
~~~

### Build and run the app on an Android device/emulator
~~~
npx react-native run-android
~~~

### Build and run the app on an iOS device/simulator
~~~
npx react-native run-ios
~~~

## Run Expo (Deprecated)

## Run Android (Deprecated)

## Run iOS (Deprecated)

## Additional Information

1. Destination folder path is logged at the start of the build.
2. Build log files are present at <destination_folder>/output/logs
3. The artifact built is available at <destination_folder>/output/<platform_type>/. The complete path is printed in log also.
