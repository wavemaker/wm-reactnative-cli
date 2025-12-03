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
        
        // Performance optimizations
        this.cachedOutput = '';
        this.lastValue = -1;
        this.lastPercentage = -1;
        this.etaCache = '?';
        this.etaCacheTime = 0;
        this.etaCacheInterval = 2000; // Cache ETA for 2 seconds
    }

    start() {
        this.startTime = Date.now();
        this.invalidateCache();
    }

    setProgress(value) {
        const newValue = Math.min(Math.max(0, value), this.total);
        if (newValue !== this.value) {
            this.value = newValue;
            this.invalidateCache();
        }
    }

    incrementProgress(amount = 1) {
        this.setProgress(this.value + amount);
    }

    setTotal(total) {
        if (total !== this.total) {
            this.total = total;
            this.invalidateCache();
        }
    }

    enable() {
        this.showProgressBar = true;
        this.invalidateCache();
    }

    disable() {
        this.showProgressBar = false;
        this.invalidateCache();
    }

    status() {
        return this.showProgressBar;
    }

    invalidateCache() {
        this.cachedOutput = '';
        this.lastValue = -1;
        this.lastPercentage = -1;
    }

    calculateETA() {
        if (!this.startTime || this.value === 0 || this.value === this.total) {
            return '?';
        }
        
        const now = Date.now();
        
        // Use cached ETA if it's still fresh
        if (now - this.etaCacheTime < this.etaCacheInterval && this.etaCache !== '?') {
            return this.etaCache;
        }
        
        const elapsedTime = (now - this.startTime) / 1000;
        if (elapsedTime < 2) { // Wait at least 2 seconds before calculating ETA
            this.etaCache = '?';
            this.etaCacheTime = now;
            return '?';
        }
        
        const itemsPerSecond = this.value / elapsedTime;
        if (itemsPerSecond <= 0) {
            this.etaCache = '?';
            this.etaCacheTime = now;
            return '?';
        }
        
        const eta = Math.round((this.total - this.value) / itemsPerSecond);
        this.etaCache = isFinite(eta) && eta > 0 ? this.formatTime(eta) : '?';
        this.etaCacheTime = now;
        
        return this.etaCache;
    }

    formatTime(seconds) {
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    }

    render() {
        if (!this.showProgressBar) return '';
        
        const percentage = Math.floor((this.value / this.total) * 100);
        
        // Use cached output if nothing significant changed
        if (this.value === this.lastValue && percentage === this.lastPercentage && this.cachedOutput) {
            return this.cachedOutput;
        }
        
        const completeLength = Math.round((this.value / this.total) * this.barWidth);
        const incompleteLength = this.barWidth - completeLength;
        
        let completeBar = this.barCompleteChar.repeat(completeLength);
        let incompleteBar = this.barIncompleteChar.repeat(incompleteLength);
        
        // Apply colors only if specified
        if (this.completeColor) completeBar = chalk[this.completeColor](completeBar);
        if (this.incompleteColor) incompleteBar = chalk[this.incompleteColor](incompleteBar);
        
        const bar = completeBar + incompleteBar;
        
        // Apply textColor only to non-bar parts to preserve bar colors
        let formattedText = this.barFormat
            .replace('{bar}', bar)
            .replace('{percentage}', this.textColor ? chalk[this.textColor](percentage) : percentage)
            .replace('{value}', this.textColor ? chalk[this.textColor](this.value) : this.value)
            .replace('{total}', this.textColor ? chalk[this.textColor](this.total) : this.total)
            .replace('{eta}', this.textColor ? chalk[this.textColor](this.calculateETA()) : this.calculateETA());
        
        // Cache the result
        this.cachedOutput = formattedText;
        this.lastValue = this.value;
        this.lastPercentage = percentage;
        
        return formattedText;
    }
}

// Create a more efficient overall progress bar (disabled by default)
const overallProgressBar = new ProgressBar({
    showProgressBar: false, // Disabled by default to avoid dual progress bars
    barWidth: 30, // Slightly smaller for better performance
    completeColor: 'green',
    incompleteColor: 'gray',
    textColor: 'cyan',
    barFormat: '[{bar}] {percentage}%' // Removed ETA for overall progress to improve performance
});

module.exports = {
    ProgressBar,
    overallProgressBar
};