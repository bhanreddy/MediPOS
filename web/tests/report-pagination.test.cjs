const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
function load(get) {
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/fetchAllPages.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:()=>({get})});
  return module.exports.fetchAllPages;
}
test('expense report includes rows beyond the first 100 while preserving the date range',async()=>{
 const records=Array.from({length:205},(_,i)=>({id:i}));const pages=[];
 const fetchAll=load(async(url,{params})=>{assert.equal(url,'/expenses');assert.equal(params.from,'2026-10-01');pages.push(params.page);return {data:{data:records.slice((params.page-1)*100,params.page*100),pagination:{totalPages:3}}};});
 const rows=await fetchAll('/expenses',{from:'2026-10-01'});assert.equal(rows.length,205);assert.equal(rows.at(-1).id,204);assert.deepEqual(pages,[1,2,3]);
});
test('incomplete reports fail explicitly on a page error',async()=>{
 const fetchAll=load(async(_url,{params})=>{if(params.page===2)throw new Error('offline');return {data:{data:[{id:1}],pagination:{totalPages:2}}};});
 await assert.rejects(fetchAll('/expenses'),/offline/);
});
