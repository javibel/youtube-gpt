'use strict';

const assert = require('node:assert/strict');
const {findFontFilesInCss} = require('next/dist/compiled/@next/font/dist/google/find-font-files-in-css');

// Next handles the extensionless Google font URLs directly as of 16.4.6.
for (const [url, format, expected] of [
  ['https://fonts.gstatic.com/s/archivo/font.woff2?v=1', 'woff2', 'woff2'],
  ['https://fonts.gstatic.com/l/font?kit=fixture', 'woff2', 'woff2'],
  ['https://fonts.gstatic.com/l/font?kit=fixture', 'woff', 'woff'],
]) {
  const css = `/* latin */\n@font-face {src: url(${url}) format('${format}');}`;
  assert.deepEqual(findFontFilesInCss(css, ['latin']), [
    {googleFontFileUrl: url, preloadFontFile: true, ext: expected},
  ]);
}
console.log('PASS: upstream Next font loader handles query and extensionless font URLs');
