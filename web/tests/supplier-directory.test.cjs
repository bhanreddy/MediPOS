const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
test('purchase supplier choices include active vendors beyond the first server page',async()=>{
 const pages=[];const module={exports:{}};const records=Array.from({length:121},(_,i)=>({id:String(i),name:`Supplier ${i}`,is_active:i!==0}));
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/supplierService.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{
 module,exports:module.exports,require:()=>({get:async(url,{params})=>{assert.equal(url,'/suppliers');pages.push(params.page);return{data:{data:records.slice((params.page-1)*100,params.page*100),pagination:{totalPages:2}}};}}),
 });
 const active=await module.exports.SupplierService.getActive();assert.equal(active.length,120);assert.equal(active.at(-1).name,'Supplier 120');assert.deepEqual(pages,[1,2]);
});
