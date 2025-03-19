const chalk = require('chalk');

class ProgressBar {
    constructor(options = {}) {
        this.showProgressBar = options.showProgressBar || false;
        this.barCompleteChar = options.barCompleteChar || '█';
        this.barIncompleteChar = options.barIncompleteChar || '░';
        this.barWidth = options.barWidth || 20;
        this.barFormat = options.barFormat || '[{bar}] {percentage}%';
        this.total = options.total || 100;
        this.value = 0;
        this.startTime = null;
        
        // Optional color configurations
        this.completeColor = options.completeColor || null;
        this.incompleteColor = options.incompleteColor || null;
        this.textColor = options.textColor || null;
    }

    start() {
        this.startTime = Date.now();
    }

    setProgress(value) {
        this.value = Math.min(Math.max(0, value), this.total);
    }

    incrementProgress(amount = 1) {
        this.setProgress(this.value + amount);
    }

    setTotal(total) {
        this.total = total;
    }

    enable() {
        this.showProgressBar = true;
    }

    disable() {
        this.showProgressBar = false;
    }

    calculateETA() {
        if (!this.startTime || this.value === 0) return '?';
        const elapsedTime = (Date.now() - this.startTime) / 1000;
        const itemsPerSecond = this.value / elapsedTime;
        const eta = Math.round((this.total - this.value) / itemsPerSecond);
        return isFinite(eta) ? eta : '?';
    }

    render() {
        if (!this.showProgressBar) return '';
        const percentage = Math.floor((this.value / this.total) * 100);
        const completeLength = Math.round((this.value / this.total) * this.barWidth);
        const incompleteLength = this.barWidth - completeLength;
        
        let completeBar = this.barCompleteChar.repeat(completeLength);
        let incompleteBar = this.barIncompleteChar.repeat(incompleteLength);
        
        if (this.completeColor) completeBar = chalk[this.completeColor](completeBar);
        if (this.incompleteColor) incompleteBar = chalk[this.incompleteColor](incompleteBar);
        
        let bar = completeBar + incompleteBar;
        let formattedText = this.barFormat
            .replace('{bar}', bar)
            .replace('{percentage}', percentage)
            .replace('{value}', this.value)
            .replace('{total}', this.total)
            .replace('{eta}', this.calculateETA());
        
        if (this.textColor) formattedText = chalk[this.textColor](formattedText);
        
        return formattedText;
    }
}

const overallProgressBar = new ProgressBar({
    showProgressBar: true,
    barWidth: 40,
    completeColor: 'green',
    incompleteColor: 'gray',
    textColor: 'cyan'
});

module.exports = {
    ProgressBar,
    overallProgressBar
};