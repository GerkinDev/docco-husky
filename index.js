const _ = require('lodash');

module.exports = args => {
	_.defaults(args, {
		cwd: process.cwd(),
	});

	return documentProject( args, files, commander );
}