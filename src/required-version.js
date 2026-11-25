const readline = require('readline');
const axios = require('axios');
const chalk = require('chalk');
const execa = require('execa');
const semver = require('semver');
const pkg = require('../package.json');

const REQUIRED_DIST_TAG = 'required';
const REGISTRY = 'https://registry.npmjs.org';
const LOOKUP_TIMEOUT_MS = 3000;
const IGNORE_FLAG = '--ignoreUpgrade';

function hasIgnoreFlag(argv) {
    return argv.some(a => /^--(ignoreUpgrade|ignore-upgrade)(=true)?$/.test(a));
}

function shouldSkip(argv) {
    if (hasIgnoreFlag(argv)) {
        return true;
    }
    return !argv.length || argv.some(a => a === '-h' || a === '--help' || a === '--version');
}

async function fetchRequiredVersion() {
    try {
        const url = `${REGISTRY}/-/package/${pkg.name.replace('/', '%2f')}/dist-tags`;
        const res = await axios.get(url, { timeout: LOOKUP_TIMEOUT_MS });
        const version = res.data && res.data[REQUIRED_DIST_TAG];
        return semver.valid(version) ? version : null;
    } catch (e) {
        return null;
    }
}

function isInteractive() {
    return !!(process.stdin.isTTY && process.stdout.isTTY);
}

function askYesNo(question) {
    return new Promise(resolve => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(`${chalk.green('?')} ${chalk.bold(question)} ${chalk.dim('(Y/n)')} `, answer => {
            const a = (answer || '').trim().toLowerCase();
            resolve(a === '' || a === 'y' || a === 'yes');
            rl.close();
        });
        rl.on('SIGINT', () => rl.close());
        rl.on('close', () => resolve(false));
    });
}

function quoteArg(arg) {
    return /[\s"'$`\\]/.test(arg) ? `'${arg.replace(/'/g, `'\\''`)}'` : arg;
}

function commandLine(argv) {
    return ['wm-reactnative', ...argv].map(quoteArg).join(' ');
}

function printHowToContinue(required) {
    console.error(`  Upgrade with ${chalk.cyan(`npm install -g ${pkg.name}@${required}`)} and run your command again,`);
    console.error(`  or add ${chalk.cyan(IGNORE_FLAG)} to run it on ${pkg.version} anyway.`);
}

async function upgradeTo(version) {
    const spec = `${pkg.name}@${version}`;
    const installCmd = `npm install -g ${spec}`;
    try {
        await execa('npm', ['install', '-g', spec], { stdio: 'pipe' });
        return true;
    } catch (e) {
        console.error(chalk.red(`✖ Upgrade to ${version} failed.`));
        const details = (e.stderr || e.message || '').trim();
        if (details) {
            console.error(chalk.dim(details));
        }
        console.error(`  Run ${chalk.cyan(installCmd)} yourself, then run your command again.`);
        return false;
    }
}

function rerun(argv) {
    console.log(`${chalk.blue('●')} Running: ${commandLine(argv)}`);
    const child = require('child_process').spawn(process.execPath, [process.argv[1], ...argv, IGNORE_FLAG], {
        stdio: 'inherit'
    });
    child.on('exit', (code, signal) => {
        if (signal) {
            process.kill(process.pid, signal);
        } else {
            process.exit(code === null ? 1 : code);
        }
    });
    child.on('error', err => {
        console.error(chalk.red(`✖ Could not start the upgraded CLI: ${err.message}`));
        process.exit(1);
    });
}

async function ensureRequiredVersion(argv = process.argv.slice(2)) {
    if (shouldSkip(argv)) {
        return true;
    }
    const required = await fetchRequiredVersion();
    if (!required || !semver.lt(pkg.version, required)) {
        return true;
    }

    console.log(`${chalk.yellow('!')} You're on CLI v${pkg.version}. Release v${required} is required:`);

    if (!isInteractive()) {
        printHowToContinue(required);
        process.exitCode = 1;
        return false;
    }

    if (!(await askYesNo(`Upgrade to ${required} and run your command again?`))) {
        printHowToContinue(required);
        process.exitCode = 1;
        return false;
    }

    if (!(await upgradeTo(required))) {
        process.exitCode = 1;
        return false;
    }
    console.log(`${chalk.green('✔')} Upgraded to ${required}`);
    rerun(argv);
    return false;
}

module.exports = {
    ensureRequiredVersion,
    REQUIRED_DIST_TAG
};
