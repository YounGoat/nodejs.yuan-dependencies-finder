#!/usr/bin/env node

'use strict';

const MODULE_REQUIRE = 1
    /* built-in */
    , path = require('path')
    
    /* NPM */
    , commandos = require('commandos')
    , noda = require('noda')
    
    /* in-package */
    , needyou = noda.inRequire('.')
    ;

const groups = [
    [
        '--help -h REQUIRED',
    ], [
        '--input --source [0] NOT NULL',
        '--miss NOT ASSIGNABLE',
        '--save NOT ASSIGNABLE',
        '--verbose DEFAULT(true)',
    ],
];
const cmd = commandos.parse(process.argv.slice(1), { 
    groups,
    catcher: err => {
        console.error(err.message);
        console.log('Run "needyou --help" to see detailed help info.');
        process.exit(1);
    }
});

if (cmd.help) {
    commandos.man(noda.inRead('help.txt', 'utf8'));
    return;
}

if (!cmd.input) {
    cmd.input = process.cwd();
}
cmd.input = path.resolve(cmd.input);

let deps = needyou(cmd);

