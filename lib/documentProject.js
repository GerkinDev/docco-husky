const _ = require('lodash');
const path = require('path');
const chalk = require('chalk');
const fs = require('fs-extra');

const loadConfig = (options, optKey, dataAccessor) => {
	// First get the configuration path (relative to the working directory set)
	const configPath = options[optKey];
	if(_.isString(options[optKey]) && options[optKey].length > 0){ // The path is a string, handle it
		const configAbsPath = path.resolve(options.cwd, configPath);
		try {
			const config = require(configAbsPath );
			// Access the path in the retrieved configuration
			const accessedData = _.get(config, dataAccessor);
			options.logger.silly(`Loading data from ${chalk.bold(configPath)}:`, accessedData);
			// Inject it in our options
			_.defaults(options, accessedData);
			// Return the whole required file (it may be usefull)
			return config;
		} catch ( err ) {
			options.logger.warn( `Error parsing ${configPath}`, err );
			return {};
		}
	}
}

const documentProject = async options => {
	// Retrieve infos from config file
	loadConfig(options, 'configFile');
	// Retrieve infos from package file
	const packageJson = loadConfig(options, 'packageFile', 'dochow');

	options.logger.verbose('Final configuration:', _.omit(options, ['logger']));

	if(options.output){
		if(options.singleFile){
			await fs.ensureDir(path.dirname(options.output));
		} else {
			await fs.ensureDir(options.output);
		}
	}

	const promises = [
		promisify(fs.readFile)(path.resolve(context.config.template_dir, 'docco.css')).then(content => promisify(fs.writeFile)(path.resolve(context.config.output_dir, 'docco.css'), content.toString())).catch(err => {
			return Promise.resolve();
		}),
		generators.readme( context, package_json ),
		Promise.map(paths, path => generators.documentation( context, path )),
	];
	if ( options.content_dir ) {
		promises.push(generators.content( context ));
	}

	return promises.reduce(function (soFar, f) {
		return soFar.then(f);
	}, Promise.resolve());
};

module.exports = documentProject;