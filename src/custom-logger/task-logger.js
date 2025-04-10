const readline = require("readline");
const chalk = require("chalk");
const { ProgressBar, overallProgressBar } = require("./progress-bar");

class CustomSpinnerBar {
    constructor(options = {}) {
        if (!options.newInstance && CustomSpinnerBar.instance) {
            return CustomSpinnerBar.instance;
        }
        
        if (!options.newInstance) {
            CustomSpinnerBar.instance = this;
        }

        this.text = options.text || "Loading";
        this.spinner = options.spinner || [
            "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏",
        ];
        this.interval = options.interval || 80;
        this.stream = process.stderr;
        this.frameIndex = 0;
        this.isSpinning = false;
        this.spinnerInterval = null;

        this.progressBar = new ProgressBar(options);
    }

    start(text) {
        if (global.verbose) return;
        if (text) this.text = text;
        this.isSpinning = true;
        this.frameIndex = 0;
        this.resetProgressBar();
        this.progressBar.start();
        this.render();
        this.spinnerInterval = setInterval(() => this.render(), this.interval);
        return this;
    }

    stop() {
        if (global.verbose) return this;
        this.isSpinning = false;
        clearInterval(this.spinnerInterval);
        this.spinnerInterval = null;
        readline.clearLine(this.stream, 0);
        readline.cursorTo(this.stream, 0);
        return this;
    }

    succeed(text) {
        if (global?.verbose) return this;
        this.stop();

        this.progressBar.setProgress(this.progressBar.total);

        let output = `${chalk.green("✔")} ${text || this.text}`;
        output += " " + this.progressBar.render();

        this.stream.write(`${output}\n`);
        return this;
    }

    fail(text) {
        if (global.verbose) return this;
        this.stop();
        let finalText = text || this.text;
        if(global.logDirectory){
            finalText += chalk.gray(" Check logs at: ") + chalk.cyan(global.logDirectory);
        }
        this.stream.write(`${chalk.red('✖')} ${chalk.bold.red(finalText)}\n`);
        process.exit(1);
        // return this;
    }

    info(text) {
        if (global.verbose) return this;
        this.stop();
        this.stream.write(`${chalk.blue("ℹ")} ${text || this.text}\n`);
        return this;
    }

    warn(text) {
        if (global.verbose) return this;
        this.stop();
        this.stream.write(`${chalk.yellow("⚠")} ${text || this.text}\n`);
        return this;
    }

    render() {
        if (global.verbose) return;
        readline.clearLine(this.stream, 0);
        readline.cursorTo(this.stream, 0);
    
        const frame = this.spinner[this.frameIndex] || '';
        const progressBar = this.progressBar?.render() || '';
        const overallProgress = overallProgressBar?.render() || '';
    
        const output = `${chalk.cyan(frame)} ${this.text} ${progressBar} ${overallProgressBar.status() ?`| ${overallProgress}` : ''}`;
        this.stream.write(output);
    
        this.frameIndex = (this.frameIndex + 1) % this.spinner.length;
    }
    
    setText(text) {
        this.text = text;
        return this;
    }

    resetProgressBar(startValue = 0) {
        this.progressBar.value = Math.min(Math.max(0, startValue), this.progressBar.total);
        this.progressBar.startTime = Date.now();
        return this;
    }

    setProgress(value) {
        this.progressBar.setProgress(value);
        overallProgressBar.setProgress(value);
        return this;
    }

    incrementProgress(amount = 1) {
        this.progressBar.incrementProgress(amount);
        overallProgressBar.incrementProgress(amount);
        return this;
    }

    setTotal(total) {
        this.progressBar.setTotal(total);
        return this;
    }

    enableProgressBar() {
        this.progressBar.enable();
        return this;
    }

    disableProgressBar() {
        this.progressBar.disable();
        return this;
    }
}

// Exporting singleton instance and function for new instance
module.exports = {
    spinnerBar: new CustomSpinnerBar(),
    createNewSpinnerBar: (options) => new CustomSpinnerBar({ ...options, newInstance: true })
};
