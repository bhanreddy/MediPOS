const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function service(api) {
 const module = { exports: {} };
 const source = fs.readFileSync(path.join(__dirname,'../src/services/customerHistoryService.ts'),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{
  module,exports:module.exports,require: name => {assert.equal(name,'../lib/api');return api;},
 });
 return module.exports.CustomerHistoryService;
}
const customer={id:'customer-one',_local_id:'customer-local',name:'Anita'};
test('history pages through all purchases, scopes every request to the customer, and limits concurrent reads',async()=>{
 let active=0,maxActive=0;
 const rows=Array.from({length:8},(_,i)=>({id:`sale-${i}`,customer_id:customer.id}));
 const api={get:async(url,{params,signal})=>{
  assert.equal(signal,'signal');
  if(url==='/sales'){
   assert.equal(params.customer_id,customer.id);assert.equal(params.page,3);assert.equal(params.limit,8);
   assert.equal(params.medicine_id,'medicine');
   assert.equal(params.from,new Date('2026-10-01T00:00:00').toISOString());
   assert.equal(params.to,new Date('2026-11-05T23:59:59.999').toISOString());
   return {data:{data:rows,pagination:{total:35}}};
  }
  active++;maxActive=Math.max(maxActive,active);await new Promise(setImmediate);active--;
  return {data:{data:{...rows.find(r=>url.endsWith(r.id)),is_return:url.endsWith('sale-1'),sale_items:[{medicine_id:'medicine',quantity:2,unit_price:20,total:40}]}}};
 }};
 const result=await service(api).getHistory(customer,{page:3,from:'2026-10-01',to:'2026-11-05',medicineId:'medicine'},'signal');
 assert.equal(result.total,35);assert.equal(result.invoices.length,8);assert.equal(maxActive,4);
 assert.equal(result.invoices[1].is_return,true);assert.equal(result.invoices[0].sale_items[0].quantity,2);
});
test('unrelated customer rows never trigger invoice detail reads',async()=>{
 const api={get:async url=>{assert.equal(url,'/sales');return {data:{data:[{id:'private',customer_id:'another-customer'}],pagination:{total:1}}};}};
 await assert.rejects(service(api).getHistory(customer,{page:1}),/could not be verified/);
});
test('a mismatched invoice detail is rejected',async()=>{
 const api={get:async url=>({data:{data:url==='/sales'?[{id:'invoice',customer_id:customer.id}]:{id:'invoice',customer_id:'another-customer'},pagination:{total:1}}})};
 await assert.rejects(service(api).getHistory(customer,{page:1}),/could not be verified/);
});
test('customer aliases and an empty history are handled without a ten-invoice truncation',async()=>{
 let empty=false;
 const api={get:async url=>({data:{data:url==='/sales'?(empty?[]:[{id:'old',customer_id:customer._local_id}]):{id:'old',customer_id:customer._local_id,sale_items:[]},pagination:{total:empty?0:11}}})};
 const first=await service(api).getHistory(customer,{page:2});assert.equal(first.total,11);assert.equal(first.invoices[0].id,'old');
 empty=true;const second=await service(api).getHistory(customer,{page:1});assert.equal(second.total,0);assert.equal(second.invoices.length,0);
});
test('failed detail reads are reported rather than presenting an incomplete purchase history',async()=>{
 const api={get:async url=>{if(url!=='/sales')throw new Error('Offline');return {data:{data:[{id:'sale',customer_id:customer.id}],pagination:{total:1}}};}};
 await assert.rejects(service(api).getHistory(customer,{page:1}),/Offline/);
});
