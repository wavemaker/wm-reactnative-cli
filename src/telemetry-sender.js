// Runs detached after the CLI exits: redacts the run, posts it gzipped, deletes the hand-off file.
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const axios = require('axios');
const { VERSIONS } = require('./requirements');

// The tools requirements.js checks, read here so no command waits for them.
const TOOLS = {
    npm: ['--version'],
    yarn: ['--version'],
    git: ['--version'],
    java: ['-version'],
    gradle: ['--version'],
    ...(process.platform === 'darwin' ? { pod: ['--version'] } : {})
};

const [file, endpoint] = process.argv.slice(2);
const home = os.homedir();
const REDACTIONS = [
    [/(auth_cookie=)[^;\s"']+/gi, '$1<redacted>'],
    [/((?:^|[\s"'{,])cookie["']?\s*[:=]\s*["']?)[^"'\n]+/gi, '$1<redacted>'],
    [/([#?&]token=)[^&\s"']+/gi, '$1<redacted>'],
    [/(?:\/Users|\/home)\/[^/\s"']+/g, '~'],
    [/[A-Z]:\\Users\\[^\\\s"']+/gi, '~']
];

function redact(text) {
    return REDACTIONS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text.split(home).join('~'));
}

function versionOf(cmd, args) {
    const result = spawnSync(cmd, args, { encoding: 'utf8', timeout: 20000, shell: process.platform === 'win32' });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    const text = cmd === 'gradle' ? output.slice(output.indexOf('Gradle')) : output;
    return (text.match(/[0-9]+\.[0-9.]+/) || [])[0] || null;
}

(async () => {
    try {
        const run = JSON.parse(fs.readFileSync(file, 'utf8'));
        const installed = { node: process.version.slice(1) };
        Object.entries(TOOLS).forEach(([cmd, args]) => {
            installed[cmd] = versionOf(cmd, args);
        });
        run.versions = { installed: { ...installed, ...(run.versions && run.versions.installed) }, required: VERSIONS };
        run.lines.forEach((line) => {
            line.msg = redact(line.msg);
        });
        await axios.post(endpoint, zlib.gzipSync(JSON.stringify(run)), {
            headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
            timeout: 15000
        });
    } catch (e) {
        // Nothing to report to: the CLI has already exited.
    } finally {
        fs.rmSync(file, { force: true });
    }
})();
