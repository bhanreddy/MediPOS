const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');const Papa=require('papaparse');
test('CSV downloads escape spreadsheet formulas, preserve text, and release the download URL',async()=>{
 let blob,revoked=false,clicked=false;const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/exportCsv.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{
 module,exports:module.exports,require:()=>Papa,Blob,
 URL:{createObjectURL:value=>{blob=value;return'blob:qa';},revokeObjectURL:value=>{assert.equal(value,'blob:qa');revoked=true;}},
 document:{createElement:()=>({style:{},setAttribute(){},click(){clicked=true;}}),body:{appendChild(){},removeChild(){}}},window:{setTimeout:fn=>fn()},
 });
 module.exports.exportToCsv('qa.csv',[{name:'=HYPERLINK("https://example.invalid")',phone:'+919876543210',description:'Ordinary text'}]);
 const parsed=Papa.parse(await blob.text(),{header:true}).data[0];assert.equal(parsed.name.charAt(0),"'");assert.equal(parsed.phone.charAt(0),"'");assert.equal(parsed.description,'Ordinary text');assert.ok(clicked);assert.ok(revoked);
});
