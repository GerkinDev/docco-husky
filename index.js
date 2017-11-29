const _ = require('lodash');
const path = require('path');
const winston = require('winston');
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;

module.exports = config => {
	const logLevel = _.findKey(winston.config.npm.levels, v => v === config.verbosity);
	_.defaults(config, {
		cwd: process.cwd(),
		verbosity: 0,
		packageFile: 'package.json',
		configFile: '.dochow.json',
		output: false,
		singleFile: false,
		templateDir: path.resolve(__dirname, 'resources'),
		logger: winston.createLogger({
			level: logLevel,
			format: winston.format.combine(
				winston.format.colorize({ all: true }),
				winston.format.simple()
			),
			transports: [new winston.transports.Console()],
		}),
	});
	config.logger.debug('Provided options: ', _.omit(config, 'logger'));

	return require('./lib/documentProject')( config );
}