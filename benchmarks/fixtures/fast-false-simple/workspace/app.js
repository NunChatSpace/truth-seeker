const fs = require('node:fs');

const version = fs.readFileSync('config/version.txt', 'utf8').trim();
console.log(version);
