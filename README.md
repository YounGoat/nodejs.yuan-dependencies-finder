#   needyou, depa or yuan-dependencies-finder

__needyou__, formerly named as __depa__ or __yuan-dependencies_finder__, is used to generate *dependencies* information of specified module under development.

##	Links

*	See [CHANGE LOG](./CHANGELOG.md) for notable changes.
*	[Homepage](https://github.com/YounGoat/nodejs.yuan-dependencies-finder)

##  Get Started

API:
```javascript
const needyou = require('needyou');
let dependencies = needyou('/path/to/package');
```

CLI:
```bash
needyou [--input <path/to/module>] [--save] [--miss]

# Old command name depa & yuan-dependencies-finder is still available.
```

*   __--input__  
    Used to specify home directory of the module to be parsed.

*   __--save__  
    Append the *dependencies* field to *packge.json* of the module. If the field existing, change it.

*   __--miss__  
    If unable to obtain version of modules required by current module, use *\** as replacement.

The standard output looks like this:
```bash
[i] Finding javascript files ...
    1 javascript files found.
[i] Finding required modules ...
    /index.js +7
[i] Obtain version of required modules ...
    colors : ^1.1.2
    minimist : ^1.2.0
    uglify-js : ^2.6.2
    yuan : ^0.2.0
```

##	About

Since 0.2.0, new package name __needyou__ is used.

Since 0.1.0, *yuan-dependencies-finder* is renamed to *depa*. While package installed, two commands named with both new package and old one will be installed.
