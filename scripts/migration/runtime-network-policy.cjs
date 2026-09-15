'use strict';
function allowsDatabase(options){return options&&options.host==='127.0.0.1'&&Number(options.port)===55432&&!options.path&&options.fd===undefined;}
function allowsListen(args){
 const options=args[0]&&typeof args[0]==='object'?args[0]:{port:args[0],host:args[1]};
 return options.port===4300&&options.host==='127.0.0.1'&&Object.keys(options).every(key=>['port','host','backlog'].includes(key));
}
module.exports={allowsDatabase,allowsListen};
