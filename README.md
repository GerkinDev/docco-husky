Overview
--------

A streamlined static site generator for project documentation based on [Docco](http://jashkenas.github.com/docco/). "Husky" because it's bigger and more irregular than Docco, like [Husky](http://www.wisegeek.com/what-is-a-husky-size-in-clothing.htm) Jeans you would buy at Sears back in the day.

A fork of [Docco](http://jashkenas.github.com/docco/), intended to go beyond the appropriate scope of Docco itself. Forked because Docco itself is pretty simple and this is intended to diverge. The initial fork included merged pull requests from [nevir](https://github.com/nevir) and [jswartwood](https://github.com/jswartwood) for their work on supporting recursive directories and an improved "Jump To" menu.


Examples
--------

Check out the [generated documentation](http://mbrevoort.github.com/docco-husky/docco-husky/readme.html) for this project.

Or these other samples

* [batman.js](http://mbrevoort.github.com/docco-husky/batman/readme.html)
* [backbone.js](http://mbrevoort.github.com/docco-husky/backbone/readme.html)

Installation
------------

### Possible Gotchas

* Docco requires [Pygments](http://pygments.org/) to be installed and will try to install it if it's not already. 
* Perl is required for [cloc](http://cloc.sourceforge.net/)

To install via npm into your project:

	npm install docco-husky

Install globally:

	[sudo] npm install -g docco-husky

Or include as a dependency in your package.json


Generating Documentation
------------------------

docco-husky will generate docs in a ./docs directory. It accepts multiple files (including 
wildcards) and directories for it to recurse.

	docco-husky -name "<optional project name>" <list of files>

### Examples

	# from a local install
	./node_modules/.bin/docco-husky app.js lib public
	
	# with a project name
	./node_modules/.bin/docco-husky -name "My Project" app.js lib public
	
	# with wildcards
	./node_modules/.bin/docco-husky -name "My Project" *.js lib public
	
	# with global install
	docco-husky -name "My Project" *.js lib public
			

Output
------------------------

docco-husky will write generated files to ./docs . 

For all source files, the output will be like 
<base>.<ext> (e.g. foo.js) -->  <base>.html (e.g. foo.html).

A readme.html will be generate and will include a formatted version of a 
README.md if your project includes it, some details from the a package.json file, 
and project stats generated by cloc.

Single line comments will only be parsed with the exception os Javascript (as of 0.2.0) which
is in an early experimental state. Javascript multiline source will be parsed plus
JSDoc style tags will be parsed using [Dox](http://github.com/visionmedia/dox)