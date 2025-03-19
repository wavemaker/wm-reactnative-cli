const execa = require('execa');
const logger = require('./logger');
const loggerLabel = 'exec';

function isErrorWithoutWarning(v) {
    const lowerV = v.toLowerCase();
    return lowerV.includes("error") && (!lowerV.includes("warning") && !lowerV.includes("warn"));
}

class OutputPipe {
    constructor(bufferSize, log, loggerLabel) {
        this.output = '';
        this.content = [];
        this.bufferSize = bufferSize || 100;
        this.logOutput = (log !== false);
        this.loggerLabel = loggerLabel;
    }
    log(str, isErrorType) {
        let reminder = '';
        str.split('\n').forEach((v, i, splits) => {
            if (i < splits.length - 1) {
                v && (this.logOutput || isErrorType) && (isErrorType && isErrorWithoutWarning(v) ? logger.error({label: this.loggerLabel, message: v}) : logger.debug({label: this.loggerLabel, message: v}));
                if (this.content.length > this.bufferSize) {
                    this.content.shift();
                }
                this.content.push(v);
            } else {
                reminder = v;
            }
        });
        return reminder;
    }
    push(str, isErrorType) {
        if (str) {
            this.output = this.log(this.output + str, isErrorType) || '';
        }
    }
    flush() {
        this.log(this.output + '\n');
    }
}

module.exports = {
    'exec': (cmd, args, options) => {
        logger.info({
            label: loggerLabel,
            message: `
        \x1b[1;34m    ╔════════════════════════════════════╗
            ║ Executing: ${cmd} ${(args && args.join(' '))}
            ╚════════════════════════════════════╝\x1b[0m
            `
        });
        
        const outputPipe = new OutputPipe(100, options && options.log, cmd.substr(cmd.lastIndexOf('/') + 1));
        const spawn = execa(cmd, args, {...options, env:{...process.env, FORCE_COLOR:'1'}});
        spawn.stdout.on('data', (data) => {
            outputPipe.push(String.fromCharCode.apply(null, new Uint16Array(data)));
        });
        spawn.stderr.on('data', (data) => {
            outputPipe.push(String.fromCharCode.apply(null, new Uint16Array(data)), true);
        });
        return new Promise((resolve, reject) => {
            spawn.on('close', code => {
                outputPipe.flush();
                if (code == 0) {
                    resolve(outputPipe.content);
                } else {
                    reject(code);
                }
            });
        });
    }
};
