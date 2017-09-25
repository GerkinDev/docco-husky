'use strict';

const fs = require( 'fs' );
const path = require( 'path' );
const showdown = require( './../vendor/showdown' ).Showdown;
const jade = require( 'jade' );
const dox = require( 'dox' );
const gravatar = require( 'gravatar' );
const _ = require( 'underscore' );
const walk = require( 'walk' );
const commander = require( 'commander' );
const version = JSON.parse( fs.readFileSync( `${ __dirname }/../package.json` )).version;
const {
	spawn, exec,
} = require( 'child_process' );
const languages = {
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
};

( function() {
	var check_config, cloc, content_template, destination, docco_styles, docco_template, dox, dox_template, ensure_directory, ext, file_exists, get_language, highlight, highlight_end, highlight_start, l, parse, parse_markdown, relative_base, run, write_file;

	const generators = {
		documentation( source, context, callback ) {
			return fs.readFile( source, 'utf-8', ( error, code ) => {
				var sections;
				if ( error ) {
					throw error;
				}
				sections = parse( source, code );
				return highlight( source, sections, () => {
					generators.source_html( source, context, sections );
					return callback();
				});
			});
		},
		source_html( source, context, sections ) {
			const title = path.basename( source );
			const dest = destination( source, context );
			const html = docco_template({
				title:         title,
				file_path:     source,
				sections:      sections,
				context:       context,
				path:          path,
				relative_base: relative_base,
			});
			return write_file( dest, html );
		},
		readme( context, sources, package_json ) {
			console.log( arguments );
			const title = 'README';
			const dest = `${ context.config.output_dir }/index.html`;
			const source = context.config.readme;
			const readme_template = jade.compile( fs.readFileSync( `${ __dirname  }/../resources/readme.jade` ).toString(), {
				filename: `${ __dirname  }/../resources/readme.jade`,
			});
			// Handle README
			const readme_path = `${ process.cwd() }/${ source }`;
			let content;
			if ( file_exists( readme_path )) {
				content = parse_markdown( context, readme_path );
			} else {
				content = `There is no README at "${ source }" for this project yet :( `;
			}
			// Handle content_index
			const content_index_path = `process.cwd()/${ context.config.content_dir }/content_index.md`;
			let content_index;
			if ( file_exists( content_index_path )) {
				content_index = parse_markdown( context, content_index_path );
			} else {
				content_index = '';
			}
			return cloc( sources.join( ' ' ), code_stats => {
				const html = readme_template({
					title:         title,
					context:       context,
					content:       content,
					content_index: content_index,
					file_path:     source,
					path:          path,
					relative_base: relative_base,
					package_json:  package_json,
					code_stats:    code_stats,
					gravatar:      gravatar,
				});
				console.log( `docco: ${  source  } -> ${  dest }` );
				return write_file( dest, html );
			});
		},
		content( context, dir ) {
			var walker;
			walker = walk.walk( dir, {
				followLinks: false,
			});
			return walker.on( 'file', function( root, fileStats, next ) {
				var dest, html, src;
				if ( fileStats.name.match( new RegExp( '.md$' ))) {
					src = `${  root  }/${  fileStats.name }`;
					dest = destination( src.replace( context.config.content_dir, '' ), context );
					console.log( `markdown: ${  src  } --> ${  dest }` );
					html = parse_markdown( context, src );
					html = content_template({
						title:         fileStats.name,
						context:       context,
						content:       html,
						file_path:     fileStats.name,
						path:          path,
						relative_base: relative_base,
					});
					write_file( dest, html );
				}
				return next();
			});
		},
	};

	parse = function( source, code ) {
		var code_text, docs_text, has_code, in_multi, language, line, lines, multi_accum, parsed, save, sections, _i, _len;
		lines = code.split( '\n' );
		sections = [];
		language = get_language( source );
		has_code = docs_text = code_text = '';
		in_multi = false;
		multi_accum = '';
		save = function( docs, code ) {
			return sections.push({
				docs_text: docs,
				code_text: code,
			});
		};
		for ( _i = 0, _len = lines.length; _i < _len; _i++ ) {
			line = lines[_i];
			if ( line.match( language.multi_start_matcher ) || in_multi ) {
				if ( has_code ) {
					save( docs_text, code_text );
					has_code = docs_text = code_text = '';
				}
				in_multi = true;
				multi_accum += `${ line  }\n`;
				if ( line.match( language.multi_end_matcher )) {
					in_multi = false;
					try {
						parsed = dox.parseComments( multi_accum )[0];
						docs_text += dox_template( parsed );
					} catch ( error ) {
						console.log( `Error parsing comments with Dox: ${  error }` );
						docs_text = multi_accum;
					}
					multi_accum = '';
				}
			} else if ( line.match( language.comment_matcher ) && !line.match( language.comment_filter )) {
				if ( has_code ) {
					save( docs_text, code_text );
					has_code = docs_text = code_text = '';
				}
				docs_text += `${ line.replace( language.comment_matcher, '' )  }\n`;
			} else {
				has_code = true;
				code_text += `${ line  }\n`;
			}
		}
		save( docs_text, code_text );
		return sections;
	};

	highlight = function( source, sections, callback ) {
		var language, output, pygments, section;
		language = get_language( source );
		pygments = spawn( 'pygmentize', [ '-l', language.name, '-f', 'html', '-O', 'encoding=utf-8,tabsize=2' ]);
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
			if ( result ) {
				return output += result; 
			}
		});
		pygments.addListener( 'exit', function() {
			var fragments, i, section, _len;
			output = output.replace( highlight_start, '' ).replace( highlight_end, '' );
			fragments = output.split( language.divider_html );
			for ( i = 0, _len = sections.length; i < _len; i++ ) {
				section = sections[i];
				section.code_html = highlight_start + fragments[i] + highlight_end;
				section.docs_html = showdown.makeHtml( section.docs_text );
			}
			return callback();
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
	};

	write_file = function( dest, contents ) {
		var target_dir, write_func;
		target_dir = path.dirname( dest );
		write_func = function() {
			return fs.writeFile( dest, contents, function( err ) {
				if ( err ) {
					throw err; 
				}
			});
		};
		return fs.stat( target_dir, function( err, stats ) {
			if ( err && err.code !== 'ENOENT' ) {
				throw err; 
			}
			if ( !err ) {
				return write_func(); 
			}
			if ( err ) {
				return exec( `mkdir -p ${  target_dir }`, function( err ) {
					if ( err ) {
						throw err; 
					}
					return write_func();
				});
			}
		});
	};

	parse_markdown = function( context, src ) {
		var markdown;
		markdown = fs.readFileSync( src ).toString();
		return showdown.makeHtml( markdown );
	};

	cloc = function( paths, callback ) {
		return exec( `'${  __dirname  }/../vendor/cloc.pl' --quiet --read-lang-def='${  __dirname  }/../resources/cloc_definitions.txt' ${  paths }`, function( err, stdout ) {
			if ( err ) {
				console.log( `Calculating project stats failed ${  err }` ); 
			}
			return callback( stdout );
		});
	};

	for ( ext in languages ) {
		l = languages[ext];
		l.comment_matcher = new RegExp( `^\\s*${  l.symbol  }\\s?` );
		l.comment_filter = new RegExp( '(^#![/]|^\\s*#\\{)' );
		l.divider_text = `\n${  l.symbol  }DIVIDER\n`;
		l.divider_html = new RegExp( `\\n*<span class="c1?">${  l.symbol  }DIVIDER<\\/span>\\n*` );
		if ( '/*' === l.multi_start ) {
			l.multi_start_matcher = new RegExp( /^[\s]*\/\*[.]*/ );
		} else {
			l.multi_start_matcher = new RegExp( /a^/ );
		}
		if ( '*/' === l.multi_end ) {
			l.multi_end_matcher = new RegExp( /.*\*\/.*/ );
		} else {
			l.multi_end_matcher = new RegExp( /a^/ );
		}
	}

	get_language = function( source ) {
		return languages[path.extname( source )];
	};

	relative_base = function( filepath, context ) {
		var result;
		result = `${ path.dirname( filepath )  }/`;
		if ( '/' === result || '//' === result ) {
			return '';
		} else {
			return result;
		}
	};

	destination = function( filepath, context ) {
		var base_path;
		base_path = relative_base( filepath, context );
		return `${  context.config.output_dir  }/${  filepath  }.html`;
	};

	ensure_directory = function( dir, callback ) {
		return exec( `mkdir -p ${  dir }`, function() {
			return callback();
		});
	};

	file_exists = function( path ) {
		try {
			return fs.lstatSync( path ).isFile;
		} catch ( ex ) {
			return false;
		}
	};

	docco_template = jade.compile( fs.readFileSync( `${ __dirname  }/../resources/docco.jade` ).toString(), {
		filename: `${ __dirname  }/../resources/docco.jade`,
	});

	dox_template = jade.compile( fs.readFileSync( `${ __dirname  }/../resources/dox.jade` ).toString(), {
		filename: `${ __dirname  }/../resources/dox.jade`,
	});

	content_template = jade.compile( fs.readFileSync( `${ __dirname  }/../resources/content.jade` ).toString(), {
		filename: `${ __dirname  }/../resources/content.jade`,
	});

	docco_styles = fs.readFileSync( `${ __dirname  }/../resources/docco.css` ).toString();

	highlight_start = '<div class="highlight"><pre>';

	highlight_end = '</pre></div>';

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

	check_config = function( context, pkg ) {
		var defaults;
		defaults = {
			css:            `${ __dirname  }/../resources/docco.css`,
			show_timestamp: true,
			output_dir:     'docs',
			project_name:   context.options.project_name || '',
			content_dir:    null,
		};
		return context.config = _.extend( defaults, pkg.docco_husky || {});
	};

	run = function( args ) {
		if ( null == args ) {
			args = process.argv;
		}

		commander.version( version ).parse( args ).name = 'docco';
		if ( commander.args.length ) {
			return document( commander.args.slice(), commander );
		} else {
			return console.log( commander.helpInformation());
		}
	};

	const document = ( options, callback ) => {
		parse_args(  options, function( sources, project_name, raw_paths ) {

			var context, package_json, package_path;
			context = {
				sources: sources,
				options: {
					project_name: project_name,
				},
			};
			package_path = `${ process.cwd()  }/package.json`;
			try {
				package_json = file_exists( package_path ) ? JSON.parse( fs.readFileSync( package_path ).toString()) : {};
			} catch ( err ) {
				console.log( 'Error parsing package.json' );
				console.log( err );
			}
			check_config( context, package_json );

			return ensure_directory( context.config.output_dir, function() {
				var files, next_file;
				generators.readme( context, raw_paths, package_json );
				fs.writeFile( `${  context.config.output_dir  }/docco.css`, fs.readFileSync( context.config.css ).toString());
				files = sources.slice( 0, sources.length + 1 || 9e9 );
				next_file = function() {
					if ( files.length ) {
						return generators.documentation( files.shift(), context, next_file );
					}
				};
				next_file();
				if ( context.config.content_dir ) {
					return generators.content( context, context.config.content_dir );
				}
			});
		});
	};
	const _ref1 = {
		run:       run,
		document:  document,
		parse:     parse,
		languages: languages,
	};
	for ( const key in _ref1 ) {
		const value = _ref1[key];
		exports[key] = value;
	}

}).call( this );
