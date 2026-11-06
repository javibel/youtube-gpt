'use strict';
// Narrow build-time compatibility fix for the pinned Next16.3.6 font loader.
// Google font URLs need not end in an extension. Keep every font selection,
// transport and style unchanged; derive a missing extension from native bytes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const expected='45e38a6da7efde1a8f53c29619af2eb8f202d352119dbc91c7714db07db385f4';
const anchor="const ext = /\\.(woff|woff2|eot|ttf|otf)$/.exec(googleFontFileUrl)[1];";
function patchSource(source){
 if(crypto.createHash('sha256').update(source).digest('hex')!==expected||source.split(anchor).length!==2)throw Error('Pinned Next font loader differs;review before patching');
 return source.replace(anchor,`const extensionMatch = /\\.(woff|woff2|eot|ttf|otf)(?:[?#].*)?$/.exec(googleFontFileUrl);
            const fontMagic = fontFileBuffer.subarray(0, 4).toString('hex');
            const ext = extensionMatch?.[1] ?? ({'774f4632':'woff2','774f4646':'woff','4f54544f':'otf','00010000':'ttf'})[fontMagic];
            if (!ext) (0, next_font_error_1.nextFontError)('Downloaded font format is unsupported');`);
}
if(require.main===module){
 const root=path.resolve(__dirname,'../..'),target=path.join(root,'node_modules/next/dist/compiled/@next/font/dist/google/loader.js');
 if(require(path.join(root,'node_modules/next/package.json')).version!=='16.3.6'||!fs.lstatSync(target).isFile()||fs.lstatSync(target).isSymbolicLink())throw Error('Exact pinned Next16.3.6 required');
 const source=fs.readFileSync(target,'utf8'),patched=patchSource(source);fs.writeFileSync(target,patched);
 console.log(JSON.stringify({nextFontCompatibilityPatched:true,version:'16.3.6',fontSelectionsChanged:false,network:false}));
}
module.exports={patchSource};
