import {ANIMALS,animalPrint} from '../web/animal-prints.js';
export const CREATURE_NAMES=Object.fromEntries(ANIMALS.map(animal=>[animal.id,animal.name]));
export const DISPLAY_FONTS={baskerville:'Baskerville, "Palatino Linotype", Georgia, serif',georgia:'Georgia, "Times New Roman", serif',didot:'Didot, "Bodoni MT", Georgia, serif',palatino:'Palatino, "Book Antiqua", Georgia, serif',system:'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'};
export const BODY_FONTS={system:'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',avenir:'Avenir, "Avenir Next", "Segoe UI", sans-serif',helvetica:'"Helvetica Neue", Arial, sans-serif',georgia:'Georgia, serif'};
const base={version:1,name:'Original FinFolk',enabled:false,palette:{paper:'#eff8f3',surface:'#fffef8',ink:'#173f49',accent:'#009db2',muted:'#58767c'},displayFont:'system',bodyFont:'system',headingScale:1,italic:false,lowercase:false,radius:18,shadow:12,spacing:1,material:'glass',motif:'none',motifScale:1,printStyle:'two-tone',printPlacement:'states',collection:'muted',ornament:0,logo:'original',label:''};
export const PRESETS={
 original:base,
 reverie:{...base,name:'Tidal reverie',enabled:true,palette:{paper:'#f1eddf',surface:'#faf7ec',ink:'#293e37',accent:'#9b526e',muted:'#59665a'},displayFont:'baskerville',bodyFont:'avenir',headingScale:1.5,italic:true,lowercase:true,radius:24,shadow:0,material:'paper',motif:'octopus',ornament:.65,logo:'ink',label:'Freediving locations'},
 midnight:{...base,name:'Midnight cabinet',enabled:true,palette:{paper:'#1e2029',surface:'#282b34',ink:'#eee6d2',accent:'#b6caa7',muted:'#bdc1b9'},displayFont:'didot',bodyFont:'helvetica',headingScale:1.45,italic:false,lowercase:false,radius:3,shadow:0,material:'paper',motif:'lionfish',ornament:.75,logo:'ink',label:'Freediving locations'},
 pearl:{...base,name:'Pearl oddity',enabled:true,palette:{paper:'#eeebf0',surface:'#faf6f8',ink:'#382f47',accent:'#607f7b',muted:'#6f6475'},displayFont:'palatino',bodyFont:'system',headingScale:1.4,italic:true,lowercase:false,radius:30,shadow:15,material:'paper',motif:'boxjelly',ornament:.65,logo:'original',label:'Freediving locations'},
 couture:{...base,name:'Nasties couture',enabled:true,palette:{paper:'#eee5d3',surface:'#faf3e5',ink:'#172440',accent:'#99596a',muted:'#586278'},displayFont:'didot',bodyFont:'helvetica',headingScale:1.55,italic:false,radius:4,shadow:0,material:'paper',motif:'conesnail',ornament:.75,printStyle:'two-tone',logo:'ink',label:'Freediving locations'},
 garden:{...base,name:'Venom garden',enabled:true,palette:{paper:'#e7ebdf',surface:'#f4f5e9',ink:'#303c32',accent:'#7d5e7b',muted:'#59665a'},displayFont:'palatino',bodyFont:'avenir',headingScale:1.5,italic:true,radius:18,shadow:0,material:'paper',motif:'stonefish',ornament:.7,printStyle:'two-tone',logo:'ink',label:'Freediving locations'},
 acid:{...base,name:'Acid tide',enabled:true,palette:{paper:'#ecff8c',surface:'#fbffdf',ink:'#172884',accent:'#2248ff',muted:'#3c4c66'},displayFont:'didot',bodyFont:'avenir',headingScale:1.6,italic:true,radius:22,shadow:0,material:'paper',motif:'octopus',ornament:.95,collection:'hyper',label:'Freediving locations'},
 pink:{...base,name:'Pink current',enabled:true,palette:{paper:'#ffd7e9',surface:'#fff1f6',ink:'#402052',accent:'#ac005a',muted:'#754463'},displayFont:'baskerville',bodyFont:'avenir',headingScale:1.6,italic:true,radius:30,shadow:0,material:'paper',motif:'boxjelly',ornament:1,collection:'hyper',label:'Freediving locations'},
 cobalt:{...base,name:'Cobalt club',enabled:true,palette:{paper:'#142fc2',surface:'#2037a8',ink:'#fff5ce',accent:'#ff9bcf',muted:'#d6dcff'},displayFont:'didot',bodyFont:'helvetica',headingScale:1.55,italic:false,radius:8,shadow:0,material:'paper',motif:'lionfish',ornament:1,collection:'hyper',label:'Freediving locations'},
};
const copy=value=>JSON.parse(JSON.stringify(value));
export function validateTheme(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||input.version!==1)throw Error('Choose a FinFolk theme JSON file (version 1).');
 const result=copy(base),allowed=new Set(Object.keys(base));
 if(Object.keys(input).some(key=>!allowed.has(key)))throw Error('Theme contains unknown fields.');
 for(const key of ['name','label']){if(typeof input[key]!=='string'||input[key].length>(key==='name'?60:100)||/[\x00-\x1f]/.test(input[key]))throw Error('Theme text is invalid.');result[key]=input[key];}
 if(!input.palette||Object.keys(input.palette).length!==5)throw Error('Theme needs five palette colours.');
 for(const key of Object.keys(base.palette)){if(!/^#[0-9a-f]{6}$/i.test(input.palette[key]))throw Error('Colours must use six-digit hex values.');result.palette[key]=input.palette[key].toLowerCase();}
 for(const key of ['enabled','italic','lowercase']){if(typeof input[key]!=='boolean')throw Error('Invalid '+key);result[key]=input[key];}
 for(const [key,values] of Object.entries({displayFont:Object.keys(DISPLAY_FONTS),bodyFont:Object.keys(BODY_FONTS),material:['paper','glass'],motif:['none','metamorphosis','wings','scales',...Object.keys(CREATURE_NAMES)],printStyle:['tonal','two-tone'],printPlacement:['states','sections','page','header'],collection:['muted','hyper'],logo:['original','ink']})){const value=(key==='printPlacement'&&['edges','header'].includes(input[key])?'states':input[key])??(['printStyle','printPlacement','collection'].includes(key)?base[key]:undefined);if(!values.includes(value))throw Error('Invalid '+key);result[key]=value;}
 for(const [key,min,max] of [['headingScale',1,1.8],['radius',0,36],['shadow',0,32],['spacing',.85,1.35],['ornament',0,1],['motifScale',.6,1.6]]){const value=input[key]??(key==='motifScale'?base.motifScale:undefined);if(!Number.isFinite(value)||value<min||value>max)throw Error('Invalid '+key);result[key]=value;}
 return result;
}
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const mix=(a,b,t)=>'#'+rgb(a).map((v,i)=>Math.round(v+(rgb(b)[i]-v)*t).toString(16).padStart(2,'0')).join('');
export function luminance(hex){return rgb(hex).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);}
export function contrastRatio(a,b){return (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);}
export function printBackground(input,baseURL='/preview/') {
 const t=validateTheme(input),asset=animalPrint(printMotif(t.motif),luminance(t.palette.paper)<luminance(t.palette.ink)?'dark':'light',t.collection);
 return asset?`url("${baseURL}${asset}")`:'none';
}
const printMotif=id=>({metamorphosis:'bluebottle',wings:'lionfish',scales:'conesnail'}[id]||id);
export function printAvailable(input){return !!animalPrint(printMotif(validateTheme(input).motif),'light',validateTheme(input).collection);}

