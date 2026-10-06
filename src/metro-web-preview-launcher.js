// `run web-preview --metro`: web preview through codegen's split-bundle (Metro) pipeline, the same one Studio uses.
// It reuses expo-launcher's flow (project sync, proxy, change watching) and overrides only what differs, so
// `--esbuild` keeps working unchanged for projects on older codegen.
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const logger = require('./logger');
const { exec } = require('./exec');
const taskLogger = require('./custom-logger/task-logger').spinnerBar;
const { previewSteps } = require('./custom-logger/steps');
const launcher = require('./expo-launcher');
const { getWmProjectDir, getExpoProjectDir } = launcher;

const loggerLabel = 'metro-web-preview';

// Codegen locks its shared installs read-only, so directories must be made writable before deleting.
const makeWritable = p => {
    if (fs.lstatSync(p).isDirectory()) {
        fs.chmodSync(p, 0o755);
        fs.readdirSync(p).forEach(name => makeWritable(path.join(p, name)));
    }
};

function forceRemove(target) {
    if (fs.existsSync(target)) {
        makeWritable(target);
        fs.removeSync(target);
    }
}


function getUiVersion(projectDir) {
    const pom = fs.readFileSync(`${projectDir}/pom.xml`, { encoding: 'utf-8' });
    return (pom.match(/wavemaker.app.runtime.ui.version>(.*)<\/wavemaker.app.runtime.ui.version>/) || [])[1];
}

// rn-app lives under the CLI root, laid out like Studio's /root/.wm/node_modules/rn-app/<version>/, so codegen's
// shared vendor install (created next to it) is shared by all projects and untouched by --clean.
function rnAppLocation(folder, scope) {
    const installDir = `${global.rootDir}/rn-app/${folder}`;
    const appPath = `${installDir}/node_modules/${scope}/rn-app`;
    const marker = `${installDir}/.wm-rn-app-installed`;
    return { installDir, appPath, marker, ready: fs.existsSync(marker) };
}

// Published rn-app for the project's runtime version.
async function ensurePublishedRnApp(scope, uiVersion) {
    const { installDir, appPath, marker, ready } = rnAppLocation(uiVersion, scope);
    if (!ready) {
        fs.outputJSONSync(`${installDir}/package.json`, { private: true });
        await exec('npm', ['install', '--no-save', `${scope}/rn-app@${uiVersion}`], { cwd: installDir });
        fs.writeFileSync(marker, uiVersion);
    }
    return appPath;
}

