'use strict';

const fs = require( 'fs' );
const path = require( 'path' );
const pug = require( 'pug' );
const dox = require( 'dox' );
const gravatar = require( 'gravatar' );
const _ = require( 'lodash' );
const commander = require( 'commander' );
const {
	spawn, exec,
} = require( 'child_process' );
const Promise = require('bluebird');
const promisify = Promise.promisify;
const escapeStringRegexp = require('escape-string-regexp');
const chalk = require('chalk');
const StateMachine = require('javascript-state-machine');
const acorn = require('acorn');

const inspect = data => console.log(require('util').inspect(data, {colors: true, depth: 8}));

const languages = _.mapValues({
	'.coffee': {
		name:   'coffee-script',
		symbol: '#',
	},
	'.js': {
		name:        'javascript',
		symbol:      '//',
		multi_start: '/*',
		multi_end:   '*/',
	},
	'.rb': {
		name:   'ruby',
		symbol: '#',
	},
	'.py': {
		name:   'python',
		symbol: '#',
	},
	'.java': {
		name:        'java',
		symbol:      '//',
		multi_start: '/*',
		multi_end:   '*/',
	},
	/*'.json': {
		name: 'json',
	},*/
	'_': {
		name:        'unknown',
	},
}, language => {
	const nonMatchingRegex = /.^/;
	language.comment_matcher = language.symbol ? new RegExp(  escapeStringRegexp(language.symbol) ) : nonMatchingRegex;
	if(!language.multi_start_matcher){
		if ( '/*' === language.multi_start ) {
			language.multi_start_matcher = new RegExp( /\/\*/ );
		} else if(language.multi_start){
			language.multi_start_matcher = new RegExp('^' + escapeStringRegexp(language.multi_start));
		} else {
			language.multi_start_matcher = nonMatchingRegex;
		}
	}
	if(!language.multi_end_matcher){
		if ( '*/' === language.multi_end ) {
			language.multi_end_matcher = new RegExp( /\*\// );
		} else if(language.multi_end){
			language.multi_end_matcher = new RegExp(escapeStringRegexp(language.multi_end) + '$');
		} else {
			language.multi_end_matcher = nonMatchingRegex;
		}
	}
	return language;
});

const defaultTemplateDir = path.resolve(__dirname, '../resources');
var check_config, ext, l;

const makeContext = (options, sources) => {
	const context = {
		config: _.cloneDeep(options),
		sources
	};
	_.defaults(context.config, {
		template_dir:	defaultTemplateDir,
		readme:			'README.md',
		readme_title:	'README',
		output_dir:		'docs',
		content_dir:	null,
		show_timestamp:	true,
		project_name:	'',
		cwd: process.cwd(),
		files: [],
	});

	const templateBuilder = templateGen(context);
	context.templates = {
		docco: templateBuilder('docco.pug'),
		dox: templateBuilder('dox.pug'),
		content: templateBuilder('content.pug'),
		readme: templateBuilder('readme.pug'),
		styles: templateBuilder.styles,
	};
	return context;
};

const generators = {
	documentation( context, filepath ) {
		return Promise.resolve().then(() => {
			const sectionsGenerator = generateSections(filepath);
			const sections = [];
			let section;
			do {
				section = sectionsGenerator.next().value;
				console.log(chalk.bold.underline.green('Yielded'));
				inspect({section});
				sections.push(section);
			} while(!_.isNil(section));
			inspect({sections});
			process.exit();
			return highlight( filepath, sections );
		}).then(sections => {
			return generators.source_html( context, filepath, sections );
		});
	},
	source_html( context, filepath, sections ) {
		const title = path.basename( filepath );
		const templateData = {
			title:         title,
			file_path:     filepath,
			projectPath:   path.relative(context.config.cwd, filepath),
			projectDir:    path.relative(context.config.cwd, path.dirname(filepath)),
			sections:      sections,
		};
		let promise = Promise.resolve();
		if(_.get(context.config, ['outputFiles'], true)){
			const dest = destination( filepath, context.config );
			const html = context.templates.docco(templateData);
			console.log( `docco: ${  filepath  } -> ${  dest }` );
			promise = write_file( dest, html );
		}
		return promise.then(() => {
			return Promise.resolve(templateData);
		});
	},
	readme( context, package_json ) {
		const options = context.config;
		const sources = context.sources;
		const dest = destination('index', options);
		const source = options.readme;
		const templateFile = path.resolve(options.template_dir, 'readme.pug');
		const readme_template = pug.compile( fs.readFileSync( templateFile ).toString(), {
			filename: templateFile,
		});
		// Handle README
		const readme_path = path.resolve(process.cwd(), source );
		let content;
		if ( file_exists( readme_path )) {
			content = parse_markdown( context, readme_path );
		} else {
			content = `There is no README at "${ source }" for this project yet :( `;
		}
		// Handle content_index
		const content_index_path = path.resolve(process.cwd(), options.content_dir || '', 'content_index.md');
		let content_index;
		if ( file_exists( content_index_path )) {
			content_index = parse_markdown( context, content_index_path );
		} else {
			content_index = '';
		}
		return cloc( sources.join( ' ' ), codeStats => {
			const headerMatches = codeStats.match(/^(?:\s*\n)*([\w\.\/]+) v ([\d\.]+).*\n-+\n/);
			codeStats = codeStats.replace(headerMatches[0], '');
			const regexLines1 = /^(\w(?:\w+|\s))+\s+(\w(?:\w+|\s))+\s+(\w(?:\w+|\s))+\s+(\w(?:\w+|\s))+\s+(\w(?:\w+|\s))+$/gm;
			const regexLines2 = new RegExp(regexLines1.source, 'm');
			const linesMatches = (codeStats.match(regexLines1) || []).map(match => match.match(regexLines2));
			codeStats = {
				repoUrl:   `https://${headerMatches[1]}`,
				repoName:  headerMatches[1],
				version:   headerMatches[2],
				header:    linesMatches[0].slice(1),
				languages: linesMatches.slice(1).map(line => line.slice(1)),
			};
			const html = context.templates.readme({
				title:         options.readme_title,
				content:       content,
				content_index: content_index,
				file_path:     source,
				package_json:  package_json,
				codeStats:     codeStats,
				gravatar:      gravatar,
			});
			console.log( `readme: ${  source  } -> ${  dest }` );
			return write_file( dest, html );
		});
	},
	content( context, dir ) {
		var walker;
		// TODO rewrite
		walker = walk.walk( dir, {
			followLinks: false,
		});
		return walker.on( 'file', function( root, fileStats, next ) {
			var dest, html;
			if ( fileStats.name.match( new RegExp( '.md$' ))) {
				const source = `${  root  }/${  fileStats.name }`;
				dest = destination( source.replace( context.config.content_dir, '' ), context );
				html = parse_markdown( context, src );
				html = context.templates.content({
					title:         fileStats.name,
					content:       html,
					file_path:     fileStats.name,
				});
				console.log( `markdown: ${  source  } --> ${  dest }` );
				write_file( dest, html );
			}
			return next();
		});
	},
};

class Section{
	constructor(code, docs){
		this.code = code;
		this.docs = docs;
	}
}

function *generateSections(filepath){
	const code = fs.readFileSync(filepath, 'UTF-8');
	const lines = code.split( '\n' );
	const linesCount = lines.length;
	const language = getLanguage(filepath);
	let inMultiLineComment = false;
	let contentDoc = '';
	let contentCode = '';

	const addCode = code => {
		contentCode += code;
	};
	const addDoc = doc => {
		contentDoc += doc;
	};
	const textBefore = (trimmedLine, match) => {
		return trimmedLine.slice(0, match.index);
	};
	const textAfter = (trimmedLine, match) => {
		return trimmedLine.slice(match.index + match[0].length);
	};

	const comments = [];
	const tokens = [];
	const ast = acorn.parse(code, {
		ecmaVersion: 8,
		locations: true,
		// collect ranges for each node
		ranges: true,
		// collect comments in Esprima's format
		onComment: comments,
		// collect token ranges
		onToken: tokens
	});
	inspect({tokens, comments, ast});
};

const highlight = ( source, sections ) => {
	return new Promise((resolve, reject) => {
		var language, output, pygments, section;
		language = getLanguage( source );
		if(language.name === 'unknown'){
			return resolve([{
				code_html: highlightTags.start + _.map(sections, 'code_text').join('') + highlightTags.end,
				docs_html: '',
			}]);
		}
		pygments = exec( 'pygmentize ' + [ '-l', language.name, '-f', 'html', '-O', 'encoding=utf-8,tabsize=4', /**/'-P linenos=inline',/*/ '-P linespans=line'/**/ ].join(' '));
		output = '';
		pygments.stderr.addListener( 'data', function( error ) {
			if ( error ) {
				return console.error( error.toString());
			}
		});
		pygments.stdin.addListener( 'error', function( error ) {
			console.error( 'Could not use Pygments to highlight the source.' );
			//			return process.exit(1);
		});
		pygments.stdout.addListener( 'data', function( result ) {
			//				console.log(result)
			if ( result ) {
				return output += result;
			}
		});
		pygments.addListener( 'exit', function() {
			var fragments, i, section, _len;
			output = output.replace( highlightTags.start, '' ).replace( highlightTags.end, '' );
			fragments = output.split( language.divider_html );
			for ( i = 0, _len = sections.length; i < _len; i++ ) {
				section = sections[i];
				section.code_html = highlightTags.start + fragments[i] + highlightTags.end;
				section.docs_html = showdown.makeHtml( section.docs_text );
			}
			return resolve(sections);
		});
		if ( pygments.stdin.writable ) {
			pygments.stdin.write((( function() {
				var _i, _len, _results;
				_results = [];
				for ( _i = 0, _len = sections.length; _i < _len; _i++ ) {
					section = sections[_i];
					_results.push( section.code_text );
				}
				return _results;
			})()).join( language.divider_text ));
			return pygments.stdin.end();
		}
	});
};

const write_file = ( dest, contents ) => {
	const target_dir = path.dirname( dest );
	return promisify(fs.stat)( target_dir).catch(err => {
		if ( err.code !== 'ENOENT' ) {
			return Promise.reject(err);
		} else {
			return promisify(exec)( `mkdir -p ${  target_dir }`)
		}
	}).then(() => {
		return promisify(fs.writeFile)( dest, contents);
	});
};

const parse_markdown = ( context, src ) => {
	const markdown = fs.readFileSync( src ).toString();
	return showdown.makeHtml( markdown );
};

const cloc = ( paths, callback ) => {
	return exec( `'${  __dirname  }/../vendor/cloc.pl' --quiet --read-lang-def='${  __dirname  }/../resources/cloc_definitions.txt' ${  paths }`, function( err, stdout ) {
		if ( err ) {
			console.log( `Calculating project stats failed ${  err }` );
		}
		return callback( stdout );
	});
};

const getLanguage = source => {
	return _.get(languages, path.extname( source ), languages._);
};

const destination = ( filepath, options ) => {
	return path.resolve(options.output_dir, `${ filepath }.html`);
};

const ensure_directory = dir => {
	return new Promise((resolve, reject) => {
		return exec( `mkdir -p ${  dir }`, () => {
			return resolve();
		});
	});
};

const file_exists = path => {
	try {
		return fs.lstatSync( path ).isFile;
	} catch ( ex ) {
		return false;
	}
};



const templateGen = context => {
	context = _.omit(context, 'templates');
	const templateBuilder = filename => {
		let templateFile = path.resolve(context.config.template_dir, filename);
		if(!file_exists(templateFile)){
			templateFile = path.resolve(defaultTemplateDir, filename);
		}
		return args => {
			args = _.defaults(args, {
				path,
				context,
				relativeTo: (from, to) => {
					const relPath = path.relative(path.resolve(context.config.cwd, from, '..'), path.resolve(context.config.cwd, to));
					return relPath;
				}
			});

			const compiled = pug.compile( fs.readFileSync( templateFile ).toString(), {
				filename: templateFile,
			})(args);
			//console.log(compiled)
			return compiled;
		};
	};
	templateBuilder.styles = path.resolve(context.config.template_dir, 'docco.css');
	return templateBuilder;
};

const highlightTags = {
	start: '<div class="highlight"><pre>',
	end : '</pre></div>',
};

const parse_args = ( args,  callback ) => {
	var a, args, ext, lang_filter, project_name, roots;

	// project_name = args.name;
	if ( process.ARGV !== undefined ) {
		args = process.ARGV;
	}
	project_name = '';
	if ( '-name' === args[0]) {
		args.shift();
		project_name = args.shift();
	}
	args = args.sort();
	if ( !args.length ) {
		return;
	}
	roots = ( function() {
		var _i, _len, _results;
		_results = [];
		for ( _i = 0, _len = args.length; _i < _len; _i++ ) {
			a = args[_i];
			_results.push( a.replace( /\/+$/, '' ));
		}
		return _results;
	})();
	roots = roots.join( ' ' );

	lang_filter = ( function() {
		var _results;
		_results = [];
		for ( ext in languages ) {
			_results.push( ` -name '*${  ext  }' ` );
		}
		return _results;
	})();
	lang_filter = lang_filter.join( ' -o ' );

	return exec( `find ${  roots  } -type f \\( ${  lang_filter  } \\)`, function( err, stdout ) {
		var sources;
		if ( err ) {
			throw err;
		}
		sources = stdout.split( '\n' ).filter( function( file ) {
			return file !== '' && path.basename( file )[0] !== '.';
		});
		console.log( `docco: Recursively generating documentation for ${  roots }` );
		return callback( sources, project_name, args );
	});
};

const documentProject = options => {
	let package_json = {};

	const package_path = path.resolve(options.cwd, 'package.json');
	try {
		package_json = require(package_path );
	} catch ( err ) {
		console.log( 'Error parsing package.json', err );
	}
	_.defaults(options, package_json.docco_husky);

	const context = makeContext(options, paths);
	delete options.files;

	return ensure_directory( options.output_dir ).then(() => {
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
		/*			return Promise.all([
			]);*/
	});
};

module.exports = {
	run,
	documentProject,
	makeContext,
	languages,
	generators,
};
