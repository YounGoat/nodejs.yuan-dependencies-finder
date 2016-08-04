#   yuan-dependencies-finder

*yuan-dependencies-finder* is used to generate *dependencies* information of specified module under development.

```bash
yuan-dependencies-finder [--input <path/to/module>] [--save] [--miss]
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
