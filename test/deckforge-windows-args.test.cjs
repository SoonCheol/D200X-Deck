'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseWindowsArgs}=require('../app/streamdeck-editor/windows-args.cjs');
test('Windows application arguments are tokenized and never evaluated as a shell command',()=>{
 assert.deepEqual(parseWindowsArgs('--flag "hello world" C:\\A\\B'),['--flag','hello world','C:\\A\\B']);
 assert.deepEqual(parseWindowsArgs(''),[]);
 assert.deepEqual(parseWindowsArgs('""'),['']);
 assert.deepEqual(parseWindowsArgs('--name="two words"'),['--name=two words']);
 assert.throws(()=>parseWindowsArgs('"not closed'),/따옴표/);
});
