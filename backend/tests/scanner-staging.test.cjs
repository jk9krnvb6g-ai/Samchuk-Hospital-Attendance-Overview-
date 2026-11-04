const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {captureScannerIdentity,stagingEvidence}=require('../scanner-staging.cjs');
const storage={database:'samchuk_attendance',mariaDb1011:true,storageReady:true,calculationSchemaReady:true};
const runtime={sourceRoot:'C:\\inetpub\\wwwroot\\Sam_Att-Scanner-Test\\scanner-releases\\fixture',poolScoped:true,pushEnabled:false,migrationEnabled:false,identity:{fixture:'hash'},stagingInstance:'fixture'};
test('staging evidence requires the explicit test subtree, not Production or lookalike paths',()=>{
 assert.equal(stagingEvidence(runtime,storage).safeToSync,true);
 for(const sourceRoot of ['C:\\inetpub\\wwwroot\\Sam_Att','C:\\inetpub\\wwwroot\\Sam_Att-Scanner-Test-other','C:\\inetpub\\wwwroot\\Sam_Att-Scanner-Test\\..\\Sam_Att']) assert.equal(stagingEvidence({...runtime,sourceRoot},storage).safeToSync,false);
});
test('unscoped pool, enabled Push or migration fail staging safety evidence',()=>{
 for(const change of [{poolScoped:false},{pushEnabled:true},{migrationEnabled:true}]) assert.equal(stagingEvidence({...runtime,...change},storage).safeToSync,false);
});
test('wrong schema, unready calculation or engine cannot authorize Scanner acceptance',()=>{
 for(const change of [{database:'hosoffice'},{calculationSchemaReady:false},{storageReady:false},{mariaDb1011:false}]) assert.equal(stagingEvidence(runtime,{...storage,...change}).safeToSync,false);
});
test('loaded source hashes remain fixed even if a file on disk is later replaced',()=>{
 const work=path.resolve(__dirname,'../../..');const dir=fs.mkdtempSync(path.join(work,'scanner-identity-fixture-'));const names=['server.cjs','scanner-storage.cjs','scanner-staging.cjs','migrations/scanner-mariadb-10.11.sql'];
 fs.mkdirSync(path.join(dir,'migrations'));
 try{for(const name of names)fs.writeFileSync(path.join(dir,name),'fixture');const loaded=captureScannerIdentity(dir);fs.writeFileSync(path.join(dir,'server.cjs'),'changed');assert.notEqual(captureScannerIdentity(dir)['server.cjs'],loaded['server.cjs']);assert.equal(Object.keys(loaded).length,4);}
 finally{for(const name of names)fs.unlinkSync(path.join(dir,name));fs.rmdirSync(path.join(dir,'migrations'));fs.rmdirSync(dir);}
});
const source=fs.readFileSync(path.join(__dirname,'../server.cjs'),'utf8');
function statusHandler(config,context){let handler;let dbQueries=0;const a=source.indexOf("samRouter.get(samRoute('/api/scanners/staging-status'),");const b=source.indexOf('\n});',a)+5;assert.ok(a>=0&&b>a);
 const ctx=vm.createContext({getActiveConfig:()=>config,routerContextStorage:{getStore:()=>context},samRoute:x=>x,requireRole:roles=>{assert.deepEqual(Array.from(roles),['ADMIN','HR']);return ()=>{}},samRouter:{get:(_path,...handlers)=>handler=handlers.at(-1)},inspectScannerStorage:async()=>{dbQueries++;return storage}});vm.runInContext(source.slice(a,b),ctx);return {handler,queries:()=>dbQueries};}
for(const [name,config,context,status] of [['disabled',{},null,404],['unscoped',{scannerStagingAcceptance:true},{},503]])test('staging endpoint '+name+' returns before DB access',async()=>{
 const h=statusHandler(config,context);const response={status(n){this.code=n;return this},json(b){this.body=b}};await h.handler({},response);assert.equal(response.code,status);assert.equal(h.queries(),0);
});

test('createSamAttRouter isolates injected pools across asynchronous requests without listeners',async()=>{
 const {AsyncLocalStorage}=require('node:async_hooks');const scope=new AsyncLocalStorage();const routers=[];const sharedPool={name:'CENTRAL_UNCHANGED'};
 const ctx=vm.createContext({routerContextStorage:scope,config:{allowMigration:false},dbPool:sharedPool,mysql:{createPool:()=>{throw new Error('Must use scoped pool')}},samRouter:{},express:{Router:()=>{const r={middlewares:[],use(fn){this.middlewares.push(fn)}};routers.push(r);return r}}});
 const a=source.indexOf('function getDbPool()');const b=source.indexOf('function getHosofficePool',a);const c=source.indexOf('function createSamAttRouter(');const d=source.indexOf('// Mount Sam_Att Router on standalone app',c);
 vm.runInContext(source.slice(a,b)+source.slice(c,d),ctx);const poolA={name:'A'},poolB={name:'B'};
 const routerA=ctx.createSamAttRouter({dbPool:poolA}),routerB=ctx.createSamAttRouter({dbPool:poolB});
 await Promise.all([[routerA,poolA],[routerB,poolB]].map(([router,pool])=>new Promise((resolve,reject)=>{router.middlewares[0]({}, {},()=>{queueMicrotask(()=>{try{assert.equal(ctx.getDbPool(),pool);resolve()}catch(e){reject(e)}})})})));
 assert.equal(ctx.dbPool,sharedPool);assert.equal(routers.length,2);assert.equal(routerA.getDependencies().dbPool,poolA);
});

function readerPath(config){const begin=source.indexOf('function getScannerReaderExePath()');const end=source.indexOf('function executeScannerReaderCli',begin);let checks=0;const ctx=vm.createContext({getActiveConfig:()=>config,path,__dirname:'C:/fixture-release/backend',process:{env:{SCAN_READER_EXE:'C:/production/ScannerSyncCli.exe'},cwd:()=> 'C:/fixture-release'},fs:{existsSync:()=>{checks++;return true}}});vm.runInContext(source.slice(begin,end),ctx);return {result:ctx.getScannerReaderExePath(),checks};}
test('staging without an explicit reader never falls back to the Production executable',()=>{const r=readerPath({scannerStagingAcceptance:true});assert.match(r.result,/__staging_reader_not_configured__/);assert.equal(r.checks,0)});
test('scoped reader configuration is used without modifying the executable or global environment',()=>{const p='C:/approved-reader/ScannerSyncCli.exe';const r=readerPath({scannerStagingAcceptance:true,scannerReaderExePath:p});assert.equal(r.result,path.resolve(p));assert.equal(r.checks,0)});
test('non-staging reader selection preserves the prior environment fallback',()=>{const r=readerPath({});assert.equal(r.result,'C:/production/ScannerSyncCli.exe');assert.equal(r.checks,1)});