// Local codebase: rn-app built from the local codegen template, as `scripts/build.js generate rn-app` does,
// with each `file:.yalc/<pkg>` (followed recursively) taken from the yalc store, so the vendor tree carries
// the local builds. build.js itself can't be used: with --runtimeVersion it rewrites the repo's build/
// templates to published versions, and without it the lock step can't resolve the `.yalc` paths.
async function ensureLocalRnApp(codegenRepo, scope, uiVersion) {
    const templateRaw = fs.readFileSync(`${codegenRepo}/src/templates/project/package.json`, 'utf-8');
    const webRaw = fs.readFileSync(`${codegenRepo}/src/templates/package.web.json`, 'utf-8');
    const template = JSON.parse(templateRaw);
    const web = JSON.parse(webRaw);
    const yalcStore = path.join(process.env.YALC_DIR || path.join(os.homedir(), '.yalc'), 'packages');
    const yalcDeps = pkg => Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
        .filter(([, range]) => String(range).startsWith('file:.yalc')).map(([name]) => name);

    const localPackages = {};   // name -> newest version folder in the yalc store
    const queue = [...yalcDeps(template), ...yalcDeps(web)];
    while (queue.length) {
        const name = queue.shift();
        const versions = path.join(yalcStore, name);
        if (localPackages[name] || !fs.existsSync(versions)) continue;
        const dir = fs.readdirSync(versions).map(v => path.join(versions, v))
            .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
        localPackages[name] = dir;
        queue.push(...yalcDeps(fs.readJSONSync(`${dir}/package.json`)));
    }
    // A local build pinning a different version than the template gets its own nested copy; for singletons
    // such as @react-navigation/native that breaks the app at runtime ("Couldn't find a LinkingContext").
    for (const [name, dir] of Object.entries(localPackages)) {
        const { dependencies = {} } = fs.readJSONSync(`${dir}/package.json`);
        const skew = Object.entries(dependencies)
            .filter(([dep, range]) => template.dependencies[dep] && template.dependencies[dep] !== range
                && !String(range).startsWith('file:'))
            .map(([dep, range]) => `${dep} ${range} (template ${template.dependencies[dep]})`);
        if (skew.length) {
            logger.warn({ label: loggerLabel, message: `Local ${name} build (${dir}) pins versions that differ from `
                + `the codegen template; rebuild it from the matching branch and yalc push: ${skew.join(', ')}` });
        }
    }
    // Every codegen `npm run build` pushes a new codegen yalc build. Codegen itself runs from the repo, so that
    // build only keys the rn-app by its dependencies; its files are copied over the installed ones instead.
    const codegenName = `${scope}/rn-codegen`;
    const key = crypto.createHash('md5').update(templateRaw + webRaw + uiVersion
        + Object.entries(localPackages).map(([name, dir]) => (name === codegenName
            ? JSON.stringify(fs.readJSONSync(`${dir}/package.json`).dependencies)
            : fs.readFileSync(`${dir}/yalc.sig`, 'utf-8'))).join())
        .digest('hex').slice(0, 8);
    const { installDir, appPath, marker, ready } = rnAppLocation(`local-${key}`, scope);
    // Keep other branches' rn-apps for a week (switching back is then instant), then drop them.
    const rnAppRoot = path.dirname(installDir);
    fs.mkdirpSync(rnAppRoot);
    for (const name of fs.readdirSync(rnAppRoot).filter(n => n.startsWith('local-') && n !== `local-${key}`)) {
        const stale = path.join(rnAppRoot, name);
        const usedAt = fs.existsSync(`${stale}/.wm-rn-app-installed`) ? fs.statSync(`${stale}/.wm-rn-app-installed`).mtimeMs : 0;
        if (Date.now() - usedAt > 7 * 24 * 60 * 60 * 1000) {
            forceRemove(stale);
        }
    }
    if (ready) {
        fs.utimesSync(marker, new Date(), new Date());
        if (localPackages[codegenName]) {
            syncLocalCodegen(installDir, codegenName, localPackages[codegenName]);
        }
        return appPath;
    }

    logger.info({ label: loggerLabel, message: `Generating local rn-app at ${installDir}` });
    // Built in place: the locks hold absolute paths into this folder.
    fs.removeSync(installDir);
    const localPath = name => `${installDir}/local-packages/${name}`;
    const pinDeps = pkg => ['dependencies', 'devDependencies'].forEach(field => {
        for (const [name, range] of Object.entries(pkg[field] || {})) {
            if (String(range).startsWith('file:.yalc')) {
                pkg[field][name] = localPackages[name] ? `file:${localPath(name)}` : uiVersion;
            }
        }
    });
    try {
        for (const [name, dir] of Object.entries(localPackages)) {
            fs.copySync(dir, localPath(name), { filter: src => !src.includes(`${path.sep}node_modules`) });
            const pkgFile = `${localPath(name)}/package.json`;
            const pkg = fs.readJSONSync(pkgFile);
            pinDeps(pkg);
            fs.writeJSONSync(pkgFile, pkg);
        }
        const expoPkg = JSON.parse(templateRaw);
        delete expoPkg.dependencies['@unimodules/react-native-adapter'];
        delete expoPkg.devDependencies['esbuild'];
        delete expoPkg.devDependencies['fs-extra'];
        const webPkg = { ...template,
            scripts: { ...template.scripts, ...web.scripts },
            dependencies: { ...template.dependencies, ...web.dependencies } };
        for (const [dir, pkg] of [['expo', expoPkg], ['web', webPkg]]) {
            const target = `${appPath}/${dir}`;
            pinDeps(pkg);
            fs.outputJSONSync(`${target}/package.json`, pkg, { spaces: 4 });
            await exec('npm', ['install', '--package-lock-only', '--ignore-scripts'], { cwd: target });
            // As build.js createPackageLock(): drop registry URLs. `file:` sources are kept but made absolute,
            // since codegen copies the lock into its shared install folder at a different depth.
            const lock = fs.readJSONSync(`${target}/package-lock.json`);
            for (const entry of Object.values(lock.packages)) {
                if (String(entry.resolved).startsWith('file:')) {
                    entry.resolved = `file:${path.resolve(target, entry.resolved.slice(5))}`;
                } else if (!entry.link) {
                    delete entry.resolved;
                }
            }
            fs.writeJSONSync(`${target}/package-lock.json`, lock, { spaces: 4 });
            fs.writeJSONSync(`${target}/npm-shrinkwrap.json`, lock, { spaces: 4 });
        }
        fs.writeJSONSync(`${appPath}/package.json`, { name: `${scope}/rn-app`, version: `${uiVersion}-local.${key}` });
        if (localPackages[codegenName]) {
            fs.copySync(`${localPackages[codegenName]}/yalc.sig`, `${installDir}/.rn-codegen.sig`);
        }
        fs.writeFileSync(marker, key);
    } catch (e) {
        fs.removeSync(installDir);
        throw e;
    }
    return appPath;
}

