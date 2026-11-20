import { cpSync,mkdirSync } from 'node:fs';
for(const directory of ['cmaps','standard_fonts']){mkdirSync('public/vendor/pdfjs',{recursive:true});cpSync(`node_modules/pdfjs-dist/${directory}`,`public/vendor/pdfjs/${directory}`,{recursive:true});}
cpSync('node_modules/pdfjs-dist/LICENSE','public/vendor/pdfjs/LICENSE');