const cssString=value=>'"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
function paletteCSS(p){return `--atelier-action-ink:${contrastRatio(p.accent,p.paper)>contrastRatio(p.accent,p.ink)?p.paper:p.ink};--finfolk-cream:${p.paper};--finfolk-ink:${p.ink};--finfolk-teal:${p.accent};--teal:${p.accent};--accent:${p.accent};--muted:${p.muted};--line:${mix(p.paper,p.ink,.22)};--glass:${p.surface};--account-bg:${p.paper};--account-surface:${p.surface};--account-ink:${p.ink};--account-muted:${p.muted};--account-accent:${p.accent};--account-line:${mix(p.paper,p.ink,.22)};`;}
function signatureCSS(t,image,hasPrint){
 if(!hasPrint||t.ornament===0)return '';
 const print=`var(--finfolk-animal-print,${image})`,scale=200*t.motifScale;
 if(t.printPlacement==='header')return '';
 if(t.printPlacement==='page')return `/* All-over signature print, with solid reading surfaces. */
:is(.discover-page,.settings-page,.account-page,.logbook-page,.trip-page){background-image:linear-gradient(color-mix(in srgb,var(--account-bg) ${Math.round(100-t.ornament*85)}%,transparent),color-mix(in srgb,var(--account-bg) ${Math.round(100-t.ornament*85)}%,transparent)),${print};background-size:auto,${440*t.motifScale}px ${440*t.motifScale}px;}
:is(.discover-header,.settings-heading,.logbook-header,.account-page>h1,.trip-report>header){background-color:var(--account-surface);padding-left:20px;padding-right:20px;border:1px solid var(--account-line);}
.account-page>.account-intro,.account-page>.social-menu{background:var(--account-surface);padding:16px;border-radius:var(--atelier-radius);}
`;
 if(t.printPlacement==='sections')return `/* Patterned state backgrounds with solid, readable labels. */
:root .state-card{background-image:linear-gradient(color-mix(in srgb,var(--account-surface) ${Math.round((1-t.ornament)*60)}%,transparent),color-mix(in srgb,var(--account-surface) ${Math.round((1-t.ornament)*60)}%,transparent)),var(--state-motif-print,none);background-size:auto,${320*t.motifScale}px ${320*t.motifScale}px;}
.state-card>summary,.state-card>.area-group{background:var(--account-surface);border-radius:8px;padding:12px;margin-bottom:10px;}
:root[data-animal='none'] .state-card{background-image:none;}
`;
 return '';
}
export function compileTheme(input){
 const t=validateTheme(input);if(!t.enabled)return '/* Original FinFolk appearance. Local mood board override is inactive. */\n';
 const p=t.palette,dark=luminance(p.paper)<luminance(p.ink)?p:{paper:mix(p.ink,'#000000',.15),surface:mix(p.ink,p.paper,.08),ink:p.paper,accent:mix(p.accent,p.paper,.4),muted:mix(p.paper,p.ink,.25)};
 const image=printBackground(t,'./'),nightImage=printBackground({...t,palette:dark},'./'),hasPrint=printAvailable(t);
 return `/* FinFolk Atelier — generated theme. Edit through npm run moodboard. */
:root{--atelier-heading:${DISPLAY_FONTS[t.displayFont]};--atelier-body:${BODY_FONTS[t.bodyFont]};--atelier-radius:${t.radius}px;--atelier-spacing:${t.spacing};--atelier-size:${t.headingScale};--finfolk-print-collection:${t.collection};--finfolk-collection-animal:${printMotif(t.motif)};--finfolk-collection-print:${image};--finfolk-print-placement:${t.printPlacement};--finfolk-motif-scale:${t.motifScale};--finfolk-pattern-presence:${t.ornament};--finfolk-motif-filter:${t.printStyle==='tonal'?'grayscale(1)':'none'};}
:root,:root[data-theme]{${paletteCSS(p)}}
:root[data-theme='night']{${paletteCSS(dark)}}
body,.app-rail.sidebar,.discover-page,.settings-page,.account-page,.logbook-page,.trip-page{background:var(--account-bg);color:var(--account-ink);font-family:var(--atelier-body);}
:root h1,:root h2,:root h3,:root .beach-open,:root .beach-open-name,:root .beach-overview h2,:root .settings-page h2,:root .data-panel h2,:root .account-page h2{font-family:var(--atelier-heading);color:var(--account-ink);font-weight:500;}
.discover-header h1,.settings-heading h1,.logbook-header h1{font-size:clamp(calc(30px * var(--atelier-size)),4vw,calc(40px * var(--atelier-size)));font-style:${t.italic?'italic':'normal'};text-transform:${t.lowercase?'lowercase':'none'};letter-spacing:-.04em;}
:is(.discovery,.beach-card,.state-card,.settings-card,.account-card,.data-panel,.system-panel,.compare-card,.logbook-card,.session-card,.trip-report,.trip-highlights>div,.trip-card,.buddy-card,.regulars-panel,.welcome-dialog,.member-tour){border-radius:var(--atelier-radius);border:1px solid var(--account-line);background:var(--account-surface);color:var(--account-ink);box-shadow:0 ${t.shadow/3}px ${t.shadow}px color-mix(in srgb,var(--account-ink) 9%,transparent);backdrop-filter:${t.material==='glass'?'blur(22px)':'none'};}
.logbook-page :is(input,textarea,select),.account-page :is(input:not([type='checkbox']):not([type='radio']),textarea,select),.trip-chart select{background:var(--account-bg);color:var(--account-ink);border-color:var(--account-line);border-radius:min(var(--atelier-radius),12px);}
.logbook-page :is(small,.session-notes),.trip-report :is(small,.trip-note),.trip-highlights span{color:var(--account-muted);}
.account-page .social-menu-action,.account-page .account-tab[aria-selected='true']{background:var(--account-ink);color:var(--account-bg);border-color:var(--account-ink);}
.logbook-page .session-title,.trip-report .trip-kicker,.trip-report a,.account-page a{color:var(--account-accent);}
.trip-bar{background:var(--account-accent);}.trip-report :is(th,td){border-color:var(--account-line);}
.logbook-card,.session-card{padding:calc(24px * var(--atelier-spacing));}
.beach-card{padding:calc(16px * var(--atelier-spacing));}.settings-card,.settings-page .account-card{padding:calc(24px * var(--atelier-spacing));}
:root .primary-nav button.active,:root .discover-tabs button[aria-selected='true']{background:var(--account-ink);color:var(--account-bg);box-shadow:none;border-color:var(--account-ink);}
:root .primary{background:var(--account-accent);color:var(--atelier-action-ink);}
:root .primary:hover:not(:disabled){background:var(--account-ink);color:var(--account-bg);}
:root :is(.text-button,.secondary,.beach-card p,.beach-card small,.state-card summary,.discover-page label){color:var(--account-ink);}
:root :is(input,select,textarea){font-family:var(--atelier-body);}
:root .beach-thumbnail{background:color-mix(in srgb,var(--account-accent) 7%,var(--account-bg));color:var(--account-ink);border-radius:${Math.min(24,t.radius)}px;}
:root .beach-thumbnail-land{fill:color-mix(in srgb,var(--account-accent) 18%,var(--account-bg));stroke:var(--account-accent);}
:root .beach-thumbnail-dot{fill:var(--finfolk-coral);stroke:var(--account-surface);}
:root .tags span{color:var(--account-ink);background:color-mix(in srgb,var(--account-accent) 12%,var(--account-bg));}
:root .data-panel{background:var(--account-surface);}.map-toolbar .map-tools-callout{background:var(--account-surface);color:var(--account-ink);}
.discover-header{position:relative;padding-top:${t.label?24:0}px;padding-bottom:18px;min-width:0;border-bottom:1px solid var(--account-line);margin-bottom:24px;}
.discover-header::before{content:${cssString(t.label)};position:absolute;left:0;top:0;font:500 10px var(--atelier-body);letter-spacing:.12em;text-transform:uppercase;color:var(--account-muted);}
.discover-header h1::before,.logbook-header h1::before{filter:${t.logo==='ink'?'grayscale(1) contrast(1.1)':'none'};}
.logbook-header,.account-page>h1,.trip-report>header{position:relative;padding-bottom:18px;border-bottom:1px solid var(--account-line);}
.discover-header::after,.logbook-header::after,.account-page>h1::after,.trip-report>header::after{content:none!important;display:none!important;}
:root[data-animal='none'] :is(.discover-header,.logbook-header,.account-page>h1,.trip-report>header){padding-bottom:12px;}
${signatureCSS(t,image,hasPrint)}
@media(max-width:900px){.discover-header h1,.settings-heading h1{font-size:calc(30px * var(--atelier-size));}.discover-header::before{max-width:calc(100% - 30px);line-height:1.4;}.discover-header{padding-top:${t.label?34:0}px;}}
`;
}