// Copies a newer local codegen build over the rn-app's copy and every shared install made from it (keeping
// their package.json, whose dependencies are pinned to this rn-app).
function syncLocalCodegen(installDir, name, dir) {
    const sigFile = `${installDir}/.rn-codegen.sig`;
    const sig = fs.readFileSync(`${dir}/yalc.sig`, 'utf-8');
    if (fs.existsSync(sigFile) && fs.readFileSync(sigFile, 'utf-8') === sig) {
        return;
    }
    logger.info({ label: loggerLabel, message: `Updating ${name} in ${installDir} from the local build` });
    const targets = [`${installDir}/local-packages/${name}`, ...fs.readdirSync(installDir)
        .filter(f => f.startsWith('shared-nm-') && !f.includes('.lock'))
        .map(f => `${installDir}/${f}/node_modules/${name}`)];
    for (const target of targets.filter(t => fs.existsSync(t))) {
        makeWritable(target);
        fs.readdirSync(target).filter(f => f !== 'package.json' && f !== 'node_modules')
            .forEach(f => fs.removeSync(path.join(target, f)));
        fs.copySync(dir, target, { filter: src => !src.includes(`${path.sep}node_modules`) && src !== `${dir}/package.json` });
    }
    fs.writeFileSync(sigFile, sig);
}

// Branch switches change the rn-app (template deps / yalc builds) or codegen's Metro code without touching the
// project's package.json, which is all codegen checks. So on a change:
//  - new rn-app: drop the project's node_modules, or codegen keeps the packages linked from the old vendor tree;
//  - new Metro code: drop the cached vendor/extras/user bundles, which are keyed by the lock, not by codegen.
function refreshOnCodegenChange(projectDir, rnAppPath, metroDir) {
    const appDir = getExpoProjectDir(projectDir);
    const stampFile = `${appDir}/.wm-cli-stamp.json`;
    const metro = crypto.createHash('md5');
    fs.readdirSync(metroDir).sort().forEach(f => metro.update(f).update(fs.readFileSync(path.join(metroDir, f))));
    // A local codegen build copied in by syncLocalCodegen() counts as a new rn-app and new bundle code.
    const codegenSigFile = path.resolve(rnAppPath, '../../../.rn-codegen.sig');
    const codegenSig = fs.existsSync(codegenSigFile) ? fs.readFileSync(codegenSigFile, 'utf-8') : '';
    const stamp = { rnAppPath, codegenSig, metro: metro.digest('hex') };
    const prev = fs.readJSONSync(stampFile, { throws: false });
    const codegenChanged = prev && (prev.codegenSig || '') !== codegenSig;
    if (prev && (prev.rnAppPath !== stamp.rnAppPath || codegenChanged)) {
        forceRemove(`${appDir}/node_modules`);
        fs.removeSync(`${appDir}/.wm-dest-pkg-hash`);
    }
    if (prev && (prev.metro !== stamp.metro || codegenChanged)) {
        const bundleDir = `${getWmProjectDir(projectDir)}/rn-bundle`;
        const vendorGen = `${appDir}/.wm-vendor-generation`;
        ['.vendor-cache', '.vendor-cache.current-key', '.extras-cache', '.user-cache']
            .forEach(f => fs.removeSync(`${bundleDir}/${f}`));
        if (fs.existsSync(vendorGen)) {
            fs.removeSync(`${fs.readFileSync(vendorGen, 'utf-8').trim()}/.vendor-cache`);
        }
    }
    fs.outputJSONSync(stampFile, stamp);
}


// Runs codegen's own pipeline (generate, install, Metro build) the way Studio does: with --rnAppPath on every
// run, or codegen falls back to a per-project install. Codegen publishes the bundle itself, so unlike the
// esbuild flow nothing is edited in the generated app afterwards.
// Syncs and builds run one at a time: a sync's `git clean` would delete a running build's lock and staging folder.
let queue = Promise.resolve();
const serial = fn => (queue = queue.catch(() => {}).then(fn));
let builtHead = '';

// Change detection straight from Studio's VCS instead of waiting for Studio's own preview build to rewrite its
// rn-bundle/index.html: pull every 3s (15s after 5 idle minutes); a pull with no new commit skips the build.
// Polls are silent (the pull logs every git command); build() restores the logger when a poll finds a change.
let restoreLogs = null;

