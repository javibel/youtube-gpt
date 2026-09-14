'use strict';
const path=require('node:path');
const helperRoot=path.resolve(__dirname,'../../.next/build')+path.sep;
function allowsSocket(options,{entry=process.argv[1],ipcPort=process.argv[2]}={}) {
 if(options.path||options.host!=='127.0.0.1')return false;
 if(Number(options.port)===55432)return true;
 // Turbopack's generated PostCSS helper connects to one compiler-selected port.
 // Application workers cannot use this exception and other local ports stay closed.
 return typeof entry==='string' && path.resolve(entry).startsWith(helperRoot)
  && Number.isInteger(Number(ipcPort)) && Number(ipcPort)>0 && Number(ipcPort)<=65535
  && Number(options.port)===Number(ipcPort);
}
module.exports={allowsSocket};
