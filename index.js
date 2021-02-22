'use strict';

var MODULE_REQUIRE
    , fs = require('fs')
    , os = require('os')
    , path = require('path')
    , colors = require('colors')
    , minimist = require('minimist')
    , UglifyJS = require('uglify-js')
    , yuan = require('yuan')
    ;

function needyou(OPTIONS) {
    if (typeof OPTIONS == 'string') {
        OPTIONS = { input: OPTIONS };
    }

    OPTIONS = Object.assign({
        input: null,
        save: false,
        miss: false,
        verbose: false,
    }, OPTIONS);

    var _logger = {
        log: function(msg) {
            if (!OPTIONS.verbose) return;
            console.log('    ' + msg);
        },

        info: function(msg) {
            if (!OPTIONS.verbose) return;
            console.log(colors.blue('[i]') + ' ' + colors.italic.bold(msg));
        },

        error: function(msg) {
            if (!OPTIONS.verbose) {
                throw msg instanceof Error ? msg : new Error(msg);
            }
            console.log(colors.magenta('[x]') + ' ' + colors.magenta(msg));
            process.exit(1);
        },

        warn: function(msg) {
            if (!OPTIONS.verbose) return;
            console.log(colors.yellow('[w]') + ' ' + colors.yellow(msg));
        }
    };

    var _readlink = function foo(pathname) {
        var parts = pathname.split(path.sep), tails = [];
        var realpath, raw = pathname;

        do {
            pathname = parts.join(path.sep);
            try {
                var linkpath = fs.readlinkSync(pathname);
                realpath = path.resolve(path.dirname(pathname), linkpath) + path.sep + tails.join(path.sep);
                break;
            } catch (e) {
                // If pathname is not a link, nothing happenedn in this code block.
            }
            tails.unshift(parts.pop());
        } while (parts.length)

        if (!realpath) return raw;

        // Up to now, "realpath" is not confirmed to be a real, final path.
        // Recursion is not the best way, but an easy way to find the real path.
        return foo(realpath);
    };

    var _isdir = function(pathname) {
        if (fs.existsSync(pathname)) {
            var stats = fs.statSync(pathname);
            return stats.isDirectory();
        }
        return false;
    }

    // ---------------------------
    // To find all the javascript files in the package.
    _logger.info('Finding javascript files ...');

    var _allJs = [];
    (function foo(dirname) {
        var names = fs.readdirSync(dirname);
        names.forEach(function(name) {
            // Ignore "node_modules".
            if (name == 'node_modules') return;

            var pathname = path.join(dirname, name);
            if (_isdir(pathname)) {
                foo(pathname);
            }
            else if (path.extname(pathname) == '.js') {
                _allJs.push(pathname);
            }
        });
    })(OPTIONS.input);

    _logger.log(_allJs.length + ' javascript files found.');

    // ---------------------------
    // Walk through every javascript file, and find out the module names used by require().

    _logger.info('Finding required modules ...');
    var _modules = [];

    var _filter_module = function(name) {
        if (!name) return;
        if (typeof name != 'string') return;
        if (path.isAbsolute(name)) return;
        if (name.startsWith('.')) return;

        // Ignore the subpath of module, only the scope (if exists) and module name remained.
        var parts = name.split('/');
        if (name.startsWith('@')) name = parts[0] + '/' + parts[1];
        else name = parts[0];

        _modules.push(name);
    }

    var _transformer = new UglifyJS.TreeTransformer(function(node, descend) {
        if (node instanceof UglifyJS.AST_Call && node.expression.name == 'require') {
            var name = node.args[0].value;
            _filter_module(name);
        }
    });

    var _reg_find = function(code) {
        var re = /require\(['"]([^'"]+)['"]\)/g;
        var matches = code.match(re);
        if (matches) {
            matches.forEach(function(s) {
                /require\(['"]([^'"]+)['"]\)/.test(s);
                _filter_module(RegExp.$1);
            })
        }
    };

    _allJs.forEach(function(pathname) {
        var m = _modules.length;

        var code = fs.readFileSync(pathname, 'utf8');
        try{
            var ast = UglifyJS.parse(code);
            ast.transform(_transformer);
        } catch(ex) {
            _logger.warn('Failed to parse ' + pathname.substr(OPTIONS.input.length) + ', in replacement, RegExp will be used.');
            _reg_find(code);
        }

        m = _modules.length - m;
        _logger.log(colors.cyan(pathname.substr(OPTIONS.input.length)) + ' ' + colors[ m ? 'green' : 'gray' ]('+' + m));

        for (let i = _modules.length - m; i < _modules.length; i++) {
            _logger.log('. ' + colors.blue(_modules[i]));
        }
    });

    _modules = yuan.array.uniq(_modules.sort());

    // ---------------------------
    // Obtain verion of required modules.

    _logger.info('Obtain version of required modules ...');

    // STEP 1.
    // Redefine the paths to find modules as if NodeJS is running in the OPTIONS.input directory.

    var paths = [];
    var parentPathname = OPTIONS.input, pathname;
    do {
        pathname = parentPathname;
        paths.push(path.join(pathname, 'node_modules'));
        parentPathname = path.join(pathname, '..');
    } while (parentPathname != pathname)

    // If env var NODE_PATH exists, paths contained should also be added to the end.
    if (process.env.NODE_PATH) {
        paths = paths.concat(process.env.NODE_PATH.split(path.delimiter));
    }

    paths = paths.filter(function(item) { return item != ''; });
    module.paths = paths;

    // STEP 2.
    // Find the realpath of each required module.
    var _dependencies = {};
    _modules.forEach(function(moduleName) {
        var pathname;
        var _on_miss = function(msg) {
            _logger[ OPTIONS['ignore-miss'] ? 'warn' : 'error'](msg);
            _dependencies[moduleName] = '*';
        };

        try {
            pathname = require.resolve(moduleName);
        } catch(ex) {
            var msg = 'Module ' + colors.italic(moduleName) + ' NOT FOUND.';
            _on_miss(msg);
        }

        // Built-in modules ignored.
        if (!path.isAbsolute(pathname)) return;

        // Obtain the package.json in the module's home directory.
        var pkgpath, homedir, pkgjson;
        for (var i = 0; i < module.paths.length; i++) {
            homedir = path.join(module.paths[i], moduleName);
            if (!fs.existsSync(homedir)) continue;

            pkgpath = path.join(homedir, 'package.json');
            pkgjson = null;
            try {
                pkgjson = require(pkgpath);
            } catch (e) {}

            var entrypath = pkgjson && pkgjson.main
                ? path.join(homedir, pkgjson.main)
                : homedir
                ;
            if (_isdir(entrypath)) {
                entrypath = path.join(entrypath, 'index.js');
            }

            if (_readlink(entrypath) == pathname) {
                if (!fs.existsSync(pkgpath)) {
                    var msg = colors.italic('package.json') + ' in ' + colors.blue(moduleName) + '\'s homedir not existing or not accessible: ' + os.EOL + pkgpath;
                    _on_miss(msg);
                }
                else if (!pkgjson) {
                    var msg = colors.italic('package.json') + ' in ' + colors.blue(moduleName) + '\'s homedir is not valid JSON file:' + os.EOL + pkgpath;
                    _on_miss(msg);
                }
                else if (!pkgjson.version) {
                    var msg = colors.italic('package.json') + ' in ' + colors.blue(moduleName) + '\'s homedir contains no version info:' + os.EOL + pkgpath;
                    _on_miss(msg);
                    _dependencies[moduleName] = '*';
                }
                else {
                    _dependencies[moduleName] = '^' + require(pkgpath).version;
                }
                break;
            }
        }
        _logger.log('. ' + colors.blue(moduleName) + ' : ' + colors.green(_dependencies[moduleName]));
    });

    // ---------------------------
    // Save dependencies info to package.json of current module.

    if (OPTIONS.save) {
        var pathname = path.join(OPTIONS.input, 'package.json');
        if (!fs.existsSync(pathname)) {
            _logger.warn('package.json NOT FOUND.');
        }
        else {
            var pkg = require(pathname);
            pkg.dependencies = _dependencies;
            fs.writeFileSync(pathname, JSON.stringify(pkg, null, 4), 'utf8');
        }
    }

    return _dependencies;
}

module.exports = needyou;