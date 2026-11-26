'use strict';

const fs = require('node:fs');
const { buildNative, executable } = require('./build-native');

if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 or later is required.');
if (!fs.existsSync(executable)) buildNative();
require('./run').run();
