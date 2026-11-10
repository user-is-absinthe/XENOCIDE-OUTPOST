const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const html=fs.readFileSync('dist/index.html','utf8');
const paths=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]);
assert(paths.length>0);
for(const file of ['index.html',...paths]){
 assert(!/^https?:|^\/\//.test(file));
 const data=fs.readFileSync('dist/'+file,'utf8');assert.equal(data,fs.readFileSync(file,'utf8'));
 if(file.endsWith('.js')){new vm.Script(data);assert(!/\bfetch\s*\(|\bimport\s*\(|navigator\.serviceWorker/.test(data));}
}
assert(!html.includes('type="module"'));
console.log('Offline package: local dependencies, matching sources, classic script syntax passed (not a browser launch test)');
