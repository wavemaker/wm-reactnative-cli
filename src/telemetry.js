const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Writable } = require('stream');
const pkg = require('../package.json');

const ENABLED = !/^(off|false|0|no)$/i.test(process.env.WM_CLI_TELEMETRY || '');
const ENDPOINT = process.env.WM_CLI_TELEMETRY_URL || 'https://wm-build-preview.wavemaker.ai/api/public/cli-logs';
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
const EXIT_CODE = { SIGINT: 130, SIGTERM: 143 };

const run = {
    runId: crypto.randomUUID(),
    cliVersion: pkg.version,
    command: null,
    os: `${os.platform()} ${os.release()}`,
    node: process.version,
    startedAt: new Date().toISOString(),
    platformHost: null,
    project: null,
    codegenVersion: null,
    runtimeVersion: null,
    lines: []
};
let started = false;
let signal = null;

function record(level, message) {
    if (!started || message === undefined || message === null) {
        return;
    }
    const msg = (message instanceof Error ? message.stack : String(message)).replace(ANSI, '').trim();
    if (msg) {
        run.lines.push({ t: new Date().toISOString(), level, msg });
    }
}

function set(fields) {
    Object.assign(run, fields);
}

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return null;
    }
}

// Installed version of a package in a generated app, else the version its package.json asks for.
function packageVersion(appDir, deps, name) {
    return (readJson(path.join(appDir, 'node_modules', name, 'package.json')) || {}).version || deps[name] || null;
}

// The rn-codegen package a preview used: the local repo build, else the one installed in the project.
function codegenDirOf(projectDir) {
    const codegenRepo = process.env.WAVEMAKER_STUDIO_FRONTEND_CODEBASE;
    if (codegenRepo) {
        return path.join(codegenRepo, 'wavemaker-rn-codegen');
    }
    // Required here, not at the top: wm-scope loads the logger, which loads this module.
    return Object.values(require('./wm-scope').SCOPES)
        .map((scope) => path.join(projectDir, 'target/codegen/node_modules', scope, 'rn-codegen'))
        .find((dir) => fs.existsSync(path.join(dir, 'package.json')));
}

// Project and versions at exit, from the synced project (projectDir) and the generated app (appDir).
function readVersions({ projectDir, appDir }) {
    const versions = {};
    if (projectDir) {
        try {
            const codegenDir = codegenDirOf(projectDir);
            versions.runtimeVersion = require('./utils').getUiVersion(projectDir) || null;
            versions.codegenVersion = (codegenDir && (readJson(path.join(codegenDir, 'package.json')) || {}).version) || versions.runtimeVersion;
        } catch (e) {
            record('debug', `telemetry could not read the project versions: ${e.message}`);
        }
    }
    if (appDir) {
        const pkg = readJson(path.join(appDir, 'package.json')) || {};
        const deps = { ...pkg.devDependencies, ...pkg.dependencies };
        const runtime = Object.keys(deps).find((name) => name.endsWith('/app-rn-runtime'));
        versions.project = run.project || (readJson(path.join(appDir, 'wm_rn_config.json')) || {}).name || null;
        versions.runtimeVersion = (runtime && packageVersion(appDir, deps, runtime)) || versions.runtimeVersion || null;
        versions.versions = { installed: { expo: packageVersion(appDir, deps, 'expo'), react_native: packageVersion(appDir, deps, 'react-native') } };
    }
    return versions;
}

// Winston transport target: every logger call, whatever the console verbosity.
const logStream = new Writable({
    objectMode: true,
    write(info, _enc, done) {
        record(String(info && info.level || 'info').replace(ANSI, ''), info && info.message);
        done();
    }
});

function send(code) {
    const file = path.join(os.tmpdir(), `wm-cli-run-${run.runId}.json`);
    try {
        const { projectDir, appDir, ...fields } = run;
        fs.writeFileSync(file, JSON.stringify({
            ...fields, ...readVersions({ projectDir, appDir }), endedAt: new Date().toISOString(), exitCode: signal ? null : code, signal
        }));
        spawn(process.execPath, [path.join(__dirname, 'telemetry-sender.js'), file, ENDPOINT], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } catch (e) {
        // Telemetry must never affect the command itself; drop the hand-off file the sender would have deleted.
        fs.rmSync(file, { force: true });
    }
}

function start(args) {
    if (!ENABLED || started) {
        return;
    }
    started = true;
    run.command = args._.join(' ');
    // build, eject, prepare and embed take the generated app as [src]; build replaces it once unpacked.
    run.appDir = args.src ? path.resolve(String(args.src)) : null;
    try {
        run.platformHost = args.previewUrl ? new URL(args.previewUrl).origin : null;
    } catch (e) {
        run.platformHost = null;
    }
    process.on('uncaughtExceptionMonitor', (e) => record('error', e));
    Object.keys(EXIT_CODE).forEach((sig) => process.once(sig, () => {
        signal = sig;
        process.exit(EXIT_CODE[sig]);
    }));
    process.once('exit', send);
}

module.exports = { start, set, record, logStream };
