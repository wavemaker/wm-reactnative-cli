const {
    createLogger,
    format,
    transports
} = require('winston');
const {
    colorize,
    combine,
    timestamp,
    printf
} = format;

const consoleFormat = printf(({
    level,
    message,
    label,
    timestamp
}) => {
    return `${timestamp} [${label}] [${level}]: ${message}`;
});

const jsonFormat = printf(({
    level,
    message,
    label,
    timestamp
}) => {
    return JSON.stringify({
        timestamp,
        label,
        level,
        message
    });
});
var logger = createLogger({
    level: 'debug',
    transports: [
        new(transports.Console)({
            timestamp: function () {
                return Date.now();
            },
            format: combine(
                colorize(),
                timestamp(),
                consoleFormat
            )
        }),
    ]
});

logger.setLogDirectory = (path) => {
    logger.configure({
        level: 'debug',
        transports: [
            new(transports.Console)({
                timestamp: function () {
                    return Date.now();
                },
                format: combine(
                    colorize(),
                    timestamp(),
                    consoleFormat
                )
            }),
            new(transports.File)({
                filename: path + 'build.log',
                timestamp: function () {
                    return Date.now();
                },
                format: combine(
                    timestamp(),
                    consoleFormat
                )
            }),
            new(transports.File)({
                filename: path + '/build.json.log',
                timestamp: function () {
                    return Date.now();
                },
                format: combine(
                    timestamp(),
                    jsonFormat
                )
            })
        ]
    });
};

// Add method to enable/disable logging
logger.setVerbose = (verbose) => {
    if (!verbose) {
        logger.level = 'silent';
    }
};

module.exports = logger;