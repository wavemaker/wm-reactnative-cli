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

const taskLogger = require('./custom-logger/task-logger')();

const consoleFormat = printf(({
    level,
    message,
    label,
    timestamp
}) => {
    if(level === 'error'){
        taskLogger.warn(message);
    }
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
    silent: !global.verbose,
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
                silent: !global.verbose,
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
                    colorize(),
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
                    colorize(),
                    timestamp(),
                    jsonFormat
                )
            }),
            new transports.File({
                filename: path + '/error.log',
                level: 'error',
                format: combine(
                    timestamp(),
                    consoleFormat
                ),
            })
        ]
    });
};

module.exports = logger;