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
        this.stream = process.stderr;
        this.frameIndex = 0;
        this.isSpinning = false;
        this.spinnerInterval = null;
        this.lastOutput = '';
        this.lastProgressValue = -1;
        this.renderCount = 0;
        
        this.startTime = null;
        
        // Only render every 10th frame to reduce I/O operations
        this.renderThrottle = 10;
        
        // Set default colors if not provided
        const progressBarOptions = {
            completeColor: 'green',
            incompleteColor: 'gray',
            ...options
        };
        this.progressBar = new ProgressBar(progressBarOptions);
    }

    start(text) {
        if (global.verbose) return;
        if (text) this.text = text;
        this.isSpinning = true;
        this.frameIndex = 0;
        this.renderCount = 0;
        this.startTime = Date.now();
        this.resetProgressBar();
        this.progressBar.start();
        
        // Render immediately on start
        this.render(true);
        
        // Balanced interval for good responsiveness without performance impact
        this.spinnerInterval = setInterval(() => {
            this.frameIndex = (this.frameIndex + 1) % this.spinner.length;
            this.renderCount++;
            
            // Render every 5th frame for balanced performance and responsiveness
            if (this.renderCount % 5 === 0) {
                this.render();
            }
        }, 200); // Keep 200ms interval for good performance
        
        return this;
    }

    stop() {
        if (global.verbose) return this;
        this.isSpinning = false;
        if (this.spinnerInterval) {
            clearInterval(this.spinnerInterval);
            this.spinnerInterval = null;
        }
        this.clearLine();
        return this;
    }

    getElapsedTime() {
        if (!this.startTime) return 0;
        return this.formatTime(Date.now() - this.startTime);
    }

    formatTime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const ms = milliseconds % 1000;
        
        if (seconds < 60) {
            return `${seconds}.${Math.floor(ms / 100)}s`;
        }
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    }

    getTimestamp() {
        const now = new Date();
        return now.toTimeString().split(' ')[0];
    }

    succeed(text) {
        if (global?.verbose) return this;
        this.stop();

        this.progressBar.setProgress(this.progressBar.total);
        const finalText = text || this.text;
        const output = `${chalk.gray(`[${this.getTimestamp()}]`)} ${chalk.green("✔")} ${finalText} ${this.progressBar.render()} ${chalk.gray(`(${this.getElapsedTime()})`)}`;
        this.clearLine();
        this.writeLine(output);
        return this;
    }

    fail(text) {
        if (global.verbose) return this;
        this.stop();
        let finalText = text || this.text;
        if(global.logDirectory){
            finalText += chalk.gray(" Check logs at: ") + chalk.cyan(global.logDirectory);
        }
        
        this.clearLine();
        this.writeLine(`${chalk.gray(`[${this.getTimestamp()}]`)} ${chalk.red('✖')} ${chalk.bold.red(finalText)} ${chalk.gray(`(${this.getElapsedTime()})`)}`);
        process.exit(1);
    }

    info(text) {
        if (global.verbose) return this;
        this.stop();
        this.clearLine();
        this.writeLine(`${chalk.gray(`[${this.getTimestamp()}]`)} ${chalk.blue("ℹ")} ${text || this.text}`);
        return this;
    }

    warn(text) {
        if (global.verbose) return this;
        this.stop();
        this.clearLine();
        this.writeLine(`${chalk.gray(`[${this.getTimestamp()}]`)} ${chalk.yellow("⚠")} ${text || this.text}`);
        return this;
    }

    render(force = false) {
        if (global.verbose) return;
        
        const frame = this.spinner[this.frameIndex] || '';
        const progressBar = this.progressBar?.render() || '';
        const overallProgress = overallProgressBar?.render() || '';
        
        // Show only one progress bar - prefer the local one if enabled, otherwise show overall
        const displayProgress = this.progressBar.status() ? progressBar : (overallProgressBar.status() ? overallProgress : '');
        const output = `${chalk.cyan(frame)} ${this.text} ${displayProgress}`;
        
        const outputChanged = output !== this.lastOutput
        const progressChanged = this.progressBar.value !== this.lastProgressValue;
        if (force || progressChanged || !this.lastOutput || outputChanged) {
            this.clearLine();
            this.stream.write(output);
            this.lastOutput = output;
            this.lastProgressValue = this.progressBar.value;
        }
    }
    
    // Helper methods to reduce code duplication
    clearLine() {
        readline.clearLine(this.stream, 0);
        readline.cursorTo(this.stream, 0);
    }
    
    writeLine(text) {
        this.stream.write(`${text}\n`);
    }
    
    setText(text) {
        if (this.text !== text) {
            this.text = text;
            // Force render when text changes
            if (this.isSpinning) {
                this.render(true);
            }
        }
        return this;
    }

    resetProgressBar(startValue = 0) {
        this.progressBar.value = Math.min(Math.max(0, startValue), this.progressBar.total);
        this.progressBar.startTime = Date.now();
        return this;
    }

    setProgress(value) {
        const oldValue = this.progressBar.value;
        this.progressBar.setProgress(value);
        
        // Only update overall progress bar if local progress bar is not enabled
        if (!this.progressBar.status()) {
            overallProgressBar.setProgress(value);
        }
        
        // Force render only on significant progress changes to avoid performance impact
        if (Math.abs(value - oldValue) >= 0.5 && this.isSpinning) {
            this.render(true);
        }
        return this;
    }

    incrementProgress(amount = 1) {
        this.setProgress(this.progressBar.value + amount);
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