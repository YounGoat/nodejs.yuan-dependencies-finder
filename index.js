#!/usr/bin/env node --harmony
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

var _logger = {
    log: function(msg) {
        console.log('    ' + msg);
    },

    info: function(msg) {
        console.log(colors.blue('[i]') + ' ' + colors.italic.bold(msg));
    },

    error: function(msg) {
        console.log(colors.magenta('[x]') + ' ' + colors.magenta(msg));
        process.exit(1);
    },

    warn: function(msg) {
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
// Process command line parameters.

var OPTIONS = minimist(process.argv.slice(2));
if (!OPTIONS.input) {
    OPTIONS.input = process.cwd();
}
else {
    OPTIONS.input = path.resolve(OPTIONS.input);
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
var _transformer = new UglifyJS.TreeTransformer(function(node, descend) {
    if (node instanceof UglifyJS.AST_Call && node.expression.name == 'require') {
        var name = node.args[0].value;

        if (!name) return;
        if (path.isAbsolute(name)) return;
        if (name.startsWith('.')) return;

        // Ignore the subpath of module, only the scope (if exists) and module name remained.
        var parts = name.split('/');
        if (name.startsWith('@')) name = parts[0] + '/' + parts[1];
        else name = parts[0];

        _modules.push(name);
    }
});
_allJs.forEach(function(pathname) {
    var m = _modules.length;

    var code = fs.readFileSync(pathname, 'utf8');
    try{
        var ast = UglifyJS.parse(code);
    } catch(ex) {
        _logger.error('Failed to parse javascript code. ES2015 not supported now.');
    }
    ast.transform(_transformer);

    m = _modules.length - m;
    _logger.log(pathname.substr(OPTIONS.input.length) + ' ' + colors[ m ? 'green' : 'gray' ]('+' + m));
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
// for (var i = 0; i < paths.length; i++) {
//     paths[i] = _readlink(paths[i]);
// }
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
                var msg = colors.italic('package.json') + ' in ' + colors.italic(moduleName) + '\'s homedir not existing or not accessible: ' + os.EOL + pkgpath;
                _on_miss(msg);
            }
            else if (!pkgjson) {
                var msg = colors.italic('package.json') + ' in ' + colors.italic(moduleName) + '\'s homedir is not valid JSON file:' + os.EOL + pkgpath;
                _on_miss(msg);
            }
            else if (!pkgjson.version) {
                var msg = colors.italic('package.json') + ' in ' + colors.italic(moduleName) + '\'s homedir contains no version info:' + os.EOL + pkgpath;
                _on_miss(msg);
                _dependencies[moduleName] = '*';
            }
            else {
                _dependencies[moduleName] = '^' + require(pkgpath).version;
            }
            break;
        }
    }
    _logger.log(colors.italic(moduleName) + ' : ' + colors.green(_dependencies[moduleName]));
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
