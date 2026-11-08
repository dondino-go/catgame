/*
 * The two ways into the game, and the files an installed app depends on.
 *
 * index.html is the game: it is what GitHub Pages serves at the root. mobile.html
 * is the same page again, kept on purpose. An iPhone stores the address it was
 * added to the home screen from (./mobile.html) and never updates it, so every
 * install made before #10 still launches that file; an Android install made then
 * keeps its manifest's start_url too. Delete it and those apps open a 404, with
 * no way back short of re-adding the icon. It is 1.5KB, so it stays.
 *
 * start_url was deliberately left as ./mobile.html. Changing it without an `id`
 * makes Chrome treat the app as a different one (identity defaults to start_url),
 * and the installs that matter cannot be updated from here anyway.
 */
require('./harness');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const has = f => fs.existsSync(path.join(root, f));
const page = u => (u.replace(/^\.\//, '').split(/[?#]/)[0]) || 'index.html';      // './' is the root page

console.log('Entry pages');
const index = has('index.html') ? read('index.html') : '';
ok(/<canvas id="c">/.test(index) && /src\/game\.js/.test(index), 'index.html is the mobile game (a canvas and src/game.js)');
ok(!/WASD|arrowleft/i.test(index), 'index.html is no longer the legacy desktop game');
ok(has('mobile.html'), 'mobile.html still exists: installed apps launch it, and would open a 404 without it');
ok(has('mobile.html') && read('mobile.html') === index, 'mobile.html is identical to index.html, so there is one game behind both addresses');

console.log('\nInstalled app');
const manifest = JSON.parse(read('manifest.webmanifest'));
ok(has(page(manifest.start_url)), 'manifest start_url (' + manifest.start_url + ') is a file that exists');
const shell = [...(read('sw.js').match(/const SHELL = \[([\s\S]*?)\];/) || [, ''])[1].matchAll(/'(\.\/[^']*)'/g)].map(m => m[1]);
ok(shell.length > 0, 'sw.js lists its precache files');
const missing = shell.filter(u => !has(page(u)));
ok(!missing.length, 'every file the worker precaches exists' + (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''));
ok(shell.some(u => page(u) === 'index.html') && shell.some(u => page(u) === 'mobile.html'),
   'the worker precaches both entry pages, so either opens offline');
ok(shell.includes('./'), 'the worker precaches the bare address, which is a separate cache entry from index.html');

console.log('\nUpdate check');
const files = [...(read('src/game.js').match(/const GAME_FILES = \[([\s\S]*?)\];/) || [, ''])[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
ok(files.length > 0, 'game.js lists the files its update check refreshes');
const gone = files.filter(f => !has(f));
ok(!gone.length, 'every file the update check refreshes exists' + (gone.length ? ' (missing: ' + gone.join(', ') + ')' : ''));
ok(files.includes('index.html') && files.includes('mobile.html'), 'the update check refreshes both entry pages');

report();
