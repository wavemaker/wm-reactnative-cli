const readline = require('readline');
const chalk = require('chalk');

class CustomSpinner {
    constructor(options = {}) {
        this.text = options.text || 'Loading';
        this.spinner = options.spinner || ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        this.interval = options.interval || 80;
        this.stream = process.stderr;
        this.frameIndex = 0;
        this.isSpinning = false;
        this.spinnerInterval = null;
    }

    start(text) {
        if (global.verbose) return;
        if (text) this.text = text;
        this.isSpinning = true;
        this.frameIndex = 0;
        this.render();
        this.spinnerInterval = setInterval(() => {
            this.render();
        }, this.interval);
        return this;
    }

    stop() {
        if (global.verbose) return this;
        this.isSpinning = false;
        if (this.spinnerInterval) {
            clearInterval(this.spinnerInterval);
            this.spinnerInterval = null;
        }
        readline.clearLine(this.stream, 0);
        readline.cursorTo(this.stream, 0);
        return this;
    }

    succeed(text) {
        if (global.verbose) return this;
        this.stop();
        const finalText = text || this.text;
        this.stream.write(`${chalk.green('✔')} ${finalText}\n`);
        return this;
    }

    fail(text) {
        if (global.verbose) return this;
        this.stop();
        const finalText = text || this.text;
        this.stream.write(`${chalk.red('✖')} ${finalText}\n`);
        return this;
    }

    info(text) {
        if (global.verbose) return this;
        this.stop();
        const finalText = text || this.text;
        this.stream.write(`${chalk.blue('ℹ')} ${finalText}\n`);
        return this;
    }

    warn(text) {
        if (global.verbose) return this;
        this.stop();
        const finalText = text || this.text;
        this.stream.write(`⚠ ${finalText}\n`);
        return this;
    }

    render() {
        if (global.verbose) return;
        readline.clearLine(this.stream, 0);
        readline.cursorTo(this.stream, 0);
        const frame = this.spinner[this.frameIndex];
        this.stream.write(`${chalk.cyan(frame)} ${this.text}`);
        this.frameIndex = ++this.frameIndex % this.spinner.length;
    }

    setText(text) {
        this.text = text;
        return this;
    }
}

module.exports = function(options) {
    return new CustomSpinner(options);
};
