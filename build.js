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

// Carimba a versao em quem precisa dela.
//
// O index.html vem sempre da rede, mas o app.js e servido cache-first pelo
// service worker: sem isso, uma versao nova so aparecia na SEGUNDA abertura, e
// na primeira o HTML novo rodava com o JS velho. Com ?v=<versao> no src, o
// endereco muda a cada versao e o par sempre bate. O mesmo endereco entra na
// lista do worker (senao o app perde o modo aviao) e o nome do cache passa a
// ser a propria versao, para o worker novo apagar o cache antigo sozinho.
const ver=(fonte.match(/APP_VERSION\s*=\s*'([^']+)'/)||[])[1];
if(!ver){console.error('nao achei APP_VERSION em src/app.jsx');process.exit(1);}
const troca=(arq,pares)=>{
  const p=path.join(raiz,arq);let t=fs.readFileSync(p,'utf8');
  for(const [de,para] of pares){
    if(!de.test(t)){console.error('build: nao achei',de,'em',arq);process.exit(1);}
    t=t.replace(de,para);
  }
  fs.writeFileSync(p,t);
};
troca('index.html',[[/src="\.\/app\.js(\?v=[^"]*)?"/,'src="./app.js?v='+ver+'"']]);
troca('sw.js',[
  [/const CACHE='[^']+';/,"const CACHE='mfp-"+ver+"';"],
  [/'\.\/app\.js(\?v=[^']*)?'/,"'./app.js?v="+ver+"'"],
]);

const kb=n=>Math.round(n/1024);
console.log('src/app.jsx',kb(fonte.length),'KB  ->  app.js',kb(code.length),'KB   versao',ver);
