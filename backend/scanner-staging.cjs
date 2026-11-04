const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
function captureScannerIdentity(directory){
 return Object.fromEntries(['server.cjs','scanner-storage.cjs','migrations/scanner-mariadb-10.11.sql','scanner-staging.cjs'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,file))).digest('hex')]));
}
function stagingEvidence(runtime,storage){
 const root=path.win32.resolve(runtime.sourceRoot).toLowerCase();
 const allowed='c:\\inetpub\\wwwroot\\sam_att-scanner-test';
 const stagingPathVerified=root===allowed||root.startsWith(allowed+'\\');
 const poolScoped=runtime.poolScoped===true;
 const pushDisabled=runtime.pushEnabled!==true;
 const migrationDisabled=runtime.migrationEnabled!==true;
 return {success:true,stagingInstance:runtime.stagingInstance||null,loadedSourceHashes:runtime.identity,
  stagingPathVerified,poolScoped,pushDisabled,migrationDisabled,storage,
  safeToSync:stagingPathVerified&&poolScoped&&pushDisabled&&migrationDisabled&&storage.database==='samchuk_attendance'&&storage.storageReady===true&&storage.calculationSchemaReady===true&&storage.mariaDb1011===true};
}
module.exports={captureScannerIdentity,stagingEvidence};