function watchStudioChanges(previewUrl, syncAndBuild) {
    let lastChange = Date.now();
    const poll = async () => {
        const before = builtHead;
        const wasSilent = logger.silent;
        restoreLogs = () => { logger.silent = wasSilent; };
        logger.silent = true;
        await serial(syncAndBuild).catch(() => {});
        restoreLogs();
        restoreLogs = null;
        if (builtHead !== before) {
            lastChange = Date.now();
        }
        setTimeout(poll, Date.now() - lastChange > 5 * 60 * 1000 ? 15000 : 3000);
    };
    setTimeout(poll, 3000);
}

// Incremental runs come from the poll loop, already inside the queue; full runs (startup, codegen change) join it.
function transpile(projectDir, previewUrl, incremental) {
    return incremental ? build(projectDir, true) : serial(() => build(projectDir, false));
}

async function build(projectDir, incremental) {
    const head = execSync('git rev-parse HEAD', { cwd: projectDir }).toString().trim();
    if (incremental && head === builtHead) {
        return;
    }
    if (restoreLogs) {
        restoreLogs();
        logger.info({ label: loggerLabel, message: `Studio change ${head.slice(0, 7)} pulled, rebuilding.` });
    }
    taskLogger.start(previewSteps[3].start);
    taskLogger.setTotal(previewSteps[3].total);
    try {
        const env = process.env;
        const appDir = getExpoProjectDir(projectDir);
        const localRepo = env.WAVEMAKER_STUDIO_FRONTEND_CODEBASE && `${env.WAVEMAKER_STUDIO_FRONTEND_CODEBASE}/wavemaker-rn-codegen`;
        const codegen = localRepo ? `${localRepo}/build` : `${projectDir}/target/codegen/node_modules/@wavemaker/rn-codegen`;
        const uiVersion = getUiVersion(projectDir);
        if (!fs.existsSync(`${codegen}/index.js`)) {
            fs.outputJSONSync(`${projectDir}/target/codegen/package.json`, { private: true });
            await exec('npm', ['install', '--no-save', `@wavemaker/rn-codegen@${uiVersion}`], { cwd: `${projectDir}/target/codegen` });
        }
        const scope = fs.readJSONSync(`${codegen}/package.json`).name.split('/')[0];
        if (localRepo) {
            // Install local `file:` packages as copies: Metro won't follow symlinks out of its watch roots.
            env.npm_config_install_links = 'true';
        }
        // A developer machine, not a build container: lift codegen's container-sized limits (heap 2.5 GB,
        // 1 Metro worker, install admission, 5-min silence watchdog). An explicitly set variable still wins.
        env.WM_MAX_OLD_SPACE_MB ||= String(Math.floor(os.totalmem() / 1048576 / 2));
        env.WM_METRO_MAX_WORKERS ||= String(Math.max(1, os.cpus().length - 1));
        env.WM_DISABLE_INSTALL_ADMISSION ||= '1';
        env.WM_EXPO_EXPORT_STALL_MINUTES ||= '30';

        const rnAppPath = env.WM_RN_APP_PATH || (localRepo
            ? await ensureLocalRnApp(localRepo, scope, uiVersion)
            : await ensurePublishedRnApp(scope, uiVersion));
        if (!incremental) {
            // A full generation re-copies metro.config.js; this makes codegen re-apply its split-bundle patch.
            fs.removeSync(`${appDir}/.wm-prepare-lib-done`);
        }
        refreshOnCodegenChange(projectDir, rnAppPath, `${codegen}/src/templates/project/metro`);
        await exec('node', [codegen, 'transpile', '--profile="web-preview"', '--autoClean=false',
            `--incrementalBuild=${!!incremental}`, `--rnAppPath=${rnAppPath}`, getWmProjectDir(projectDir), appDir]);
        builtHead = head;
        taskLogger.succeed(previewSteps[3].succeed);
    } catch (e) {
        logger.error({ label: loggerLabel, message: e });
        taskLogger.fail(previewSteps[3].fail);
    }
}

module.exports = {
    runMetroWebPreview: (previewUrl, clean, authToken) => {
        launcher.extendWebPreview({
            transpile,
            // --clean also drops the shared rn-app installs, vendor stores and Metro caches (all projects).
            clean: dir => {
                [dir, ...['rn-app', 'vendor', '.wm-rn-cache'].map(d => `${global.rootDir}/${d}`)].forEach(forceRemove);
                fs.mkdirpSync(dir);
            },
            watchProjectChanges: watchStudioChanges,
        });
        launcher.runESBuildWebPreview(previewUrl, clean, authToken);
    }
};
