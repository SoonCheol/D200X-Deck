'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('every root regression suite is explicitly executed in the Windows integration workflow',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/deckforge-windows-build.yml'),'utf8');
 // Only actual node test command lines count, not trigger paths or comments.
 const commands=workflow.split(/\r?\n/).filter(line=>/^\s*node --test\s/.test(line));
 const registered=new Set(commands.flatMap(line=>Array.from(line.matchAll(/(?:\.\.\/)?test\/([A-Za-z0-9._-]+\.test\.cjs)\b/g),m=>m[1])));
 const files=fs.readdirSync(__dirname).filter(name=>name.endsWith('.test.cjs')).sort();
 assert.ok(files.length>0);
 assert.deepEqual(files.filter(name=>!registered.has(name)),[],'root test suites missing from Windows test commands');
});
