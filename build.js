// Compila src/app.jsx -> app.js.
//
// Por que existe: mandar o Babel (3 MB) para o celular e compilar 727 KB de
// JSX a cada abertura fazia o app levar 45s num celular mediano e 72s num
// simples. Compilando aqui, o aparelho recebe so o resultado.
//
// Rode `node build.js` sempre que mexer em src/app.jsx. O teste sincronia.js
// acusa se o app.js ficar velho.
const fs=require('fs'),path=require('path');
const raiz=__dirname;
const babel=require(path.join(raiz,'lib','babel.js'));
const fonte=fs.readFileSync(path.join(raiz,'src','app.jsx'),'utf8');
const {code}=babel.transform(fonte,{presets:['react'],compact:false,comments:true,sourceType:'script'});
const cab='/* Gerado por build.js a partir de src/app.jsx — nao edite este arquivo. */\n';
fs.writeFileSync(path.join(raiz,'app.js'),cab+code);
const kb=n=>Math.round(n/1024);
console.log('src/app.jsx',kb(fonte.length),'KB  ->  app.js',kb(code.length),'KB');
