(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))o(r);new MutationObserver(r=>{for(const a of r)if(a.type==="childList")for(const s of a.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&o(s)}).observe(document,{childList:!0,subtree:!0});function n(r){const a={};return r.integrity&&(a.integrity=r.integrity),r.referrerPolicy&&(a.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?a.credentials="include":r.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function o(r){if(r.ep)return;r.ep=!0;const a=n(r);fetch(r.href,a)}})();const ce=["prep","solve","export"],$e={prep:"Prep",solve:"Solve",export:"Export"},an={prep:null,solve:"prep",export:"solve"},ue="pending",oe="complete",Ye=800,wt=[{slot:1,name:"Black",hex:"#101010",td_mm:.4,band_layers:12},{slot:2,name:"Blue",hex:"#0B39B5",td_mm:.8,band_layers:12},{slot:3,name:"Green",hex:"#2C7A2E",td_mm:.9,band_layers:12},{slot:4,name:"White",hex:"#F2F4F0",td_mm:1.6,band_layers:12}],Nt=()=>new Date().toISOString().slice(0,19);function Vn(){if(globalThis.crypto?.randomUUID)try{return crypto.randomUUID()}catch{}const e=crypto.getRandomValues(new Uint8Array(16));e[6]=e[6]&15|64,e[8]=e[8]&63|128;const t=[...e].map(n=>n.toString(16).padStart(2,"0")).join("");return`${t.slice(0,8)}-${t.slice(8,12)}-${t.slice(12,16)}-${t.slice(16,20)}-${t.slice(20)}`}function qn(e){return{schema_version:1,id:Vn(),name:e,created:Nt(),modified:Nt(),folder:"",status:{prep:ue,solve:ue,export:ue},source:{filename:"",width_px:0,height_px:0},prep:{crop:null,rotate_deg:0,flip_h:!1,output_px:[Ye,Ye],physical_width_mm:120,adjustments:{brightness:0,contrast:0,saturation:0,denoise:0,sharpen:0,pixelize:0,decimate:0},focal_regions:[],shape:{mode:"rect",tolerance:.25,min_feature_mm:.8}},solve:{layer_height_mm:.08,base_layers:7,max_layers:45,filaments:wt.map(t=>({...t})),dither:"bayer8",dither_amount:1,band_mode:"solid",slope_mm_per_layer:.3,colours_seeded:!1,colours_auto:!1,border:{enabled:!0,width_mm:3,mode:"raised",frame_slot:1}},export:{mesh_mode:"banded_slabs",formats:["3mf"],last_export:null,price_per_kg:25}}}function Et(e){const t=e&&typeof e=="object"?e:{},n=qn(typeof t.name=="string"?t.name:"project"),o=g=>g&&typeof g=="object"&&!Array.isArray(g)?g:{},r=(g,v,G,z)=>Number.isFinite(+g)&&g!==null&&g!==""?Math.min(z,Math.max(G,+g)):v,a=(g,v,G)=>v.includes(g)?g:G,s=(g,v)=>/^#[0-9a-f]{6}$/i.test(String(g))?String(g).toUpperCase():v,l=(g,v,G)=>typeof g=="string"?g.slice(0,G):v,c={...t};c.schema_version=1,c.id=typeof t.id=="string"&&/^[0-9a-f-]{8,64}$/i.test(t.id)?t.id:n.id,c.name=l(t.name,n.name,120)||n.name,c.created=l(t.created,n.created,40),c.modified=l(t.modified,n.modified,40),c.folder=l(t.folder,"",200),c.group=l(t.group,"",60).trim();const i=o(t.status);c.status=Object.fromEntries(ce.map(g=>[g,i[g]===oe?oe:ue])),c.source={...n.source,...o(t.source)},c.source.filename=l(c.source.filename,"",200);const u=o(t.prep),p=n.prep,m=Array.isArray(u.crop)&&u.crop.length===4&&u.crop.every(g=>Number.isFinite(+g))?u.crop.map(Number):null,h=o(u.shape),d=(Array.isArray(h.cuts)?h.cuts:[]).slice(0,500).flatMap(g=>{const v=Array.isArray(g?.pts)?g.pts.slice(0,4e3):[];return!["cut","back","only"].includes(g?.tool)||v.length<3?[]:v.every(G=>Array.isArray(G)&&G.length===2&&G.every(z=>typeof z=="number"&&Math.abs(z)<100))?[{tool:g.tool,pts:v.map(([G,z])=>[G,z])}]:[]}),_=o(u.adjustments);c.prep={...u,crop:m,rotate_deg:a(+u.rotate_deg,[0,90,180,270],0),flip_h:u.flip_h===!0,output_px:Array.isArray(u.output_px)&&u.output_px.length===2?u.output_px.map(g=>r(g,Ye,1,4096)):p.output_px,physical_width_mm:r(u.physical_width_mm,p.physical_width_mm,5,2e3),adjustments:Object.fromEntries(Object.entries(p.adjustments).map(([g,v])=>[g,r(_[g],v,-1,g==="decimate"?256:1)])),focal_regions:Array.isArray(u.focal_regions)?u.focal_regions:[],shape:{mode:a(h.mode,["rect","ellipse","alpha","knockout"],"rect"),tolerance:r(h.tolerance,.25,0,1),min_feature_mm:r(h.min_feature_mm,.8,0,20),cuts:d}};const y=o(t.solve),F=n.solve,x=(Array.isArray(y.filaments)?y.filaments:[]).slice(0,8).map((g,v)=>({...o(g),slot:v+1,name:l(g?.name,"",40),hex:s(g?.hex,(wt[v]||wt[0]).hex),td_mm:r(g?.td_mm,1,.05,6),band_layers:Math.round(r(g?.band_layers,12,0,120))})),P=o(y.border);c.solve={...y,layer_height_mm:r(y.layer_height_mm,F.layer_height_mm,.02,1),base_layers:Math.round(r(y.base_layers,F.base_layers,1,400)),max_layers:Math.round(r(y.max_layers,F.max_layers,1,2e3)),filaments:x.length?x:F.filaments,dither:a(y.dither,["bayer8","none"],"bayer8"),dither_amount:r(y.dither_amount,1,0,4),band_mode:a(y.band_mode,["solid","blend"],"solid"),slope_mm_per_layer:r(y.slope_mm_per_layer,.3,0,5),colours_seeded:y.colours_seeded===!0,colours_auto:y.colours_auto===!0,border:{...F.border,...P,enabled:P.enabled!==!1,width_mm:r(P.width_mm,3,0,100),mode:a(P.mode,["raised","flush","none"],"raised"),frame_slot:Math.round(r(P.frame_slot,1,1,8))}};const k=o(t.export);return c.export={...n.export,...k,price_per_kg:r(k.price_per_kg,25,0,1e5),formats:Array.isArray(k.formats)?k.formats.filter(g=>g==="3mf"||g==="stl"):["3mf"]},c}const C={project:null,sourceBitmap:null,sourceHasAlpha:!1,prepped:null,proxy:null,solved:null,stage:"prep"};function Ot(e){const t=an[e];return t?!!C.project&&C.project.status[t]===oe:!0}function Ue(e,t){if(C.project.status[e]=t,C.project.modified=Nt(),t!==oe){const n=ce.indexOf(e);for(const o of ce.slice(n+1))C.project.status[o]=ue}}const Wn={rect:"rectangle",ellipse:"circle / oval",alpha:"transparent cut-out",knockout:"knock out background"},Zt={mode:"rect",tolerance:.25,min_feature_mm:.8};function Jn(e,t,n,o,r){const a=t+2,s=new Uint8Array(a*(n+2));for(let c=0;c<n;c++)s.set(e.subarray(c*t,c*t+t),(c+1)*a+1);const l=new Uint8Array(e.length);for(let c=0;c<n;c++){let i=(c+1)*a+1,u=c*t;for(let p=0;p<t;p++,u++,i++){let m;o?(m=s[i]|s[i-1]|s[i+1]|s[i-a]|s[i+a],r&&(m|=s[i-a-1]|s[i-a+1]|s[i+a-1]|s[i+a+1])):(m=s[i]&s[i-1]&s[i+1]&s[i-a]&s[i+a],r&&(m&=s[i-a-1]&s[i-a+1]&s[i+a-1]&s[i+a+1])),l[u]=m}}return l}function Ht(e,t,n,o){let r=e;for(let a=0;a<o;a++)r=Jn(r,t,n,!1,a%2===1);return r===e?e.slice():r}function yn(e,t,n,o){let r=e;for(let a=0;a<o;a++)r=Jn(r,t,n,!0,a%2===1);return r===e?e.slice():r}function Do(e,t,n,o){const r=Ht(e,t,n,o),a=new Uint8Array(e.length);for(let s=0;s<e.length;s++)a[s]=e[s]&&!r[s]?1:0;return a}function Kn(e){for(let t=3;t<e.length;t+=4)if(e[t]<250)return!0;return!1}function Yt(e){const t=e.data;let n=0,o=0,r=0,a=0;for(let s=0;s<t.length;s+=4){const l=t[s+3]/255;n+=t[s]*l,o+=t[s+1]*l,r+=t[s+2]*l,a+=l}if(a<1){for(let s=3;s<t.length;s+=4)t[s]=255;return e}n/=a,o/=a,r/=a;for(let s=0;s<t.length;s+=4){const l=t[s+3]/255;t[s]=t[s]*l+n*(1-l),t[s+1]=t[s+1]*l+o*(1-l),t[s+2]=t[s+2]*l+r*(1-l),t[s+3]=255}return e}function No(e,t){const n=new Uint8Array(e*t),o=e/2,r=t/2;for(let a=0;a<t;a++)for(let s=0;s<e;s++){let l=0;for(let c=0;c<4;c++){const i=(a+(c+.5)/4-r)/r;for(let u=0;u<4;u++){const p=(s+(u+.5)/4-o)/o;p*p+i*i<=1&&l++}}n[a*e+s]=l>=8?1:0}return n}function Oo(e,t,n,o){const r=(e+o[0])*.5,a=e-o[0],s=t-o[1],l=n-o[2];return Math.sqrt((2+r/256)*a*a+4*s*s+(2+(255-r)/256)*l*l)/765}function Zo(e){const t=Float32Array.from(e).sort();return t[t.length>>1]}function Ho(e,t,n){const o=[[],[],[]],r=(a,s)=>{const l=(s*t+a)*4;for(let c=0;c<3;c++)o[c].push(e[l+c])};for(let a=0;a<t;a++)r(a,0),r(a,n-1);for(let a=0;a<n;a++)r(0,a),r(t-1,a);return o.map(Zo)}function Yo(e,t){const{data:n,width:o,height:r}=e,a=Ho(n,o,r),s=.04+Math.min(1,Math.max(0,t))*.36,l=new Uint8Array(o*r);for(let d=0,_=0;_<o*r;_++,d+=4)l[_]=Oo(n[d],n[d+1],n[d+2],a)<s?1:0;const c=new Uint8Array(o*r),i=new Int32Array(o*r);let u=0,p=0;const m=d=>{l[d]&&!c[d]&&(c[d]=1,i[p++]=d)};for(let d=0;d<o;d++)m(d),m((r-1)*o+d);for(let d=0;d<r;d++)m(d*o),m(d*o+o-1);for(;u<p;){const d=i[u++],_=d%o;_>0&&m(d-1),_<o-1&&m(d+1),d>=o&&m(d-o),d<o*(r-1)&&m(d+o)}const h=new Uint8Array(o*r);for(let d=0;d<h.length;d++)h[d]=c[d]?0:1;return h}function Vo(e,t,n){const o=new Uint8Array(t*n);if(e.length<3)return o;let r=1/0,a=-1/0;for(const i of e)i[1]<r&&(r=i[1]),i[1]>a&&(a=i[1]);const s=Math.max(0,Math.ceil(r-.5)),l=Math.min(n-1,Math.floor(a-.5)),c=[];for(let i=s;i<=l;i++){const u=i+.5;c.length=0;for(let p=0,m=e.length-1;p<e.length;m=p++){const[h,d]=e[m],[_,y]=e[p];(d<=u&&y>u||y<=u&&d>u)&&c.push(h+(u-d)*(_-h)/(y-d))}c.sort((p,m)=>p-m);for(let p=0;p+1<c.length;p+=2){const m=Math.max(0,Math.ceil(c[p]-.5)),h=Math.min(t-1,Math.floor(c[p+1]-.5));for(let d=m;d<=h;d++)o[i*t+d]=1}}return o}function Vt(e,t,n=!1){if(e.length<3)return e.slice();if(n){let a=1,s=-1;for(let i=1;i<e.length;i++){const u=Math.hypot(e[i][0]-e[0][0],e[i][1]-e[0][1]);u>s&&(s=u,a=i)}const l=Vt(e.slice(0,a+1),t),c=Vt(e.slice(a),t);return l.concat(c.slice(1))}const o=new Uint8Array(e.length);o[0]=o[e.length-1]=1;const r=[[0,e.length-1]];for(;r.length;){const[a,s]=r.pop(),[l,c]=e[a],[i,u]=e[s],p=i-l,m=u-c,h=Math.hypot(p,m)||1;let d=-1,_=t;for(let y=a+1;y<s;y++){const F=Math.abs((e[y][0]-l)*m-(e[y][1]-c)*p)/h;F>_&&(_=F,d=y)}d>=0&&(o[d]=1,r.push([a,d],[d,s]))}return e.filter((a,s)=>o[s])}function qo(e){let t=0;for(let n=0,o=e.length-1;n<e.length;o=n++)t+=e[o][0]*e[n][1]-e[n][0]*e[o][1];return Math.abs(t)/2}function Wo(e,t,n,o,r){const a=e?e.slice():new Uint8Array(t*n).fill(1);for(const s of o){const l=Vo(s.pts.map(([c,i])=>r(c,i)),t,n);if(s.tool==="back")for(let c=0;c<a.length;c++)l[c]&&(a[c]=e?e[c]:1);else if(s.tool==="only")for(let c=0;c<a.length;c++)a[c]=a[c]&&l[c]?1:0;else for(let c=0;c<a.length;c++)l[c]&&(a[c]=0)}return a}function Qn(e,t,n,o,r){const a=Math.round(Math.max(0,r)*o/2);if(a<1)return e;const s=yn(Ht(e,t,n,a),t,n,a);for(let c=0;c<e.length;c++)s[c]=s[c]&&e[c]?1:0;const l=Ht(yn(s,t,n,a),t,n,a);for(let c=0;c<e.length;c++)l[c]=l[c]||s[c]?1:0;return l}function Jo(e,t,{tolerance:n=Zt.tolerance,pxPerMm:o=6,minFeatureMm:r=Zt.min_feature_mm}={}){const{width:a,height:s,data:l}=t;let c;if(e==="ellipse")return No(a,s);if(e==="alpha"){if(!Kn(l))return null;c=new Uint8Array(a*s);for(let i=0;i<c.length;i++)c[i]=l[i*4+3]>=128?1:0}else if(e==="knockout")c=Yo(t,n);else return null;return Qn(c,a,s,o,r)}function rn(e){if(!e)return 1;let t=0;for(let n=0;n<e.length;n++)t+=e[n];return t/e.length}function eo(e,t,n,o,r){if(!e)return null;const a=new Uint8Array(o*r);for(let s=0;s<r;s++){const l=Math.min(n-1,Math.floor((s+.5)*n/r));for(let c=0;c<o;c++){const i=Math.min(t-1,Math.floor((c+.5)*t/o));a[s*o+c]=e[l*t+i]}}return a}const dt=64,Ko=18,Qo=.4,zt=[{key:"free",label:"free",ratio:null},{key:"1:1",label:"1:1",ratio:1},{key:"4:5",label:"4:5",ratio:4/5},{key:"3:2",label:"3:2",ratio:3/2}];function wn(e,t,n){const o=(t%360+360)%360,r=o===90||o===270,a=r?e.height:e.width,s=r?e.width:e.height,l=document.createElement("canvas");l.width=a,l.height=s;const c=l.getContext("2d");return c.translate(a/2,s/2),c.rotate(o*Math.PI/180),n&&c.scale(-1,1),c.drawImage(e,-e.width/2,-e.height/2),l}function pt(e,t,n){if(!n)return{x:0,y:0,w:e,h:t};let o=e,r=e/n;return r>t&&(r=t,o=t*n),{x:(e-o)/2,y:(t-r)/2,w:o,h:r}}function ea(e,t,{rotateDeg:n=0,flipH:o=!1,crop:r=null,onChange:a=()=>{}}={}){let s=n,l=o,c=null,i=wn(t,s,l),u=r?{x:r[0],y:r[1],w:r[2],h:r[3]}:pt(i.width,i.height,null);e.innerHTML="";const p=document.createElement("div");p.className="crop-wrap";const m=document.createElement("div");m.className="crop-stage";const h=document.createElement("canvas"),d=document.createElement("div");d.className="crop-box";const _=document.createElement("canvas");_.className="crop-overlay",d.appendChild(_);let y=null,F=0;for(const b of["nw","ne","sw","se"]){const I=document.createElement("div");I.className=`handle ${b}`,I.dataset.corner=b,d.appendChild(I)}const x=document.createElement("canvas");x.className="lasso-layer",x.hidden=!0,m.append(h,d,x),p.append(m),e.appendChild(p);const P=()=>h.clientWidth/i.width;function k(){const b=window.devicePixelRatio||1,I=2*Ko,Z=Math.max(80,(p.clientWidth||300)-I),V=Math.max(80,(p.clientHeight||window.innerHeight*Qo)-I),O=i.height/i.width;let Y=Z,q=Y*O;q>V&&(q=V,Y=q/O),h.width=Math.round(Y*b),h.height=Math.round(q*b),h.style.width=`${Y}px`,h.style.height=`${q}px`,x.width=h.width,x.height=h.height;const J=h.getContext("2d");J.imageSmoothingQuality="high",J.drawImage(i,0,0,h.width,h.height),g(),G()}function g(){const b=P();d.style.left=`${u.x*b}px`,d.style.top=`${u.y*b}px`,d.style.width=`${u.w*b}px`,d.style.height=`${u.h*b}px`}function v(b){const I=i.width,Z=i.height;return b.w=Math.min(Math.max(b.w,dt),I),b.h=Math.min(Math.max(b.h,dt),Z),b.x=Math.min(Math.max(b.x,0),I-b.w),b.y=Math.min(Math.max(b.y,0),Z-b.h),b}function G(){clearTimeout(F),F=setTimeout(()=>{const b=y?y(i,X.getCrop()):null;_.hidden=!b,b&&(_.width=b.width,_.height=b.height,_.getContext("2d").drawImage(b,0,0))},60)}function z(){g(),a(X.getCrop()),G()}let E=null;p.addEventListener("pointerdown",b=>{const I=b.target.dataset?.corner;(b.target===d||I)&&(b.preventDefault(),p.setPointerCapture(b.pointerId),E={id:b.pointerId,corner:I,sx:b.clientX,sy:b.clientY,start:{...u}})}),p.addEventListener("pointermove",b=>{if(!E||b.pointerId!==E.id)return;const I=P(),Z=(b.clientX-E.sx)/I,V=(b.clientY-E.sy)/I,O=E.start;if(!E.corner)return u=v({...O,x:O.x+Z,y:O.y+V}),z();const Y=i.width,q=i.height,J=E.corner.includes("w"),L=E.corner.includes("n"),B=J?O.x+O.w:O.x,H=L?O.y+O.h:O.y;let W=(J?O.x:O.x+O.w)+Z,Q=(L?O.y:O.y+O.h)+V;W=Math.min(Math.max(W,0),Y),Q=Math.min(Math.max(Q,0),q);let ee=Math.max(dt,Math.abs(W-B)),te=Math.max(dt,Math.abs(Q-H));if(c){ee/te>c?te=ee/c:ee=te*c;const se=J?B:Y-B,ge=L?H:q-H;ee>se&&(ee=se,te=ee/c),te>ge&&(te=ge,ee=te*c)}u=v({x:J?B-ee:B,y:L?H-te:H,w:ee,h:te}),z()});const w=b=>{E&&b.pointerId===E.id&&(E=null)};p.addEventListener("pointerup",w),p.addEventListener("pointercancel",w);function M(b,I){const Z=t.width,V=t.height;let O=b*Z-Z/2;const Y=I*V-V/2;l&&(O=-O);const q=(s%360+360)%360*Math.PI/180,J=Math.cos(q),L=Math.sin(q);return[O*J-Y*L+i.width/2,O*L+Y*J+i.height/2]}function T(b,I){const Z=t.width,V=t.height,O=b-i.width/2,Y=I-i.height/2,q=-((s%360+360)%360)*Math.PI/180,J=Math.cos(q),L=Math.sin(q);let B=O*J-Y*L;const H=O*L+Y*J;return l&&(B=-B),[(B+Z/2)/Z,(H+V/2)/V]}const N={cut:"255, 90, 70",back:"90, 220, 120",only:"90, 170, 255"};let S=null,A=null;function j(){const b=x.getContext("2d");if(b.setTransform(1,0,0,1,0,0),b.clearRect(0,0,x.width,x.height),!A||A.pts.length<2)return;const I=x.width/Math.max(1,h.clientWidth);b.scale(I,I),b.lineJoin=b.lineCap="round",b.beginPath(),A.pts.forEach(([Z,V],O)=>O?b.lineTo(Z,V):b.moveTo(Z,V)),b.closePath(),b.fillStyle=`rgba(${N[S?.tool]||N.cut}, .28)`,b.fill(),b.lineWidth=4.5,b.strokeStyle="rgba(0, 0, 0, .75)",b.stroke(),b.lineWidth=2,b.strokeStyle="#fff",b.setLineDash([7,5]),b.stroke(),b.setLineDash([])}const $=b=>{const I=x.getBoundingClientRect();return[b.clientX-I.left,b.clientY-I.top]};x.addEventListener("pointerdown",b=>{if(S){b.preventDefault();try{x.setPointerCapture(b.pointerId)}catch{}A={id:b.pointerId,pts:[$(b)]},j()}}),x.addEventListener("pointermove",b=>{if(!A||b.pointerId!==A.id)return;const I=$(b),Z=A.pts[A.pts.length-1];Math.hypot(I[0]-Z[0],I[1]-Z[1])<2||(A.pts.push(I),j())});const U=(b,I)=>{if(!A||b.pointerId!==A.id)return;const Z=A.pts;if(A=null,j(),I||!S)return;const V=P(),O=Vt(Z,1.4,!0);O.length<3||qo(O)<80||S.onStroke(O.map(([Y,q])=>T(Y/V,q/V).map(J=>Math.round(J*1e4)/1e4)))};x.addEventListener("pointerup",b=>U(b,!1)),x.addEventListener("pointercancel",b=>U(b,!0));const R=new ResizeObserver(()=>k());R.observe(p);const D=()=>k();window.addEventListener("resize",D);const X={setAspect(b){c=b;const I=u.x+u.w/2,Z=u.y+u.h/2,V=pt(i.width,i.height,b);if(b){let O=Math.min(u.w,V.w),Y=O/b;Y>V.h&&(Y=V.h,O=Y*b),u=v({x:I-O/2,y:Z-Y/2,w:O,h:Y})}z()},setOrientation(b,I){s=b,l=I,i=wn(t,s,l),u=pt(i.width,i.height,c),k(),a(X.getCrop())},reset(){u=pt(i.width,i.height,c),z()},setOverlay(b){y=b,G()},refreshOverlay(){G()},oriented(){return i},getCrop(){return[u.x,u.y,u.w,u.h].map(Math.round)},output(b){const[I,Z,V,O]=X.getCrop(),Y=b/Math.max(V,O),q=document.createElement("canvas");q.width=Math.max(1,Math.round(V*Math.min(Y,1))),q.height=Math.max(1,Math.round(O*Math.min(Y,1)));const J=q.getContext("2d");return J.imageSmoothingQuality="high",J.drawImage(i,I,Z,V,O,0,0,q.width,q.height),q},toOriented:M,toSource:T,setLasso(b){S=b,A=null,x.hidden=!b,m.classList.toggle("lassoing",!!b),j()},setLassoTool(b){S&&(S.tool=b)},relayout(){k()},destroy(){clearTimeout(F),R.disconnect(),window.removeEventListener("resize",D),e.innerHTML=""}};return k(),X}async function to(e,t=4096){const n=await createImageBitmap(e,{imageOrientation:"from-image"}),o=Math.max(n.width,n.height);if(o<=t)return n;const r=t/o,a=await createImageBitmap(e,{imageOrientation:"from-image",resizeWidth:Math.round(n.width*r),resizeHeight:Math.round(n.height*r),resizeQuality:"high"});return n.close(),a}const ta=[[0,32,8,40,2,34,10,42],[48,16,56,24,50,18,58,26],[12,44,4,36,14,46,6,38],[60,28,52,20,62,30,54,22],[3,35,11,43,1,33,9,41],[51,19,59,27,49,17,57,25],[15,47,7,39,13,45,5,37],[63,31,55,23,61,29,53,21]].map(e=>e.map(t=>t/64-.5));function bt(e){const t=e.replace("#","");return[0,2,4].map(n=>parseInt(t.slice(n,n+2),16))}function ot(e){return"#"+e.map(t=>Math.round(Math.max(0,Math.min(255,t))).toString(16).padStart(2,"0").toUpperCase()).join("")}function St(e){const t=Math.floor(e),n=e-t;return n>.5?t+1:n<.5||t%2===0?t:t+1}function Ve(e,t,n="solid"){let o=bt(e[0].hex);const r=[o.slice()],a=[e[0].slot];for(const s of e){const l=bt(s.hex),c=Math.max(1e-4,Number(s.td_mm??1)),i=Math.min(1,Math.max(0,t/c)),u=Math.min(3,Math.max(1,St(c/t*.25)));for(let p=0;p<(s.band_layers|0);p++){const m=n==="solid"?p>=u?1:.6+.4*p/u:i;o=o.map((h,d)=>l[d]*m+h*(1-m)),r.push(o.slice()),a.push(s.slot)}}return{lut:r,owner:a}}function na(e,t,n="solid"){const o=e.length;let r=new Float64Array(o);r[0]=1;const a=[r.slice()];return e.forEach((s,l)=>{const c=Math.max(1e-4,Number(s.td_mm??1)),i=Math.min(1,Math.max(0,t/c)),u=Math.min(3,Math.max(1,St(c/t*.25)));for(let p=0;p<(s.band_layers|0);p++){const m=n==="solid"?p>=u?1:.6+.4*p/u:i;r=r.map(h=>h*(1-m)),r[l]+=m,a.push(r.slice())}}),a}function oa(e,t,n,o,{dither:r=!0,amount:a=1}={}){const s=o.length,l=new Float32Array(s*3);o.forEach((u,p)=>{l[p*3]=u[0],l[p*3+1]=u[1],l[p*3+2]=u[2]});let c=0;if(r&&a>0&&s>1){const u=[];for(let m=1;m<s;m++)u.push(Math.hypot(l[m*3]-l[m*3-3],l[m*3+1]-l[m*3-2],l[m*3+2]-l[m*3-1]));u.sort((m,h)=>m-h);const p=u.length;c=p%2?u[p>>1]:(u[p/2-1]+u[p/2])/2,c*=a}const i=new Uint16Array(t*n);for(let u=0;u<n;u++){const p=ta[u%8];for(let m=0;m<t;m++){const h=u*t+m,d=h*4,_=c?p[m%8]*c:0,y=e[d]+_,F=e[d+1]+_,x=e[d+2]+_;let P=0,k=1/0;for(let g=0;g<s;g++){const v=l[g*3],G=l[g*3+1],z=l[g*3+2],E=(y+v)*.5,w=y-v,M=F-G,T=x-z,N=(2+E/256)*w*w+4*M*M+(2+(255-E)/256)*T*T;N<k&&(k=N,P=g)}i[h]=P}}return i}function aa(e,t,n,o,r,a=600){if(r<=0)return e;const s=o/r,l=s*1.4142;let c=Float32Array.from(e);const i=[[1,0,s],[-1,0,s],[0,1,s],[0,-1,s],[1,1,l],[1,-1,l],[-1,1,l],[-1,-1,l]];for(let p=0;p<a;p++){const m=c;c=m.slice();for(const[d,_,y]of i){const F=Math.max(0,-d),x=n-Math.max(0,d),P=Math.max(0,-_),k=t-Math.max(0,_);for(let g=F;g<x;g++){let v=g*t+P,G=(g+d)*t+P+_;for(let z=P;z<k;z++,v++,G++){const E=m[v]-y;E>c[G]&&(c[G]=E)}}}let h=!0;for(let d=0;d<c.length;d++)if(c[d]!==m[d]){h=!1;break}if(h)break}const u=new Uint16Array(e.length);for(let p=0;p<u.length;p++)u[p]=St(c[p]);return u}function bn(e,t){if(!t)return e;const n=e.slice();for(let o=0;o<n.length;o++)t[o]||(n[o]=0);return n}function ra(e,t,n,{widthPx:o,mode:r,rimLayers:a,maxLayers:s,mask:l=null}){if(o<=0||r==="none")return e;const c=r==="raised"?Math.min(s,Math.max(0,a)):0,i=e.slice();if(l){const p=Do(l,t,n,o);for(let m=0;m<i.length;m++)p[m]&&(i[m]=c);return i}const u=o;for(let p=0;p<n;p++)for(let m=0;m<t;m++)(p<u||p>=n-u||m<u||m>=t-u)&&(i[p*t+m]=c);return i}const sa=(e,t)=>Math.max(0,St(e/Math.max(1e-6,t)));function sn(e,t){let n=0;for(const o of e)if(n+=o.band_layers|0,o.slot===t)return n;return n}function ia(e,t,n){const o=[];let r=n;return e.forEach((a,s)=>{let l=a.band_layers|0;s===0&&(l+=n,r=0),!(l<=0)&&(o.push({slot:a.slot,name:a.name||`Slot ${a.slot}`,hex:a.hex,start_layer:r,layers:l,start_z_mm:+(r*t).toFixed(3),end_z_mm:+((r+l)*t).toFixed(3)}),r+=l)}),o}function la(e,t,n){const o=e.reduce((a,s)=>a+(s.band_layers|0),0),r=o+n;return{colour_layers:o,total_layers:r,base_mm:+(n*t).toFixed(3),total_mm:+(r*t).toFixed(3)}}function ca(e,t,n){const o=Math.max(1,n);return t<1?"thin - likely to curl or warp":t<1.6&&o>120?"thin for this size - consider a deeper base":t<1.6?"workable, a deeper base prints flatter":t>=2.4?"rigid":"good"}function ua(e,t=2){if(e.length<2)return e.length;let n=1,o=e[0];for(const r of e.slice(1))Math.hypot(r[0]-o[0],r[1]-o[1],r[2]-o[2])>t&&(n++,o=r);return n}function no(e,t,n){const o=e.length/4,r=Math.max(1,Math.floor(o/8e4)),a=[];for(let h=0;h<o;h+=r)t&&!t[h]||a.push(e[h*4],e[h*4+1],e[h*4+2]);const s=a.length/3;if(!s)return[];const l=new Map;for(let h=0;h<s;h++){const d=a[h*3]>>4<<8|a[h*3+1]>>4<<4|a[h*3+2]>>4;let _=l.get(d);_||l.set(d,_=[0,0,0,0]),_[0]+=a[h*3],_[1]+=a[h*3+1],_[2]+=a[h*3+2],_[3]++}const c=[...l.values()].map(h=>[h[0]/h[3],h[1]/h[3],h[2]/h[3],h[3]]).sort((h,d)=>d[3]-h[3]),i=c.filter(h=>h[3]>=s*.01),u=(h,d)=>{const _=(h[0]+d[0])*.5,y=h[0]-d[0],F=h[1]-d[1],x=h[2]-d[2];return(2+_/256)*y*y+4*F*F+(2+(255-_)/256)*x*x},p=[(i[0]||c[0]).slice(0,3)];for(const h of[i,c])for(;p.length<n;){let d=null,_=-1;for(const y of h){let F=1/0;for(const x of p)F=Math.min(F,u(y,x));F>_&&(_=F,d=y)}if(!d||_<1)break;p.push(d.slice(0,3))}for(let h=0;h<8;h++){const d=p.map(()=>[0,0,0,0]);for(let _=0;_<s;_++){const y=[a[_*3],a[_*3+1],a[_*3+2]];let F=0,x=1/0;p.forEach((P,k)=>{const g=u(y,P);g<x&&(x=g,F=k)}),d[F][0]+=y[0],d[F][1]+=y[1],d[F][2]+=y[2],d[F][3]++}d.forEach((_,y)=>{_[3]&&(p[y]=[_[0]/_[3],_[1]/_[3],_[2]/_[3]])})}const m=h=>.2126*h[0]+.7152*h[1]+.0722*h[2];return p.sort((h,d)=>m(h)-m(d)).map(ot)}function da(e,t,n,o,r="solid",{start:a=null,rounds:s=8}={}){const l=n.length,c=e.length/4,i=Math.max(1,Math.floor(c/24e3)),u=[];for(let y=0;y<c;y+=i)t&&!t[y]||u.push(e[y*4],e[y*4+1],e[y*4+2]);const p=u.length/3,m=(a||n.map(y=>y.hex)).map(bt);if(!p||!l)return m.map(ot);const h=na(n,o,r),d=h.length,_=n.map(y=>(y.band_layers|0)>0);for(let y=0;y<s;y++){const F=h.map(G=>[0,1,2].map(z=>G.reduce((E,w,M)=>E+w*m[M][z],0))),x=new Float64Array(d),P=new Float64Array(d*3);for(let G=0;G<p;G++){const z=u[G*3],E=u[G*3+1],w=u[G*3+2];let M=0,T=1/0;for(let N=0;N<d;N++){const S=F[N][0],A=F[N][1],j=F[N][2],$=(z+S)*.5,U=z-S,R=E-A,D=w-j,X=(2+$/256)*U*U+4*R*R+(2+(255-$)/256)*D*D;X<T&&(T=X,M=N)}x[M]++,P[M*3]+=z,P[M*3+1]+=E,P[M*3+2]+=w}const k=Array.from({length:l},()=>new Float64Array(l)),g=[0,1,2].map(()=>new Float64Array(l));for(let G=0;G<d;G++){if(!x[G])continue;const z=h[G];for(let E=0;E<l;E++)if(z[E]){for(let w=0;w<l;w++)k[E][w]+=x[G]*z[E]*z[w];for(let w=0;w<3;w++)g[w][E]+=z[E]*P[G*3+w]}}const v=p*.001;for(let G=0;G<l;G++){k[G][G]+=v;for(let z=0;z<3;z++)g[z][G]+=v*m[G][z]}for(let G=0;G<3;G++){const z=m.map(E=>E[G]);for(let E=0;E<60;E++)for(let w=0;w<l;w++){if(!_[w])continue;let M=g[G][w];for(let T=0;T<l;T++)T!==w&&(M-=k[w][T]*z[T]);z[w]=Math.min(255,Math.max(0,M/k[w][w]))}m.forEach((E,w)=>{E[G]=z[w]})}}return m.map(ot)}const xn={draft:.33,standard:.2,fine:0},Pt=.2,pa=1.24,fa=3,Mn=6;function xt(e,t,n,o){if(o<=1)return{a:e,w:t,h:n};const r=Math.ceil(t/o),a=Math.ceil(n/o),s=new Uint16Array(r*a);for(let l=0;l<n;l++){const c=Math.floor(l/o)*r;for(let i=0;i<t;i++){const u=c+Math.floor(i/o),p=e[l*t+i];p>s[u]&&(s[u]=p)}}return{a:s,w:r,h:a}}function Mt(e,t,n,o){if(!e||o<=1)return e;const r=Math.ceil(t/o),a=Math.ceil(n/o),s=new Uint32Array(r*a);for(let i=0;i<n;i++){const u=Math.floor(i/o)*r;for(let p=0;p<t;p++)s[u+Math.floor(p/o)]+=e[i*t+p]}const l=new Uint8Array(r*a),c=o*o/2;for(let i=0;i<l.length;i++)l[i]=s[i]>=c?1:0;return l}function oo(e){const t=[];let n=0;for(const o of e){const r=o.band_layers|0;r<=0||(t.push({slot:o.slot,name:o.name||`Slot ${o.slot}`,hex:o.hex,start_h:t.length?n:-1,end_h:n+r}),n+=r)}return t}function*ha(e,t,n,o){let r=new Map;for(let a=0;a<=o;a++){const s=new Map;if(a<o){let l=0;for(;l<n;){const c=a*n+l;if(!e[c]){l++;continue}const i=l,u=t[c];for(l++;l<n&&e[a*n+l]&&Math.abs(t[a*n+l]-u)<1e-6;)l++;const p=Math.round(u*1e6)/1e6;s.set(`${i},${l},${p}`,[i,l,p])}}for(const[l,[c,i,u,p]]of r)s.has(l)||(yield[c,i,p,a,u],r.delete(l));for(const[l,[c,i,u]]of s)r.has(l)||r.set(l,[c,i,u,a])}}function ma(e,t){let n=e*t;return t<Pt&&(n=Pt+Math.max(0,Math.floor(n/t-Pt/t+1e-6))*t),n}function vn({heights:e,w:t,h:n,mask:o,physicalW:r,layerH:a,baseLayers:s,filaments:l,detail:c="standard",name:i="HueLite model"}){const u=ma(s,a),p=r/t,m=xn[c]??xn.standard,h=m?Math.max(1,Math.round(m/p)):1,d=xt(e,t,n,h),_=Mt(o,t,n,h),y=d.h,F=d.w,x=r/t*h,P=F*x,k=y*x,g=-P/2,v=[];for(const z of oo(l)){const E=new Uint8Array(y*F),w=new Float64Array(y*F);let M=!1;const T=Math.max(z.start_h,0);for(let A=0;A<E.length;A++){const j=d.a[A];j>z.start_h&&(!_||_[A])&&(E[A]=1,M=!0),w[A]=u+Math.min(z.end_h,Math.max(T,j))*a}if(!M)continue;const N=z.start_h<0?0:u+z.start_h*a,S=[];for(const[A,j,$,U,R]of ha(E,w,F,y))S.push(g+A*x,(y-U)*x-k/2,N,g+j*x,(y-$)*x-k/2,R);v.push({name:z.name,extruder:z.slot,boxes:Float32Array.from(S)})}const G=v.reduce((z,E)=>z+E.boxes.length/6,0);return{parts:v,name:i,stats:{parts:v.length,triangles:G*12,vertices:G*8}}}const ft=(()=>{const e=[-.5,-.35,.8],t=Math.hypot(...e);return e.map(n=>n/t)})(),_a=.55;function ao(e,t,n,o){const r=new Float32Array(t*n);for(let a=0;a<n;a++)for(let s=0;s<t;s++){const l=a*t+s,c=t<2?0:s===0?(e[l+1]-e[l])/o:s===t-1?(e[l]-e[l-1])/o:(e[l+1]-e[l-1])/(2*o),i=n<2?0:a===0?(e[l+t]-e[l])/o:a===n-1?(e[l]-e[l-t])/o:(e[l+t]-e[l-t])/(2*o),u=Math.sqrt(c*c+i*i+1),p=(-c*ft[0]-i*ft[1]+ft[2])/u;r[l]=1+_a*(Math.min(1,Math.max(0,p))-ft[2])}return r}const Pe=[17,17,16];function ln({heights:e,w:t,h:n,lut:o,mask:r,layerH:a,baseMm:s,cellMm:l,shaded:c=!0}){const i=new ImageData(t,n),u=i.data,p=new Float32Array(t*n);for(let d=0;d<p.length;d++)p[d]=r&&!r[d]?0:s+e[d]*a;const m=c?ao(p,t,n,Math.max(l,1e-6)):null,h=o.length-1;for(let d=0;d<t*n;d++){const _=d*4;if(r&&!r[d]){u[_]=Pe[0],u[_+1]=Pe[1],u[_+2]=Pe[2],u[_+3]=255;continue}const y=o[Math.min(h,e[d])],F=m?m[d]:1;u[_]=y[0]*F,u[_+1]=y[1]*F,u[_+2]=y[2]*F,u[_+3]=255}return i}function ga({heights:e,w:t,h:n,mask:o}){let r=1;for(let s=0;s<e.length;s++)e[s]>r&&(r=e[s]);const a=new ImageData(t,n);for(let s=0;s<t*n;s++){const l=s*4,c=o&&!o[s],i=e[s]/r*255;a.data[l]=c?Pe[0]:i,a.data[l+1]=c?Pe[1]:i,a.data[l+2]=c?Pe[2]:i,a.data[l+3]=255}return a}function ro({heights:e,w:t,h:n,lut:o,mask:r,baseHex:a,layerH:s,baseMm:l,physicalW:c,targetWidth:i=600,elevationDeg:u=30,depthCompress:p=.65,maxCols:m=200,shaded:h=!0}){const d=Math.max(1,Math.round(t/m)),_=xt(e,t,n,d),y=Mt(r,t,n,d),F=_.h,x=_.w,P=bt(a);let k=0;for(let R=0;R<_.a.length;R++)_.a[R]>k&&(!y||y[R])&&(k=_.a[R]);const g=new Float32Array(F*x);for(let R=0;R<g.length;R++)g[R]=y&&!y[R]?0:l+_.a[R]*s;const v=l+k*s,G=c*F/x,z=c/x,E=G/F,w=u*Math.PI/180,M=i/c,T=Math.round(v*Math.sin(w)*Mn*M+F*E*Math.cos(w)*M*p)+24,N=T-12,S=ao(g,x,F,z),A=document.createElement("canvas");A.width=i,A.height=T;const j=A.getContext("2d");j.fillStyle=`rgb(${Pe.join(",")})`,j.fillRect(0,0,i,T);const $=i/x,U=o.length-1;for(let R=0;R<x;R++){const D=Math.round(R*$),X=Math.max(D+1,Math.round((R+1)*$));let b=N;for(let I=F-1;I>=0;I--){const Z=I*x+R;if(y&&!y[Z])continue;const V=g[Z]*Math.sin(w)*Mn*M,O=(F-1-I)*E*Math.cos(w)*M*p,Y=Math.round(N-V-O);if(Y<b){const q=Math.max(0,Y),J=g[Z]<l?P:o[Math.min(U,Math.round(_.a[Z]))],L=h?S[Z]:1;j.fillStyle=`rgb(${Math.min(255,J[0]*L)|0},${Math.min(255,J[1]*L)|0},${Math.min(255,J[2]*L)|0})`,j.fillRect(D,q,X-D,b-q),b=q}}}return A}function ya({heights:e,w:t,h:n,mask:o,filaments:r,layerH:a,baseLayers:s,physicalW:l,pricePerKg:c=25,bandMode:i="solid"}){const u=s*a,p=l/t,m=p*p,h={};for(const M of oo(r)){let T=0;for(let N=0;N<e.length;N++){if(o&&!o[N])continue;const S=e[N];M.start_h<0?T+=m*(u+Math.min(S,M.end_h)*a):S>M.start_h&&(T+=m*(Math.min(S,M.end_h)-M.start_h)*a)}h[M.slot]=(h[M.slot]||0)+T}let d=0,_=0;const y=r.map(M=>{const T=(h[M.slot]||0)/1e3*pa,N=T/1e3*c;return d+=T,_+=N,{slot:M.slot,hex:M.hex,grams:T,cost:N}}),{lut:F,owner:x}=Ve(r,a,i),P=F.length-1;let k=0;for(let M=0;M<e.length;M++)(!o||o[M])&&e[M]>k&&(k=e[M]);let g=0;for(let M=1;M<Math.min(P,k);M++)x[M]!==x[M-1]&&g++;let v=t,G=-1,z=n,E=-1;if(o)for(let M=0;M<n;M++)for(let T=0;T<t;T++)o[M*t+T]&&(T<v&&(v=T),T>G&&(G=T),M<z&&(z=M),M>E&&(E=M));const w=o&&G>=0?[(G-v+1)*p,(E-z+1)*p]:[l,n*p];return{filaments:y,total_grams:d,total_cost:_,switches:g,purge_g:g*fa,max_height_mm:u+k*a,footprint_mm:w,base_hex:r[0]?.hex||"#000000"}}const wa=(()=>{const e=new Uint32Array(256);for(let t=0;t<256;t++){let n=t;for(let o=0;o<8;o++)n=n&1?3988292384^n>>>1:n>>>1;e[t]=n>>>0}return e})();function so(e){let t=4294967295;for(const n of e)for(let o=0;o<n.length;o++)t=wa[(t^n[o])&255]^t>>>8;return(t^4294967295)>>>0}async function ba(e){if(typeof CompressionStream>"u")return null;try{const t=new CompressionStream("deflate-raw"),n=new Response(t.readable).arrayBuffer(),o=t.writable.getWriter();for(const r of e)await o.write(r);return await o.close(),new Uint8Array(await n)}catch{return null}}const xa=256*1024*1024;async function io(e,t,n=xa){const o=new Blob([t]).stream().pipeThrough(new DecompressionStream(e)).getReader(),r=[];let a=0;for(;;){const{done:c,value:i}=await o.read();if(c)break;if(a+=i.length,a>n)throw await o.cancel(),new Error("a file in that zip is far too large");r.push(i)}const s=new Uint8Array(a);let l=0;for(const c of r)s.set(c,l),l+=c.length;return s}async function lo(e,t="application/zip"){const n=new TextEncoder,o=[],r=[];let a=0;for(const{name:c,chunks:i}of e){const u=i.map(P=>typeof P=="string"?n.encode(P):P),p=u.reduce((P,k)=>P+k.length,0),m=so(u),h=await ba(u),d=h?8:0,_=h?h.length:p,y=n.encode(c),F=new DataView(new ArrayBuffer(30));F.setUint32(0,67324752,!0),F.setUint16(4,20,!0),F.setUint16(6,2048,!0),F.setUint16(8,d,!0),F.setUint16(10,0,!0),F.setUint16(12,33,!0),F.setUint32(14,m,!0),F.setUint32(18,_,!0),F.setUint32(22,p,!0),F.setUint16(26,y.length,!0),F.setUint16(28,0,!0),o.push(new Uint8Array(F.buffer),y,...h?[h]:u);const x=new DataView(new ArrayBuffer(46));x.setUint32(0,33639248,!0),x.setUint16(4,20,!0),x.setUint16(6,20,!0),x.setUint16(8,2048,!0),x.setUint16(10,d,!0),x.setUint16(12,0,!0),x.setUint16(14,33,!0),x.setUint32(16,m,!0),x.setUint32(20,_,!0),x.setUint32(24,p,!0),x.setUint16(28,y.length,!0),x.setUint32(42,a,!0),r.push(new Uint8Array(x.buffer),y),a+=30+y.length+_}const s=r.reduce((c,i)=>c+i.length,0),l=new DataView(new ArrayBuffer(22));return l.setUint32(0,101010256,!0),l.setUint16(8,e.length,!0),l.setUint16(10,e.length,!0),l.setUint32(12,s,!0),l.setUint32(16,a,!0),new Blob([...o,...r,new Uint8Array(l.buffer)],{type:t})}function Ma(e){e=e instanceof Uint8Array?e:new Uint8Array(e);const t=new DataView(e.buffer,e.byteOffset,e.byteLength);let n=-1;for(let l=e.length-22;l>=Math.max(0,e.length-65557);l--)if(t.getUint32(l,!0)===101010256){n=l;break}if(n<0)throw new Error("not a zip file");const o=t.getUint16(n+10,!0);let r=t.getUint32(n+16,!0);if(r>e.length)throw new Error("damaged zip directory");const a=new TextDecoder,s=new Map;for(let l=0;l<o;l++){if(t.getUint32(r,!0)!==33639248)throw new Error("damaged zip directory");const c=t.getUint16(r+10,!0),i=t.getUint32(r+20,!0),u=t.getUint16(r+28,!0),p=t.getUint16(r+30,!0),m=t.getUint16(r+32,!0),h=t.getUint32(r+42,!0),d=a.decode(e.subarray(r+46,r+46+u));r+=46+u+p+m,!d.endsWith("/")&&s.set(d,async()=>{const _=h+30+t.getUint16(h+26,!0)+t.getUint16(h+28,!0);if(_+i>e.length)throw new Error("damaged zip (entry runs past the end)");const y=e.subarray(_,_+i);if(c===0)return y.slice();if(c!==8)throw new Error(`unsupported zip compression (${c})`);return io("deflate-raw",y)})}return s}const co="02.08.02.61",va={accel_to_decel_enable:"0",accel_to_decel_factor:"50%",alternate_extra_wall:"0",ams_filament_load_time_ams:"0",ams_filament_load_time_ams_lite:"0",ams_filament_load_time_n3f_s:"0",ams_filament_unload_time_ams:"0",ams_filament_unload_time_ams_lite:"0",ams_filament_unload_time_n3f_s:"0",apply_scarf_seam_on_circles:"1",auxiliary_fan:"0",avoid_crossing_wall_includes_support:"0",bed_custom_model:"",bed_custom_texture:"",bed_exclude_area:[],bed_heat_soak_area:[],bed_temperature_formula:"by_first_filament",before_layer_change_gcode:"",best_object_pos:"0.5,0.5",bottom_color_penetration_layers:"3",bottom_shell_layers:"3",bottom_shell_thickness:"0",bottom_surface_density:"100%",bottom_surface_pattern:"monotonic",bridge_angle:"0",bridge_flow:"1",bridge_no_support:"0",bridge_speed:["50"],brim_object_gap:"0.1",brim_type:"auto_brim",brim_width:"5",change_filament_gcode:`;===== A1 20251031 =======================
M1007 S0 ; turn off mass estimation
G392 S0
M620 S[next_extruder]A
M204 S9000
G1 Z{max_layer_z + 3.0} F1200

M400
M106 P1 S0
M106 P2 S0
{if old_filament_temp > 142 && next_extruder < 255}
M104 S[old_filament_temp]
{endif}

G1 X267 F18000

{if long_retractions_when_cut[previous_extruder]}
M620.11 S1 I[previous_extruder] E-{retraction_distances_when_cut[previous_extruder]} F1200
{else}
M620.11 S0
{endif}
M400

M620.1 E F{flush_volumetric_speeds[previous_extruder]/2.4053*60} T{flush_temperatures[previous_extruder]}
M620.10 A0 F{flush_volumetric_speeds[previous_extruder]/2.4053*60}
T[next_extruder]
M620.1 E F{flush_volumetric_speeds[next_extruder]/2.4053*60} T{flush_temperatures[next_extruder]}
M620.10 A1 F{flush_volumetric_speeds[next_extruder]/2.4053*60} L[flush_length] H[nozzle_diameter] T{flush_temperatures[next_extruder]}

G1 Y128 F9000

{if next_extruder < 255}

{if long_retractions_when_cut[previous_extruder]}
M620.11 S1 I[previous_extruder] E{retraction_distances_when_cut[previous_extruder]} F{flush_volumetric_speeds[previous_extruder]/2.4053*60}
M628 S1
G92 E0
G1 E{retraction_distances_when_cut[previous_extruder]} F{flush_volumetric_speeds[previous_extruder]/2.4053*60}
M400
M629 S1
{else}
M620.11 S0
{endif}

M400
G92 E0
M628 S0

{if flush_length_1 > 1}
; FLUSH_START
; always use highest temperature to flush
M400
M1002 set_filament_type:UNKNOWN
M109 S[flush_temperatures[next_extruder]]
M106 P1 S60
{if flush_length_1 > 23.7}
G1 E23.7 F{flush_volumetric_speeds[previous_extruder]/2.4053*60} ; do not need pulsatile flushing for start part
G1 E{(flush_length_1 - 23.7) * 0.02} F50
G1 E{(flush_length_1 - 23.7) * 0.23} F{flush_volumetric_speeds[previous_extruder]/2.4053*60}
G1 E{(flush_length_1 - 23.7) * 0.02} F50
G1 E{(flush_length_1 - 23.7) * 0.23} F{flush_volumetric_speeds[next_extruder]/2.4053*60}
G1 E{(flush_length_1 - 23.7) * 0.02} F50
G1 E{(flush_length_1 - 23.7) * 0.23} F{flush_volumetric_speeds[next_extruder]/2.4053*60}
G1 E{(flush_length_1 - 23.7) * 0.02} F50
G1 E{(flush_length_1 - 23.7) * 0.23} F{flush_volumetric_speeds[next_extruder]/2.4053*60}
{else}
G1 E{flush_length_1} F{flush_volumetric_speeds[previous_extruder]/2.4053*60}
{endif}
; FLUSH_END
G1 E-[old_retract_length_toolchange] F1800
G1 E[old_retract_length_toolchange] F300
M400
M1002 set_filament_type:{filament_type[next_extruder]}
{endif}

{if flush_length_1 > 45 && flush_length_2 > 1}
; WIPE
M400
M106 P1 S178
M400 S3
G1 X-38.2 F18000
G1 X-48.2 F3000
G1 X-38.2 F18000
G1 X-48.2 F3000
G1 X-38.2 F18000
G1 X-48.2 F3000
M400
M106 P1 S0
{endif}

{if flush_length_2 > 1}
M106 P1 S60
; FLUSH_START
G1 E{flush_length_2 * 0.18} F{flush_volumetric_speeds[next_extruder]/2.4053*60}
G1 E{flush_length_2 * 0.02} F50
G1 E{flush_length_2 * 0.18} F{flush_volumetric_speeds[next_extruder]/2.4053*60}
G1 E{flush_length_2 * 0.02} F50
G1 E{flush_length_2 * 0.18} F{flush_volumetric_speeds[next_extruder]/2.4053*60}
G1 E{flush_length_2 * 0.02} F50
G1 E{flush_length_2 * 0.18} F{flush_volumetric_speeds[next_extruder]/2.4053*60}
G1 E{flush_length_2 * 0.02} F50
G1 E{flush_length_2 * 0.18} F{flush_volumetric_speeds[next_extruder]/2.4053*60}
G1 E{flush_length_2 * 0.02} F50
; FLUSH_END
G1 E-[new_retract_length_toolchange] F1800
G1 E[new_retract_length_toolchange] F300
{endif}

{if flush_length_2 > 45 && flush_length_3 > 1}
; WIPE
M400
M106 P1 S178
M400 S3
G1 X-38.2 F18000
G1 X-48.2 F3000
G1 X-38.2 F18000
G1 X-48.2 F3000
G1 X-38.2 F18000
G1 X-48.2 F3000
M400
M106 P1 S0
{endif}

{if flush_length_3 > 1}
M106 P1 S60
; FLUSH_START
G1 E{flush_length_3 * 0.18} F{flush_volumetric_speeds[next_extruder]/2.4053*60}
G1 E{flush_length_3 * 0.02} F50
G1 E{flush_length_3 * 0.18} F{flush_volumetric_speeds[next_extruder]/2.4053*60}
G1 E{flush_length_3 * 0.02} F50
G1 E{flush_length_3 * 0.18} F{flush_volumetric_speeds[next_extruder]/2.4053*60}
G1 E{flush_length_3 * 0.02} F50
G1 E{flush_length_3 * 0.18} F{flush_volumetric_speeds[next_extruder]/2.4053*60}
G1 E{flush_length_3 * 0.02} F50
G1 E{flush_length_3 * 0.18} F{flush_volumetric_speeds[next_extruder]/2.4053*60}
G1 E{flush_length_3 * 0.02} F50
; FLUSH_END
G1 E-[new_retract_length_toolchange] F1800
G1 E[new_retract_length_toolchange] F300
{endif}

{if flush_length_3 > 45 && flush_length_4 > 1}
; WIPE
M400
M106 P1 S178
M400 S3
G1 X-38.2 F18000
G1 X-48.2 F3000
G1 X-38.2 F18000
G1 X-48.2 F3000
G1 X-38.2 F18000
G1 X-48.2 F3000
M400
M106 P1 S0
{endif}

{if flush_length_4 > 1}
M106 P1 S60
; FLUSH_START
G1 E{flush_length_4 * 0.18} F{flush_volumetric_speeds[next_extruder]/2.4053*60}
G1 E{flush_length_4 * 0.02} F50
G1 E{flush_length_4 * 0.18} F{flush_volumetric_speeds[next_extruder]/2.4053*60}
G1 E{flush_length_4 * 0.02} F50
G1 E{flush_length_4 * 0.18} F{flush_volumetric_speeds[next_extruder]/2.4053*60}
G1 E{flush_length_4 * 0.02} F50
G1 E{flush_length_4 * 0.18} F{flush_volumetric_speeds[next_extruder]/2.4053*60}
G1 E{flush_length_4 * 0.02} F50
G1 E{flush_length_4 * 0.18} F{flush_volumetric_speeds[next_extruder]/2.4053*60}
G1 E{flush_length_4 * 0.02} F50
; FLUSH_END
{endif}

M629

M400
M106 P1 S60
M109 S[new_filament_temp]
G1 E6 F{flush_volumetric_speeds[next_extruder]/2.4053*60} ;Compensate for filament spillage during waiting temperature
M400
G92 E0
G1 E-[new_retract_length_toolchange] F1800
M400
M106 P1 S178
M400 S3
G1 X-38.2 F18000
G1 X-48.2 F3000
G1 X-38.2 F18000
G1 X-48.2 F3000
G1 X-38.2 F18000
G1 X-48.2 F3000
G1 X-38.2 F18000
G1 X-48.2 F3000
M400
G1 Z{max_layer_z + 3.0} F3000
M106 P1 S0
{if layer_z <= (initial_layer_print_height + 0.001)}
M204 S[initial_layer_acceleration]
{else}
M204 S[default_acceleration]
{endif}
{else}
G1 X[x_after_toolchange] Y[y_after_toolchange] Z[z_after_toolchange] F12000
{endif}

M622.1 S0
M9833 F{outer_wall_volumetric_speed/2.4} A0.3 ; cali dynamic extrusion compensation
M1002 judge_flag filament_need_cali_flag
M622 J1
  G92 E0
  G1 E-[new_retract_length_toolchange] F1800
  M400
  
  M106 P1 S178
  M400 S4
  G1 X-38.2 F18000
  G1 X-48.2 F3000
  G1 X-38.2 F18000 ;wipe and shake
  G1 X-48.2 F3000
  G1 X-38.2 F12000 ;wipe and shake
  G1 X-48.2 F3000
  M400
  M106 P1 S0 
M623

M621 S[next_extruder]A
G392 S0

M1007 S1
`,circle_compensation_manual_offset:"0",cooling_filter_enabled:"0",counterbore_hole_bridging:"none",curr_bed_type:"Textured PEI Plate",default_acceleration:["6000"],default_ams_type:"-1",default_filament_profile:["Bambu PLA Basic @BBL A1"],default_jerk:"0",default_nozzle_volume_type:["Standard"],default_print_profile:"0.20mm Standard @BBL A1",deretraction_speed:["30"],detect_floating_vertical_shell:"1",detect_narrow_internal_solid_infill:"1",detect_overhang_wall:"1",detect_thin_wall:"0",draft_shield:"disabled",elefant_foot_compensation:"0.075",embedding_wall_into_infill:"0",enable_arc_fitting:"1",enable_circle_compensation:"0",enable_filament_dynamic_map:"0",enable_height_slowdown:["0"],enable_long_retraction_when_cut:"2",enable_mixed_color_sublayer:"0",enable_order_independent_overlap_carving:"0",enable_overhang_speed:["1"],enable_pre_heating:"0",enable_support:"0",enable_support_ironing:"0",enable_tower_interface_features:"0",enable_wrapping_detection:"0",enforce_support_layers:"0",ensure_vertical_shell_thickness:"enabled",exclude_object:"1",extruder_ams_count:["1#0|4#0","1#0|4#0"],extruder_clearance_dist_to_rod:"56.5",extruder_clearance_height_to_lid:"256",extruder_clearance_height_to_rod:"25",extruder_clearance_max_radius:"73",extruder_colour:["#018001"],extruder_max_nozzle_count:["1"],extruder_nozzle_stats:["Standard#1"],extruder_nozzle_stats_new:["Standard#1"],extruder_offset:["0x0"],extruder_printable_area:[],extruder_printable_height:[],extruder_type:["Direct Drive"],extruder_variant_list:["Direct Drive Standard"],fan_direction:"undefine",farthest_point_timelapse:"0",filament_is_mixed:["0","0","0"],filament_map_mode:"Auto For Flush",filament_mixed_components:["","",""],filament_mixed_gradient:["0","0","0"],filament_mixed_gradient_curve:["","",""],filament_mixed_gradient_per_part:["0","0","0"],filament_mixed_gradient_range:["","",""],filament_mixed_sublayer_ratios:["","",""],filament_notes:"",filename_format:"{input_filename_base}_{filament_type[0]}_{print_time}.gcode",fill_multiline:"1",filter_out_gap_fill:"0",first_layer_print_sequence:["0"],flush_into_infill:"0",flush_into_objects:"0",flush_into_support:"1",flush_multiplier:["1"],flush_multiplier_fast:["1.2"],fuzzy_skin:"none",fuzzy_skin_first_layer:"0",fuzzy_skin_mode:"displacement",fuzzy_skin_noise_type:"classic",fuzzy_skin_octaves:"4",fuzzy_skin_persistence:"0.5",fuzzy_skin_point_distance:"0.8",fuzzy_skin_scale:"1",fuzzy_skin_thickness:"0.3",gap_infill_speed:["250"],gcode_add_line_number:"0",gcode_flavor:"marlin",grab_length:["17.4"],group_algo_with_time:"0",has_filament_switcher:"0",has_scarf_joint_seam:"0",head_wrap_detect_zone:["226x224","256x224","256x256","226x256"],host_type:"octoprint",hotend_cooling_rate:["2"],hotend_heating_rate:["2"],independent_support_layer_height:"1",infill_combination:"0",infill_direction:"45",infill_instead_top_bottom_surfaces:"0",infill_jerk:"9",infill_lock_depth:"1",infill_rotate_step:"0",infill_shift_step:"0.4",infill_wall_overlap:"15%",initial_layer_acceleration:["500"],initial_layer_flow_ratio:"1",initial_layer_infill_speed:["105"],initial_layer_jerk:"9",initial_layer_line_width:"0.5",initial_layer_speed:["50"],initial_layer_travel_acceleration:["6000"],inner_wall_acceleration:["0"],inner_wall_jerk:"9",inner_wall_line_width:"0.45",inner_wall_speed:["300"],interface_shells:"0",interlocking_beam:"0",interlocking_beam_layer_count:"2",interlocking_beam_width:"0.8",interlocking_boundary_avoidance:"2",interlocking_depth:"2",interlocking_orientation:"22.5",internal_bridge_support_thickness:"0.8",internal_solid_infill_line_width:"0.42",internal_solid_infill_pattern:"zig-zag",internal_solid_infill_speed:["250"],ironing_direction:"45",ironing_flow:"10%",ironing_inset:"0.21",ironing_pattern:"zig-zag",ironing_spacing:"0.15",ironing_speed:"30",ironing_type:"no ironing",is_infill_first:"0",layer_change_gcode:`; layer num/total_layer_count: {layer_num+1}/[total_layer_count]
; update layer progress
M73 L{layer_num+1}
M991 S0 P{layer_num} ;notify layer change`,line_width:"0.42",locked_skeleton_infill_pattern:"zigzag",locked_skin_infill_pattern:"crosszag",long_retractions_when_cut:["0"],machine_bed_mass_Y:"0",machine_end_gcode:`;===== date: 20260513 =====================
G392 S0 ;turn off nozzle clog detect

M400 ; wait for buffer to clear
G92 E0 ; zero the extruder
G90
G1 Z{max_layer_z + 0.4} F900 ; lower z a little
G1 X0 Y{first_layer_center_no_wipe_tower[1]} F18000 ; move to safe pos
G1 X-13.0 F3000 ; move to safe pos
{if !spiral_mode && print_sequence != "by object"}
M1002 judge_flag timelapse_record_flag
M622 J1
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M400 P100
M971 S11 C11 O0
M991 S0 P-1 ;end timelapse at safe pos
M623
{endif}

M140 S0 ; turn off bed
M106 S0 ; turn off fan
M106 P2 S0 ; turn off remote part cooling fan
M106 P3 S0 ; turn off chamber cooling fan

;G1 X27 F15000 ; wipe

; pull back filament to AMS
M620 S255
G1 X267 F15000
T255
G1 X-28.5 F18000
G1 X-48.2 F3000
G1 X-28.5 F18000
G1 X-48.2 F3000
M621 S255

M104 S0 ; turn off hotend

M400 ; wait all motion done
M17 S
M17 Z0.4 ; lower z motor current to reduce impact if there is something in the bottom
{if (max_layer_z + 100.0) < 256}
    G1 Z{max_layer_z + 100.0} F600
    G1 Z{max_layer_z +98.0}
{else}
    G1 Z256 F600
    G1 Z256
{endif}
M400 P100
M17 R ; restore z current

G90
G1 X-48 Y180 F3600

M220 S100  ; Reset feedrate magnitude
M201.2 K1.0 ; Reset acc magnitude
M73.2   R1.0 ;Reset left time magnitude
M1002 set_gcode_claim_speed_level : 0

;=====printer finish  sound=========
M17
M400 S1
M1006 S1
M1006 A0 B20 L100 C37 D20 M40 E42 F20 N60
M1006 A0 B10 L100 C44 D10 M60 E44 F10 N60
M1006 A0 B10 L100 C46 D10 M80 E46 F10 N80
M1006 A44 B20 L100 C39 D20 M60 E48 F20 N60
M1006 A0 B10 L100 C44 D10 M60 E44 F10 N60
M1006 A0 B10 L100 C0 D10 M60 E0 F10 N60
M1006 A0 B10 L100 C39 D10 M60 E39 F10 N60
M1006 A0 B10 L100 C0 D10 M60 E0 F10 N60
M1006 A0 B10 L100 C44 D10 M60 E44 F10 N60
M1006 A0 B10 L100 C0 D10 M60 E0 F10 N60
M1006 A0 B10 L100 C39 D10 M60 E39 F10 N60
M1006 A0 B10 L100 C0 D10 M60 E0 F10 N60
M1006 A0 B10 L100 C48 D10 M60 E44 F10 N80
M1006 A0 B10 L100 C0 D10 M60 E0 F10  N80
M1006 A44 B20 L100 C49 D20 M80 E41 F20 N80
M1006 A0 B20 L100 C0 D20 M60 E0 F20 N80
M1006 A0 B20 L100 C37 D20 M30 E37 F20 N60
M1006 W
;=====printer finish  sound=========

;M17 X0.8 Y0.8 Z0.5 ; lower motor current to 45% power
M400
M18 X Y Z

`,machine_hotend_change_time:"0",machine_load_filament_time:"25",machine_max_acceleration_e:["5000","5000"],machine_max_acceleration_extruding:["12000","12000"],machine_max_acceleration_retracting:["5000","5000"],machine_max_acceleration_travel:["9000","9000"],machine_max_acceleration_x:["12000","12000"],machine_max_acceleration_y:["12000","12000"],machine_max_acceleration_z:["1500","1500"],machine_max_force_Y:"0",machine_max_jerk_e:["3","3"],machine_max_jerk_x:["9","9"],machine_max_jerk_y:["9","9"],machine_max_jerk_z:["3","3"],machine_max_printed_mass:"0",machine_max_speed_e:["30","30"],machine_max_speed_x:["500","200"],machine_max_speed_y:["500","200"],machine_max_speed_z:["30","30"],machine_min_extruding_rate:["0","0"],machine_min_travel_rate:["0","0"],machine_pause_gcode:"M400 U1",machine_prepare_compensation_time:"260",machine_start_gcode:`;===== machine: A1 =========================
;===== date: 20260513 ==================
G392 S0
M9833.2
;M400
;M73 P1.717

;===== start to heat heatbead&hotend==========
M1002 gcode_claim_action : 2
M1002 set_filament_type:{filament_type[initial_no_support_extruder]}
M104 S140
M140 S[bed_temperature_initial_layer_single]

;=====start printer sound ===================
M17
M400 S1
M1006 S1
M1006 A0 B10 L100 C37 D10 M60 E37 F10 N60
M1006 A0 B10 L100 C41 D10 M60 E41 F10 N60
M1006 A0 B10 L100 C44 D10 M60 E44 F10 N60
M1006 A0 B10 L100 C0 D10 M60 E0 F10 N60
M1006 A43 B10 L100 C46 D10 M70 E39 F10 N80
M1006 A0 B10 L100 C0 D10 M60 E0 F10 N80
M1006 A0 B10 L100 C43 D10 M60 E39 F10 N80
M1006 A0 B10 L100 C0 D10 M60 E0 F10 N80
M1006 A0 B10 L100 C41 D10 M80 E41 F10 N80
M1006 A0 B10 L100 C44 D10 M80 E44 F10 N80
M1006 A0 B10 L100 C49 D10 M80 E49 F10 N80
M1006 A0 B10 L100 C0 D10 M80 E0 F10 N80
M1006 A44 B10 L100 C48 D10 M60 E39 F10 N80
M1006 A0 B10 L100 C0 D10 M60 E0 F10 N80
M1006 A0 B10 L100 C44 D10 M80 E39 F10 N80
M1006 A0 B10 L100 C0 D10 M60 E0 F10 N80
M1006 A43 B10 L100 C46 D10 M60 E39 F10 N80
M1006 W
M18 
;=====start printer sound ===================

;=====avoid end stop =================
G91
G380 S2 Z40 F1200
G380 S3 Z-15 F1200
G90

;===== reset machine status =================
;M290 X39 Y39 Z8
M204 S6000

M630 S0 P0
G91
M17 Z0.3 ; lower the z-motor current

G90
M17 X0.65 Y1.2 Z0.6 ; reset motor current to default
M960 S5 P1 ; turn on logo lamp
G90
M220 S100 ;Reset Feedrate
M221 S100 ;Reset Flowrate
M73.2   R1.0 ;Reset left time magnitude
;M211 X0 Y0 Z0 ; turn off soft endstop to prevent protential logic problem

;====== cog noise reduction=================
M982.2 S1 ; turn on cog noise reduction

M1002 gcode_claim_action : 13

G28 X
G91
G1 Z5 F1200
G90
G0 X128 F30000
G0 Y254 F3000
G91
G1 Z-5 F1200

M109 S25 H140

M17 E0.3
M83
G1 E10 F1200
G1 E-0.5 F30
M17 D

G28 Z P0 T140; home z with low precision,permit 300deg temperature
M104 S{nozzle_temperature_initial_layer[initial_extruder]}

M1002 judge_flag build_plate_detect_flag
M622 S1
  G39.4
  G90
  G1 Z5 F1200
M623

;M400
;M73 P1.717

;===== prepare print temperature and material ==========
M1002 gcode_claim_action : 24

M400
;G392 S1
M211 X0 Y0 Z0 ;turn off soft endstop
M975 S1 ; turn on

G90
G1 X-28.5 F30000
G1 X-48.2 F3000

M620 M ;enable remap
M620 S[initial_no_support_extruder]A   ; switch material if AMS exist
    M1002 gcode_claim_action : 4
    M400
    M1002 set_filament_type:UNKNOWN
    M109 S[nozzle_temperature_initial_layer]
{if (filament_type[initial_no_support_extruder] == "PLA") && (nozzle_diameter != 0.2)}
    M104 S220
{else}
    M104 S250
{endif}
    M400
    T[initial_no_support_extruder]
    G1 X-48.2 F3000
    M400

{if (filament_type[initial_no_support_extruder] == "PLA") && (nozzle_diameter != 0.2)}
    M620.1 E F{flush_volumetric_speeds[initial_no_support_extruder]/2.4053*60} T220
    M109 S220 ;set nozzle to common flush temp
{else}
    M620.1 E F{flush_volumetric_speeds[initial_no_support_extruder]/2.4053*60} T{flush_temperatures[initial_no_support_extruder]}
    M109 S250 ;set nozzle to common flush temp
{endif}
    M106 P1 S0
    G92 E0
    G1 E50 F200
    M400
    M1002 set_filament_type:{filament_type[initial_no_support_extruder]}
M621 S[initial_no_support_extruder]A

{if (filament_type[initial_no_support_extruder] == "PLA") && (nozzle_diameter != 0.2)}
    M109 S220 H300
{else}
    M109 S{flush_temperatures[initial_no_support_extruder]} H300
{endif}
G92 E0
G1 E50 F200 ; lower extrusion speed to avoid clog
M400
M106 P1 S178
G92 E0
G1 E5 F200
M104 S{nozzle_temperature_initial_layer[initial_no_support_extruder]}
G92 E0
G1 E-0.5 F300

G1 X-28.5 F30000
G1 X-48.2 F3000
G1 X-28.5 F30000 ;wipe and shake
G1 X-48.2 F3000
G1 X-28.5 F30000 ;wipe and shake
G1 X-48.2 F3000

;G392 S0

M400
M106 P1 S0
;===== prepare print temperature and material end =====

;M400
;M73 P1.717

;===== auto extrude cali start =========================
M975 S1
;G392 S1

G90
M83
T1000
G1 X-48.2 Y0 Z10 F10000
M400
M1002 set_filament_type:UNKNOWN

M412 S1 ;  ===turn on  filament runout detection===
M400 P10
M620.3 W1; === turn on filament tangle detection===
M400 S2

M1002 set_filament_type:{filament_type[initial_no_support_extruder]}

;M1002 set_flag extrude_cali_flag=1
M1002 judge_flag extrude_cali_flag

M622 J1
    M1002 gcode_claim_action : 8

    M109 S{nozzle_temperature[initial_extruder]}
    G1 E10 F{outer_wall_volumetric_speed/2.4*60}
    M983 F{outer_wall_volumetric_speed/2.4} A0.3 H[nozzle_diameter]; cali dynamic extrusion compensation

    M106 P1 S255
    M400 S5
    G1 X-28.5 F18000
    G1 X-48.2 F3000
    G1 X-28.5 F18000 ;wipe and shake
    G1 X-48.2 F3000
    G1 X-28.5 F12000 ;wipe and shake
    G1 X-48.2 F3000
    M400
    M106 P1 S0

    M1002 judge_last_extrude_cali_success
    M622 J0
        M983 F{outer_wall_volumetric_speed/2.4} A0.3 H[nozzle_diameter]; cali dynamic extrusion compensation
        M106 P1 S255
        M400 S5
        G1 X-28.5 F18000
        G1 X-48.2 F3000
        G1 X-28.5 F18000 ;wipe and shake
        G1 X-48.2 F3000
        G1 X-28.5 F12000 ;wipe and shake
        M400
        M106 P1 S0
    M623
    
    G1 X-48.2 F3000
    M400
    M984 A0.1 E1 S1 F{outer_wall_volumetric_speed/2.4} H[nozzle_diameter]
    M106 P1 S178
    M400 S7
    G1 X-28.5 F18000
    G1 X-48.2 F3000
    G1 X-28.5 F18000 ;wipe and shake
    G1 X-48.2 F3000
    G1 X-28.5 F12000 ;wipe and shake
    G1 X-48.2 F3000
    M400
    M106 P1 S0
M623 ; end of "draw extrinsic para cali paint"

;G392 S0
;===== auto extrude cali end ========================

;M400
;M73 P1.717

M104 S170 ; prepare to wipe nozzle
M106 S255 ; turn on fan

;===== mech mode fast check start =====================
M1002 gcode_claim_action : 3

G1 X128 Y128 F20000
G1 Z5 F1200
M400 P200
M970.3 Q1 A5 K0 O3
M974 Q1 S2 P0

M970.2 Q1 K1 W58 Z0.1
M974 S2

G1 X128 Y128 F20000
G1 Z5 F1200
M400 P200
M970.3 Q0 A10 K0 O1
M974 Q0 S2 P0

M970.2 Q0 K1 W78 Z0.1
M974 S2

M975 S1
G1 F30000
G1 X0 Y5
G28 X ; re-home XY

G1 Z4 F1200

;===== mech mode fast check end =======================

;M400
;M73 P1.717

;===== wipe nozzle ===============================
M1002 gcode_claim_action : 14

M975 S1
M106 S255 ; turn on fan (G28 has turn off fan)
M211 S; push soft endstop status
M211 X0 Y0 Z0 ;turn off Z axis endstop

;===== remove waste by touching start =====

M104 S170 ; set temp down to heatbed acceptable

M83
G1 E-1 F500
G90
M83

M109 S170
G0 X108 Y-0.5 F30000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X110 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X112 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X114 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X116 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X118 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X120 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X122 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X124 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X126 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X128 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X130 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X132 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X134 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X136 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X138 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X140 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X142 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X144 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X146 F10000
G380 S3 Z-5 F1200
G1 Z2 F1200
G1 X148 F10000
G380 S3 Z-5 F1200

G1 Z5 F30000
;===== remove waste by touching end =====

G1 Z10 F1200
G0 X118 Y261 F30000
G1 Z5 F1200
M109 S{nozzle_temperature_initial_layer[initial_extruder]-50}

G28 Z P0 T300; home z with low precision,permit 300deg temperature
G29.2 S0 ; turn off ABL
M104 S140 ; prepare to abl
G0 Z5 F20000

G0 X128 Y261 F20000  ; move to exposed steel surface
G0 Z-1.01 F1200      ; stop the nozzle

G91
G2 I1 J0 X2 Y0 F2000.1
G2 I-0.75 J0 X-1.5
G2 I1 J0 X2
G2 I-0.75 J0 X-1.5
G2 I1 J0 X2
G2 I-0.75 J0 X-1.5
G2 I1 J0 X2
G2 I-0.75 J0 X-1.5
G2 I1 J0 X2
G2 I-0.75 J0 X-1.5
G2 I1 J0 X2
G2 I-0.75 J0 X-1.5
G2 I1 J0 X2
G2 I-0.75 J0 X-1.5
G2 I1 J0 X2
G2 I-0.75 J0 X-1.5
G2 I1 J0 X2
G2 I-0.75 J0 X-1.5
G2 I1 J0 X2
G2 I-0.75 J0 X-1.5

G90
G1 Z10 F1200

;===== brush material wipe nozzle =====

G90
G1 Y250 F30000
G1 X55
G1 Z1.300 F1200
G1 Y262.5 F6000
G91
G1 X-35 F30000
G1 Y-0.5
G1 X45
G1 Y-0.5
G1 X-45
G1 Y-0.5
G1 X45
G1 Y-0.5
G1 X-45
G1 Y-0.5
G1 X45
G1 Z5.000 F1200

G90
G1 X30 Y250.000 F30000
G1 Z1.300 F1200
G1 Y262.5 F6000
G91
G1 X35 F30000
G1 Y-0.5
G1 X-45
G1 Y-0.5
G1 X45
G1 Y-0.5
G1 X-45
G1 Y-0.5
G1 X45
G1 Y-0.5
G1 X-45
G1 Z10.000 F1200

;===== brush material wipe nozzle end =====

G90
;G0 X128 Y261 F20000  ; move to exposed steel surface
G1 Y250 F30000
G1 X138
G1 Y261
G0 Z-1.01 F1200      ; stop the nozzle

G91
G2 I1 J0 X2 Y0 F2000.1
G2 I-0.75 J0 X-1.5
G2 I1 J0 X2
G2 I-0.75 J0 X-1.5
G2 I1 J0 X2
G2 I-0.75 J0 X-1.5
G2 I1 J0 X2
G2 I-0.75 J0 X-1.5
G2 I1 J0 X2
G2 I-0.75 J0 X-1.5
G2 I1 J0 X2
G2 I-0.75 J0 X-1.5
G2 I1 J0 X2
G2 I-0.75 J0 X-1.5
G2 I1 J0 X2
G2 I-0.75 J0 X-1.5
G2 I1 J0 X2
G2 I-0.75 J0 X-1.5
G2 I1 J0 X2
G2 I-0.75 J0 X-1.5

M109 S140
M106 S255 ; turn on fan (G28 has turn off fan)

M211 R; pop softend status

;===== wipe nozzle end ================================

;M400
;M73 P1.717

;===== bed leveling ==================================
M1002 judge_flag g29_before_print_flag

G90
G1 Z5 F1200
G1 X0 Y0 F30000
G29.2 S1 ; turn on ABL

M190 S[bed_temperature_initial_layer_single]; ensure bed temp
M109 S140
M106 S0 ; turn off fan , too noisy

M622 J1
    M1002 gcode_claim_action : 1
    G29 A1 X{first_layer_print_min[0]} Y{first_layer_print_min[1]} I{first_layer_print_size[0]} J{first_layer_print_size[1]}
    M400
    M500 ; save cali data
M623
;===== bed leveling end ================================

;===== home after wipe mouth============================
M1002 judge_flag g29_before_print_flag
M622 J0

    M1002 gcode_claim_action : 13
    G28

M623

;===== home after wipe mouth end =======================

;M400
;M73 P1.717

G1 X108.000 Y-0.500 F30000
G1 Z0.300 F1200
M400
G2814 Z0.32

M104 S{nozzle_temperature_initial_layer[initial_extruder]} ; prepare to print

;===== nozzle load line ===============================
;G90
;M83
;G1 Z5 F1200
;G1 X88 Y-0.5 F20000
;G1 Z0.3 F1200

;M109 S{nozzle_temperature_initial_layer[initial_extruder]}

;G1 E2 F300
;G1 X168 E4.989 F6000
;G1 Z1 F1200
;===== nozzle load line end ===========================

;===== extrude cali test ===============================

M400
    M900 S
    M900 C
    G90
    M83

    M109 S{nozzle_temperature_initial_layer[initial_extruder]}
    G0 X128 E8  F{outer_wall_volumetric_speed/(24/20)    * 60}
    G0 X133 E.3742  F{outer_wall_volumetric_speed/(0.3*0.5)/4     * 60}
    G0 X138 E.3742  F{outer_wall_volumetric_speed/(0.3*0.5)     * 60}
    G0 X143 E.3742  F{outer_wall_volumetric_speed/(0.3*0.5)/4     * 60}
    G0 X148 E.3742  F{outer_wall_volumetric_speed/(0.3*0.5)     * 60}
    G0 X153 E.3742  F{outer_wall_volumetric_speed/(0.3*0.5)/4     * 60}
    G91
    G1 X1 Z-0.300
    G1 X4
    G1 Z1 F1200
    G90
    M400

M900 R

M1002 judge_flag extrude_cali_flag
M622 J1
    G90
    G1 X108.000 Y1.000 F30000
    G91
    G1 Z-0.700 F1200
    G90
    M83
    G0 X128 E10  F{outer_wall_volumetric_speed/(24/20)    * 60}
    G0 X133 E.3742  F{outer_wall_volumetric_speed/(0.3*0.5)/4     * 60}
    G0 X138 E.3742  F{outer_wall_volumetric_speed/(0.3*0.5)     * 60}
    G0 X143 E.3742  F{outer_wall_volumetric_speed/(0.3*0.5)/4     * 60}
    G0 X148 E.3742  F{outer_wall_volumetric_speed/(0.3*0.5)     * 60}
    G0 X153 E.3742  F{outer_wall_volumetric_speed/(0.3*0.5)/4     * 60}
    G91
    G1 X1 Z-0.300
    G1 X4
    G1 Z1 F1200
    G90
    M400
M623

G1 Z0.2

;M400
;M73 P1.717

;========turn off light and wait extrude temperature =============
M1002 gcode_claim_action : 0
M400

;===== for Textured PEI Plate , lower the nozzle as the nozzle was touching topmost of the texture when homing ==
;curr_bed_type={curr_bed_type}
{if curr_bed_type=="Textured PEI Plate"}
G29.1 Z{-0.02} ; for Textured PEI Plate
{endif}

M960 S1 P0 ; turn off laser
M960 S2 P0 ; turn off laser
M106 S0 ; turn off fan
M106 P2 S0 ; turn off big fan
M106 P3 S0 ; turn off chamber fan

M975 S1 ; turn on mech mode supression
G90
M83
T1000

M211 X0 Y0 Z0 ;turn off soft endstop
;G392 S1 ; turn on clog detection
M1007 S1 ; turn on mass estimation
G29.4
`,machine_switch_extruder_time:"0",machine_unload_filament_time:"29",master_extruder_id:"1",max_bridge_length:"0",max_layer_height:["0.28"],max_travel_detour_distance:"0",min_bead_width:"85%",min_feature_size:"25%",min_layer_height:["0.08"],minimum_sparse_infill_area:"15",mmu_segmented_region_interlocking_depth:"0",mmu_segmented_region_max_width:"0",monotonic_travel_into_wall:"0%",name:"project_settings",nozzle_diameter:["0.4"],nozzle_flush_dataset:["0"],nozzle_height:"4.76",nozzle_type:["stainless_steel"],nozzle_volume:["92"],nozzle_volume_type:["Standard"],only_one_wall_first_layer:"0",ooze_prevention:"0",other_layers_print_sequence:["0"],other_layers_print_sequence_nums:"0",outer_wall_acceleration:["5000"],outer_wall_jerk:"9",outer_wall_line_width:"0.42",outer_wall_speed:["200"],overhang_1_4_speed:["0"],overhang_2_4_speed:["50"],overhang_3_4_speed:["30"],overhang_4_4_speed:["10"],overhang_totally_speed:["10"],override_filament_scarf_seam_setting:"0",physical_extruder_map:["0"],post_process:[],precise_outer_wall:"0",precise_z_height:"0",prime_tower_enable_framework:"0",prime_tower_extra_rib_length:"0",prime_tower_fillet_wall:"1",prime_tower_flat_ironing:"0",prime_tower_infill_gap:"150%",prime_tower_lift_height:"-1",prime_tower_lift_speed:"90",prime_tower_max_speed:"90",prime_tower_rib_wall:"1",prime_tower_rib_width:"8",prime_tower_skip_points:"1",prime_volume_mode:"Default",print_compatible_printers:["Bambu Lab A1 0.4 nozzle"],print_extruder_id:["1"],print_extruder_variant:["Direct Drive Standard"],print_flow_ratio:"1",print_in_clockwise:"0",print_sequence:"by layer",print_settings_id:"0.20mm Standard @BBL A1",printable_area:["0x0","256x0","256x256","0x256"],printable_height:"256",printer_extruder_id:["1"],printer_extruder_variant:["Direct Drive Standard"],printer_model:"Bambu Lab A1",printer_notes:"",printer_settings_id:"Bambu Lab A1 0.4 nozzle",printer_structure:"i3",printer_technology:"FFF",printer_variant:"0.4",printhost_authorization_type:"key",printhost_ssl_ignore_revoke:"0",printing_by_object_gcode:"",process_notes:"",raft_contact_distance:"0.1",raft_expansion:"1.5",raft_first_layer_density:"90%",raft_first_layer_expansion:"-1",raft_layers:"0",reduce_crossing_wall:"0",reduce_infill_retraction_mode:"Auto",resolution:"0.012",retract_before_wipe:["0%"],retract_length_toolchange:["2"],retract_lift_above:["0"],retract_lift_below:["255"],retract_restart_extra:["0"],retract_restart_extra_toolchange:["0"],retract_when_changing_layer:["1"],retraction_distances_when_cut:["18"],retraction_length:["0.8"],retraction_minimum_travel:["1"],retraction_speed:["30"],role_base_wipe_speed:"1",scan_first_layer:"0",scarf_angle_threshold:"155",seam_gap:"15%",seam_placement_away_from_overhangs:"0",seam_position:"aligned",seam_slope_conditional:"1",seam_slope_entire_loop:"0",seam_slope_gap:"0",seam_slope_inner_walls:"1",seam_slope_min_length:"10",seam_slope_start_height:"10%",seam_slope_steps:"10",seam_slope_type:"none",silent_mode:"0",single_extruder_multi_material:"1",skeleton_infill_density:"15%",skeleton_infill_line_width:"0.45",skin_infill_density:"15%",skin_infill_depth:"2",skin_infill_line_width:"0.45",skirt_distance:"2",skirt_height:"1",skirt_loops:"0",skirt_per_object:"1",slice_closing_radius:"0.049",slicing_mode:"regular",slowdown_end_acc:["100000"],slowdown_end_height:["400"],slowdown_end_speed:["1000"],slowdown_start_acc:["100000"],slowdown_start_height:["0"],slowdown_start_speed:["1000"],small_perimeter_speed:["50%"],small_perimeter_threshold:["0"],smooth_coefficient:"80",smooth_speed_discontinuity_area:"1",solid_infill_filament:"0",sparse_infill_acceleration:["100%"],sparse_infill_anchor:"400%",sparse_infill_anchor_max:"20",sparse_infill_density:"15%",sparse_infill_filament:"0",sparse_infill_lattice_angle_1:"-45",sparse_infill_lattice_angle_2:"45",sparse_infill_line_width:"0.45",sparse_infill_pattern:"grid",sparse_infill_speed:["270"],spiral_mode:"0",spiral_mode_max_xy_smoothing:"200%",spiral_mode_smooth:"0",standby_temperature_delta:"-5",start_end_points:["30x-3","54x245"],support_air_filtration:"0",support_angle:"0",support_base_pattern:"default",support_base_pattern_spacing:"2.5",support_bottom_interface_spacing:"0.5",support_bottom_z_distance:"0.2",support_chamber_temp_control:"0",support_cooling_filter:"0",support_critical_regions_only:"0",support_expansion:"0",support_fast_purge_mode:"0",support_filament:"0",support_interface_bottom_layers:"2",support_interface_filament:"0",support_interface_loop_pattern:"0",support_interface_not_for_body:"1",support_interface_pattern:"auto",support_interface_spacing:"0.5",support_interface_speed:["80"],support_interface_top_layers:"2",support_ironing_direction:"0",support_ironing_flow:"10%",support_ironing_inset:"0",support_ironing_pattern:"zig-zag",support_ironing_spacing:"0.15",support_ironing_speed:"30",support_line_width:"0.42",support_object_first_layer_gap:"0.2",support_object_skip_flush:"0",support_object_xy_distance:"0.35",support_on_build_plate_only:"0",support_remove_small_overhang:"1",support_speed:["150"],support_style:"default",support_threshold_angle:"30",support_top_z_distance:"0.2",support_type:"tree(auto)",symmetric_infill_y_axis:"0",template_custom_gcode:"",thick_bridges:"0",thumbnail_size:["50x50"],time_lapse_gcode:`;===================== date: 20250206 =====================
{if !spiral_mode && print_sequence != "by object"}
; don't support timelapse gcode in spiral_mode and by object sequence for I3 structure printer
; SKIPPABLE_START
; SKIPTYPE: timelapse
M622.1 S1 ; for prev firmware, default turned on
M1002 judge_flag timelapse_record_flag
M622 J1
G92 E0
G1 Z{max_layer_z + 0.4}
G1 X0 Y{first_layer_center_no_wipe_tower[1]} F18000 ; move to safe pos
G1 X-48.2 F3000 ; move to safe pos
M400
M1004 S5 P1  ; external shutter
M400 P300
M971 S11 C11 O0
G92 E0
G1 X0 F18000
M623

; SKIPTYPE: head_wrap_detect
M622.1 S1
M1002 judge_flag g39_3rd_layer_detect_flag
M622 J1
    ; enable nozzle clog detect at 3rd layer
    {if layer_num == 2}
      M400
      G90
      M83
      M204 S5000
      G0 Z2 F4000
      G0 X261 Y250 F20000
      M400 P200
      G39 S1
      G0 Z2 F4000
    {endif}


    M622.1 S1
    M1002 judge_flag g39_detection_flag
    M622 J1
      {if !in_head_wrap_detect_zone}
        M622.1 S0
        M1002 judge_flag g39_mass_exceed_flag
        M622 J1
        {if layer_num > 2}
            G392 S0
            M400
            G90
            M83
            M204 S5000
            G0 Z{max_layer_z + 0.4} F4000
            G39.3 S1
            G0 Z{max_layer_z + 0.4} F4000
            G392 S0
          {endif}
        M623
    {endif}
    M623
M623
; SKIPPABLE_END
{endif}
`,timelapse_type:"0",top_area_threshold:"200%",top_color_penetration_layers:"5",top_one_wall_type:"all top",top_shell_layers:"5",top_shell_thickness:"1",top_solid_infill_flow_ratio:["1"],top_surface_acceleration:["2000"],top_surface_density:"100%",top_surface_jerk:"9",top_surface_line_width:"0.42",top_surface_pattern:"monotonicline",top_surface_speed:["200"],top_z_overrides_xy_distance:"0",travel_acceleration:["10000"],travel_jerk:"9",travel_short_distance_acceleration:["250"],travel_speed:["700"],travel_speed_z:["0"],tree_support_branch_angle:"45",tree_support_branch_diameter:"2",tree_support_branch_diameter_angle:"5",tree_support_branch_distance:"5",tree_support_wall_count:"-1",upward_compatible_machine:["Bambu Lab H2D 0.4 nozzle","Bambu Lab H2D Pro 0.4 nozzle","Bambu Lab H2S 0.4 nozzle","Bambu Lab P2S 0.4 nozzle","Bambu Lab H2C 0.4 nozzle","Bambu Lab X2D 0.4 nozzle","Bambu Lab A2L 0.4 nozzle"],use_firmware_retraction:"0",use_relative_e_distances:"1",vertical_shell_speed:["80%"],wall_distribution_count:"1",wall_filament:"0",wall_generator:"classic",wall_loops:"2",wall_sequence:"inner wall/outer wall",wall_transition_angle:"10",wall_transition_filter_deviation:"25%",wall_transition_length:"100%",wipe:["1"],wipe_distance:["2"],wipe_speed:"80%",wipe_tower_no_sparse_layers:"0",wipe_tower_rotation_angle:"0",wrapping_detection_gcode:"",wrapping_detection_layers:"20",wrapping_exclude_area:[],xy_contour_compensation:"0",xy_hole_compensation:"0",z_direction_outwall_speed_continuous:"0",z_hop:["0.4"],z_hop_types:["Auto Lift"]},ka={activate_air_filtration:"0",additional_cooling_fan_speed:"70",additional_fan_full_speed_layer:"0",chamber_temperatures:"0",circle_compensation_speed:"200",close_additional_fan_first_x_layers:"1",close_fan_the_first_x_layers:"1",complete_print_exhaust_fan_speed:"70",cool_plate_temp:"35",cool_plate_temp_initial_layer:"35",cooling_perimeter_transition_distance:"10",cooling_slowdown_logic:"uniform_cooling",counter_coef_1:"0",counter_coef_2:"0.008",counter_coef_3:"-0.041",counter_limit_max:"0.033",counter_limit_min:"-0.035",default_filament_colour:"",diameter_limit:"50",during_print_exhaust_fan_speed:"70",enable_overhang_bridge_fan:"1",enable_pressure_advance:"0",eng_plate_temp:"0",eng_plate_temp_initial_layer:"0",fan_cooling_layer_time:"80",fan_max_speed:"80",fan_min_speed:"60",filament_adaptive_volumetric_speed:"0",filament_adhesiveness_category:"100",filament_bridge_speed:"25",filament_change_length:"5",filament_change_length_nc:"10",filament_colour_type:"0",filament_cooling_before_tower:"0",filament_cost:"19.99",filament_density:"1.26",filament_deretraction_speed:"nil",filament_dev_ams_drying_heat_distortion_temperature:"45",filament_dev_chamber_drying_bed_temperature:"70",filament_dev_chamber_drying_time:"12",filament_dev_drying_cooling_temperature:"45",filament_dev_drying_softening_temperature:"50",filament_diameter:"1.75",filament_enable_overhang_speed:"1",filament_end_gcode:`; filament end gcode 

`,filament_extruder_compatibility:"0",filament_extruder_variant:"Direct Drive Standard",filament_flow_ratio:"0.98",filament_flush_temp:"0",filament_flush_temp_fast:"0",filament_flush_volumetric_speed:"0",filament_is_support:"0",filament_long_retractions_when_cut:"1",filament_max_volumetric_speed:"21",filament_metal_stickiness:"None",filament_minimal_purge_on_wipe_tower:"15",filament_multi_colour:"#000000",filament_nozzle_map:"0",filament_overhang_1_4_speed:"0",filament_overhang_2_4_speed:"50",filament_overhang_3_4_speed:"30",filament_overhang_4_4_speed:"10",filament_overhang_totally_speed:"10",filament_pre_cooling_temperature:"0",filament_pre_cooling_temperature_nc:"0",filament_preheat_temperature_delta:"0",filament_prime_volume:"30",filament_prime_volume_nc:"60",filament_printable:"3",filament_ramming_travel_time:"0",filament_ramming_travel_time_nc:"0",filament_ramming_volumetric_speed:"-1",filament_ramming_volumetric_speed_nc:"-1",filament_retract_before_wipe:"nil",filament_retract_length_nc:"14",filament_retract_restart_extra:"nil",filament_retract_when_changing_layer:"nil",filament_retraction_distances_when_cut:"18",filament_retraction_length:"nil",filament_retraction_minimum_travel:"nil",filament_retraction_speed:"nil",filament_scarf_gap:"0%",filament_scarf_height:"10%",filament_scarf_length:"10",filament_scarf_seam_type:"none",filament_self_index:"3",filament_shrink:"100%",filament_soluble:"0",filament_start_gcode:`; filament start gcode
{if  (bed_temperature[current_extruder] >55)||(bed_temperature_initial_layer[current_extruder] >55)}M106 P3 S200
{elsif(bed_temperature[current_extruder] >50)||(bed_temperature_initial_layer[current_extruder] >50)}M106 P3 S150
{elsif(bed_temperature[current_extruder] >45)||(bed_temperature_initial_layer[current_extruder] >45)}M106 P3 S50
{endif}

{if activate_air_filtration[current_extruder] && support_air_filtration}
M106 P3 S{during_print_exhaust_fan_speed_num[current_extruder]} 
{endif}`,filament_tower_interface_pre_extrusion_dist:"10",filament_tower_interface_pre_extrusion_length:"0",filament_tower_interface_print_temp:"-1",filament_tower_interface_purge_volume:"20",filament_tower_ironing_area:"4",filament_velocity_adaptation_factor:"1",filament_vendor:"Bambu Lab",filament_volume_map:"0",filament_wipe:"nil",filament_wipe_distance:"nil",filament_z_hop:"nil",filament_z_hop_types:"nil",first_x_layer_fan_speed:"0",first_x_layer_part_fan_speed:"0",full_fan_speed_layer:"0",hole_coef_1:"0",hole_coef_2:"-0.008",hole_coef_3:"0.23415",hole_limit_max:"0.22",hole_limit_min:"0.088",hot_plate_temp:"65",hot_plate_temp_initial_layer:"65",impact_strength_z:"13.8",ironing_fan_speed:"-1",long_retractions_when_ec:"0",no_slow_down_for_cooling_on_outwalls:"0",nozzle_temperature:"220",nozzle_temperature_initial_layer:"220",nozzle_temperature_range_high:"240",nozzle_temperature_range_low:"190",overhang_fan_speed:"100",overhang_fan_threshold:"50%",overhang_threshold_participating_cooling:"95%",override_process_overhang_speed:"0",pre_start_fan_time:"2",pressure_advance:"0.02",reduce_fan_stop_start_freq:"1",required_nozzle_HRC:"3",retraction_distances_when_ec:"0",slow_down_for_layer_cooling:"1",slow_down_layer_time:"6",slow_down_min_speed:"20",supertack_plate_temp:"45",supertack_plate_temp_initial_layer:"45",temperature_vitrification:"45",textured_plate_temp:"65",textured_plate_temp_initial_layer:"65",volumetric_speed_coefficients:"0 0 0 0 0 0"},Fa="http://schemas.microsoft.com/3dmanufacturing/core/2015/02",Ea="http://schemas.bambulab.com/package/2021",vt=256,uo=[vt/2,vt/2],Sa=`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="png" ContentType="image/png"/>
 <Default Extension="gcode" ContentType="text/x.gcode"/>
</Types>
`,Ga=`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`,po=e=>String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"),jt=e=>po(e).replace(/"/g,"&quot;");function Me(e){const t=e.toFixed(5).replace(/0+$/,"").replace(/\.$/,"");return t===""||t==="-0"?"0":t}const fo=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];function ho(e,t){const n=e[t],o=e[t+1],r=e[t+2],a=e[t+3],s=e[t+4],l=e[t+5];return[[n,o,r],[a,o,r],[a,s,r],[n,s,r],[n,o,l],[a,o,l],[a,s,l],[n,s,l]]}function Aa(e){const t=[];let n=[],o=0;const r=c=>{n.push(c),o+=c.length+1,o>1e6&&(t.push(n.join(`
`)+`
`),n=[],o=0)};r('<?xml version="1.0" encoding="UTF-8"?>'),r(`<model unit="millimeter" xml:lang="en-US" xmlns="${Fa}" xmlns:BambuStudio="${Ea}">`),r(` <metadata name="Application">BambuStudio-${co}</metadata>`),r(' <metadata name="Description">Made with HueLite</metadata>'),r(' <metadata name="BambuStudio:3mfVersion">1</metadata>'),r(` <metadata name="Title">${po(e.name)}</metadata>`),r(" <resources>"),e.parts.forEach((c,i)=>{r(`  <object id="${i+1}" type="model">`),r("   <mesh>"),r("    <vertices>");const u=c.boxes.length/6;for(let p=0;p<u;p++)for(const[m,h,d]of ho(c.boxes,p*6))r(`     <vertex x="${Me(m)}" y="${Me(h)}" z="${Me(d)}"/>`);r("    </vertices>"),r("    <triangles>");for(let p=0;p<u;p++){const m=p*8;for(const[h,d,_]of fo)r(`     <triangle v1="${h+m}" v2="${d+m}" v3="${_+m}"/>`)}r("    </triangles>"),r("   </mesh>"),r("  </object>")});const a=e.parts.length+1;r(`  <object id="${a}" type="model">`),r("   <components>");for(let c=1;c<a;c++)r(`    <component objectid="${c}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`);r("   </components>"),r("  </object>"),r(" </resources>");const[s,l]=uo;return r(" <build>"),r(`  <item objectid="${a}" transform="1 0 0 0 1 0 0 0 1 ${Me(s)} ${Me(l)} 0" printable="1"/>`),r(" </build>"),n.push("</model>"),t.push(n.join(`
`)),t}function La(e){const t=e.parts.length+1,n=['<?xml version="1.0" encoding="UTF-8"?>',"<config>",`  <object id="${t}">`,`    <metadata key="name" value="${jt(e.name)}"/>`,'    <metadata key="extruder" value="1"/>'];return e.parts.forEach((o,r)=>{n.push(`    <part id="${r+1}" subtype="normal_part">`),n.push(`      <metadata key="name" value="${jt(o.name)}"/>`),n.push('      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>'),n.push(`      <metadata key="extruder" value="${o.extruder}"/>`),n.push("    </part>")}),n.push("  </object>","  <plate>",'    <metadata key="plater_id" value="1"/>',`    <metadata key="plater_name" value="${jt(e.name)}"/>`,'    <metadata key="locked" value="false"/>',"    <model_instance>",`      <metadata key="object_id" value="${t}"/>`,'      <metadata key="instance_id" value="0"/>',"    </model_instance>","  </plate>","  <assemble>",`   <assemble_item object_id="${t}" instance_id="0" transform="1 0 0 0 1 0 0 0 1 0 0 0" offset="0 0 0" />`,"  </assemble>","</config>"),n.join(`
`)}function Ca(e,t){const[n]=uo,o=vt;let r=0;for(const s of e.parts)for(let l=3;l<s.boxes.length;l+=6)s.boxes[l]>r&&(r=s.boxes[l]);return[Math.min(o-t-3,n+r+5),o-t-3]}function Ta(e,t,n){const o=t.length,r=15,a=2,s={from:"project",version:co,...va};for(const[i,u]of Object.entries(ka))s[i]=Array(o).fill(u);s.filament_colour=t.map(i=>i.slice(0,7).toUpperCase()),s.filament_type=Array(o).fill("PLA"),s.filament_ids=Array(o).fill("GFA00"),s.filament_settings_id=Array(o).fill("Bambu PLA Basic @BBL A1"),s.filament_map=Array(o).fill("1"),s.flush_volumes_matrix=Array.from({length:o*o},(i,u)=>Math.floor(u/o)===u%o?"0":"280"),s.flush_volumes_vector=Array(o*2).fill("140"),s.filament_dev_ams_drying_ams_limitations=Array.from({length:o*2},(i,u)=>u%2?"0":"1"),s.filament_dev_ams_drying_temperature=Array(o*4).fill("45"),s.filament_dev_ams_drying_time=Array(o*4).fill("12");const[l,c]=Ca(e,r);return s.layer_height=Me(n||.08),s.initial_layer_print_height="0.2",s.enable_prime_tower="1",s.prime_tower_width=String(r),s.prime_tower_brim_width=String(a),s.wipe_tower_x=[Me(l)],s.wipe_tower_y=[Me(c)],s.different_settings_to_system=["layer_height;prime_tower_brim_width;prime_tower_width",...Array(o).fill(""),""],JSON.stringify(s,null,4)}async function za(e,{colours:t=null,layerHeight:n=null}={}){const o=[{name:"[Content_Types].xml",chunks:[Sa]},{name:"_rels/.rels",chunks:[Ga]},{name:"3D/3dmodel.model",chunks:Aa(e)},{name:"Metadata/model_settings.config",chunks:[La(e)]}];return t&&o.push({name:"Metadata/project_settings.config",chunks:[Ta(e,t,n)]}),lo(o,"model/3mf")}function Pa(e){const t=e.parts.reduce((l,c)=>l+c.boxes.length/6,0);if(!t)throw new Error("nothing to export - every filament band is empty");const n=t*12,o=new ArrayBuffer(84+n*50),r=new DataView(o),a=new TextEncoder().encode("HueLite export");new Uint8Array(o,0,a.length).set(a),r.setUint32(80,n,!0);let s=84;for(const l of e.parts){const c=l.boxes.length/6;for(let i=0;i<c;i++){const u=ho(l.boxes,i*6);for(const[p,m,h]of fo){const d=u[p],_=u[m],y=u[h],F=_[0]-d[0],x=_[1]-d[1],P=_[2]-d[2],k=y[0]-d[0],g=y[1]-d[1],v=y[2]-d[2];let G=x*v-P*g,z=P*k-F*v,E=F*g-x*k;const w=Math.hypot(G,z,E)||1;G/=w,z/=w,E/=w;for(const M of[G,z,E,...d,..._,...y])r.setFloat32(s,M,!0),s+=4;r.setUint16(s,0,!0),s+=2}}}return new Blob([o],{type:"model/stl"})}function ja(e,{layerHeight:t=.08}={}){const n=["HueLite -- filament slots for this print",""];return e.forEach((o,r)=>{const a=r===0?"  (prints first, lowest)":r===e.length-1?"  (prints last, top)":"";n.push(`  Slot ${o.slot}   ${(o.name||"").padEnd(10)} ${o.hex}${a}`)}),n.push("",`This project already carries ${e.length} filaments (the colours above, PLA) and a`,`${Me(t)} mm layer height for the Bambu Lab A1, so Bambu Studio opens it`,"ready to go. Put a spool of the matching colour in each AMS slot. The slot","NUMBER is what prints; the colour only has to be close."),n.join(`
`)+`
`}const Ke={brightness:0,contrast:0,saturation:0,denoise:0,sharpen:0,pixelize:0,decimate:0},qt={poster:{denoise:.45,contrast:.12,saturation:.08,decimate:12},painterly:{denoise:.7,sharpen:.3,saturation:.1,decimate:18},flat:{denoise:.55,contrast:.2,decimate:6},pixel:{denoise:.3,pixelize:.35,decimate:8}},ae=Math.fround;function mo(e){const t=Math.floor(e),n=e-t;return n>.5?t+1:n<.5||t%2===0?t:t+1}const Wt=(e,t)=>({width:e,height:t,data:new Uint8ClampedArray(e*t*4)}),qe=e=>({width:e.width,height:e.height,data:new Uint8ClampedArray(e.data)}),cn=(e,t,n)=>e*19595+t*38470+n*7471+32768>>16;function Xt(e,t,n){const o=ae(n),r=qe(t),a=r.data,s=t.data,l=e.data,c=o>=0&&o<=1;for(let i=0;i<a.length;i+=4)for(let u=0;u<3;u++){const p=l[i+u],m=s[i+u],h=ae(p+o*(m-p));a[i+u]=c?Math.trunc(h):h<=0?0:h>=255?255:Math.trunc(h)}return r}function kn(e,t,n,o){const r=qe(e);for(let a=0;a<r.data.length;a+=4)r.data[a]=t,r.data[a+1]=n,r.data[a+2]=o;return r}function Xa(e){const t=qe(e),n=t.data;for(let o=0;o<n.length;o+=4){const r=cn(n[o],n[o+1],n[o+2]);n[o]=n[o+1]=n[o+2]=r}return t}function Ia(e,t,n,o){if(Math.abs(t)>.001&&(e=Xt(kn(e,0,0,0),e,1+t)),Math.abs(n)>.001){let r=0;const a=e.data;for(let l=0;l<a.length;l+=4)r+=cn(a[l],a[l+1],a[l+2]);const s=Math.trunc(r/(a.length/4)+.5);e=Xt(kn(e,s,s,s),e,1+n)}return Math.abs(o)>.001&&(e=Xt(Xa(e),e,1+o)),e}function $a(e,t){const{width:n,height:o,data:r}=e,a=t>>1,s=t*t>>1,l=qe(e),c=l.data,i=new Uint16Array(256),u=m=>m<0?0:m>=n?n-1:m,p=m=>m<0?0:m>=o?o-1:m;for(let m=0;m<3;m++)for(let h=0;h<o;h++){i.fill(0);for(let y=-a;y<=a;y++){const F=p(h+y)*n;for(let x=-a;x<=a;x++)i[r[(F+u(x))*4+m]]++}let d=0,_=0;for(;_+i[d]<=s;)_+=i[d],d++;c[h*n*4+m]=d;for(let y=1;y<n;y++){const F=u(y-a-1),x=u(y+a);for(let P=-a;P<=a;P++){const k=p(h+P)*n,g=r[(k+F)*4+m],v=r[(k+x)*4+m];i[g]--,g<d&&_--,i[v]++,v<d&&_++}for(;_>s;)d--,_-=i[d];for(;_+i[d]<=s;)_+=i[d],d++;c[(h*n+y)*4+m]=d}}return l}function Ua(e,t){if(t<=.01)return e;const n=Math.max(1,mo(t*4));return $a(e,n*2+1)}function Ba(e,t){const n=ae(ae(e*e)/t),o=ae(Math.sqrt(12*n+1)),r=ae(Math.floor((o-1)/2));let a=ae(ae(2*r+1)*ae(ae(r*ae(r+1))-ae(3*n)));return a=ae(a/ae(6*ae(n-ae(ae(r+1)*ae(r+1))))),ae(r+a)}function Fn(e,t,n,o,r,a){const s=Math.trunc(a),l=Math.trunc(ae(16777216/ae(ae(a*2)+1))),c=Math.trunc((16777216-(s*2+1)*l)/2),i=n-1,u=Math.min(s+1,n),p=Math.max(n-s-1,0),m=d=>e[o(d<0?0:d>i?i:d)];let h=m(0)*(s+1);for(let d=0;d<u-1;d++)h+=m(d);h+=m(i)*(s-u+1);for(let d=0;d<=i;d++){const _=d<u?0:d-s-1,y=d<p?d+s:i;h+=m(y)-m(_);const F=d<u?0:d-s-1,x=d<p?d+s+1:i,P=h*l+(m(F)+m(x))*c;t[r(d)]=Math.floor((P+8388608)/16777216)}}function Ra(e,t){const{width:n,height:o}=e,r=Ba(t,3);let a=new Uint8ClampedArray(e.data);const s=new Uint8ClampedArray(Math.max(n,o));for(let l=0;l<3;l++){for(let c=0;c<3;c++)for(let i=0;i<o;i++){Fn(a,s,n,u=>(i*n+u)*4+l,u=>u,r);for(let u=0;u<n;u++)a[(i*n+u)*4+l]=s[u]}for(let c=0;c<3;c++)for(let i=0;i<n;i++){Fn(a,s,o,u=>(u*n+i)*4+l,u=>u,r);for(let u=0;u<o;u++)a[(u*n+i)*4+l]=s[u]}}return{width:n,height:o,data:a}}function Da(e,t){if(t<=.01)return e;const n=Math.trunc(t*250),o=Ra(e,2),r=qe(e),a=e.data,s=o.data,l=r.data;for(let c=0;c<l.length;c+=4)for(let i=0;i<3;i++){const u=a[c+i]-s[c+i];l[c+i]=Math.abs(u)>2?a[c+i]+Math.trunc(u*n/100):a[c+i]}return r}const at=22;function En(e,t){const n=e/t,o=Math.max(1,n),r=.5*o,a=[];for(let s=0;s<t;s++){const l=(s+.5)*n,c=1/o,i=Math.max(0,Math.trunc(l-r+.5)),u=Math.min(e,Math.trunc(l+r+.5))-i,p=[];let m=0;for(let d=0;d<u;d++){const _=(d+i-l+.5)*c,y=_>-.5&&_<=.5?1:0;p.push(y),m+=y}const h=p.map(d=>{const _=m?d/m:d;return _<0?Math.trunc(-.5+_*(1<<at)):Math.trunc(.5+_*(1<<at))});a.push({xmin:i,k:h})}return a}function Sn(e){const t=e>>at;return t<0?0:t>255?255:t}function Na(e,t,n){const{width:o,height:r,data:a}=e;let s=e;if(t!==o){const i=En(o,t);s=Wt(t,r);for(let u=0;u<r;u++)for(let p=0;p<t;p++){const{xmin:m,k:h}=i[p];for(let d=0;d<4;d++){let _=1<<at-1;for(let y=0;y<h.length;y++)_+=a[(u*o+m+y)*4+d]*h[y];s.data[(u*t+p)*4+d]=Sn(_)}}}if(n===r)return s;const l=En(r,n),c=Wt(t,n);for(let i=0;i<n;i++){const{xmin:u,k:p}=l[i];for(let m=0;m<t;m++)for(let h=0;h<4;h++){let d=1<<at-1;for(let _=0;_<p.length;_++)d+=s.data[((u+_)*t+m)*4+h]*p[_];c.data[(i*t+m)*4+h]=Sn(d)}}return c}function Gn(e,t){const n=e/t,o=new Int32Array(t);let r=n*.5;for(let a=0;a<t;a++)o[a]=r<0?-1:Math.trunc(r),r+=n;return o}function An(e,t,n){const o=Gn(e.width,t),r=Gn(e.height,n),a=Wt(t,n),s=e.data,l=a.data;for(let c=0;c<n;c++){const i=r[c]*e.width;for(let u=0;u<t;u++){const p=(i+o[u])*4,m=(c*t+u)*4;l[m]=s[p],l[m+1]=s[p+1],l[m+2]=s[p+2],l[m+3]=s[p+3]}}return a}function Oa(e,t){const n=mo(1+t*23);if(n<=1)return e;const o=Math.max(1,Math.floor(e.width/n)),r=Math.max(1,Math.floor(e.height/n)),a=Na(e,o,r);return An(An(a,o*n,r*n),e.width,e.height)}function Za(e,t){const n=Math.trunc(t);if(n<2)return e;const o=e.data,r=new Map;for(let w=0;w<o.length;w+=4){const M=o[w]<<16|o[w+1]<<8|o[w+2];r.set(M,(r.get(M)||0)+1)}let a=0;const s=(w,M)=>(w>>16&255)>>M<<16|(w>>8&255)>>M<<8|(w&255)>>M;for(;!(a===0&&r.size<=65536);){const w=new Set;for(const M of r.keys())w.add(s(M,a));if(w.size<=65536)break;a++}const l=new Map;for(const[w,M]of r){const T=s(w,a),N=l.get(T);N?N[3]+=M:l.set(T,[T>>16&255,T>>8&255,T&255,M])}const c=(w,M)=>{const T=[255,255,255],N=[0,0,0];for(const A of w)for(let j=0;j<3;j++)A[j]<T[j]&&(T[j]=A[j]),A[j]>N[j]&&(N[j]=A[j]);const S=(N[0]-T[0]+1)*(N[1]-T[1]+1)*(N[2]-T[2]+1);return{list:w,pixelCount:M,lo:T,hi:N,volume:S,l:null,r:null}},i=c([...l.values()],o.length/4),u=[null],p=(w,M)=>w.pixelCount-M.pixelCount,m=w=>{let M=u.length;for(u.push(null);M!==1&&!(p(w,u[M>>1])<=0);)u[M]=u[M>>1],M>>=1;u[M]=w},h=()=>{if(u.length<2)return null;const w=u[1],M=u.pop(),T=u.length-1;if(T===0)return w;let N=1,S;for(;N*2<=T&&(S=N*2,S<T&&p(u[S],u[S+1])<0&&S++,!(p(M,u[S])>0));N=S)u[N]=u[S];return u[N]=M,w},d=[77,150,29];m(i);let _=n;e:for(;--_;){let w;do if(w=h(),!w)break e;while(w.volume===1);let M=0,T=(w.hi[0]-w.lo[0])*d[0];for(let D=1;D<3;D++){const X=(w.hi[D]-w.lo[D])*d[D];T<X&&(T=X,M=D)}const N=new Map;for(const D of w.list)N.set(D[M],(N.get(D[M])||0)+D[3]);const S=[...N.keys()].sort((D,X)=>X-D);let A=0,j=null;for(const D of S)if(A+=N.get(D),A*2>w.pixelCount){j=D;break}let $=j===null?w.list.slice():w.list.filter(D=>D[M]>=j),U=j===null?[]:w.list.filter(D=>D[M]<j);if(!U.length){const D=S[S.length-1];U=w.list.filter(X=>X[M]===D),$=w.list.filter(X=>X[M]!==D)}const R=D=>D.reduce((X,b)=>X+b[3],0);w.l=c($,R($)),w.r=c(U,R(U)),w.list=null,m(w.l),m(w.r)}const y=new Map;let F=0;(function w(M){if(M.l&&M.r){w(M.l),w(M.r);return}if(M.list.length){for(const T of M.list)y.set(T[0]<<16|T[1]<<8|T[2],F);F++}})(i);const x=Array.from({length:F},()=>[0,0,0,0]);for(const[w,M]of r){const T=x[y.get(s(w,a))];T[0]+=(w>>16&255)*M,T[1]+=(w>>8&255)*M,T[2]+=(w&255)*M,T[3]+=M}const P=x.map(w=>[0,1,2].map(M=>Math.trunc(.5+w[M]/w[3]))),k=(w,M)=>(w[0]-M[0])**2+(w[1]-M[1])**2+(w[2]-M[2])**2,g=P.map(w=>P.map(M=>k(w,M))),v=g.map(w=>w.map((M,T)=>T).sort((M,T)=>w[M]===w[T]?M-T:w[M]-w[T])),G=new Map;for(const w of r.keys()){const M=[w>>16&255,w>>8&255,w&255],T=y.get(s(w,a));let N=k(P[T],M),S=T;const A=N*4;for(const j of v[T]){if(g[T][j]>A)break;const $=k(P[j],M);$<N&&(N=$,S=j)}G.set(w,P[S])}const z=qe(e),E=z.data;for(let w=0;w<E.length;w+=4){const M=G.get(E[w]<<16|E[w+1]<<8|E[w+2]);E[w]=M[0],E[w+1]=M[1],E[w+2]=M[2]}return z}function _o(e,t){const n={...Ke,...t||{}};return e=Ua(e,+n.denoise),e=Ia(e,+n.brightness,+n.contrast,+n.saturation),e=Da(e,+n.sharpen),e=Oa(e,+n.pixelize),e=Za(e,+n.decimate),e}function Ln(e,t){const n=(e.length-1)*t/100,o=Math.floor(n),r=Math.ceil(n);return e[o]+(e[r]-e[o])*(n-o)}function Ha(e){const{width:t,height:n,data:o}=e,r=t*n,a=new Float32Array(r),s=new Uint8Array(r);let l=0,c=0;for(let x=0,P=0;x<r;x++,P+=4){const k=o[P],g=o[P+1],v=o[P+2];a[x]=.2126*k+.7152*g+.0722*v,c+=a[x],s[x]=cn(k,g,v);const G=Math.max(k,g,v),z=Math.min(k,g,v);l+=G?(G-z)*255/G:0}const i=Float32Array.from(a).sort(),u=Ln(i,2),p=Ln(i,98),m=p-u,h=l/r/255,d=c/r/255,_={...qt.painterly},y=[];m<110?(_.contrast=.35,y.push(`tonal range is narrow (${Math.trunc(u)}–${Math.trunc(p)}); contrast up so bands separate`)):m<160&&(_.contrast=.18,y.push("tonal range is a little narrow; mild contrast")),d<.35?(_.brightness=.15,y.push("image is dark; lifted so the light filament has work to do")):d>.72&&(_.brightness=-.1,y.push("image is bright; pulled down a touch")),h<.22&&(_.saturation=.25,y.push("colour is flat; saturation up so hues map to distinct filaments"));let F=0;for(let x=1;x<n-1;x++)for(let P=1;P<t-1;P++){const k=x*t+P;let g=8*s[k];for(const v of[-t-1,-t,-t+1,-1,1,t-1,t,t+1])g-=s[k+v];Math.max(0,Math.min(255,g))>40&&F++}return F/r>.18?(_.denoise=.85,_.decimate=12,y.push("lots of fine detail; heavier smoothing and fewer colours")):y.push("smoothed and reduced to a painter's palette"),{adjustments:_,reasons:y}}const kt=65535,It=[1,3,6],Ya=.12,Va=1.5,gt=30*Math.PI/180,qa=32*Math.PI/180,Re=4,Wa={az:0,el:gt,zoom:1,relief:1},Ja=(e,t)=>{const n=new Float32Array(16);for(let o=0;o<4;o++)for(let r=0;r<4;r++){let a=0;for(let s=0;s<4;s++)a+=e[s*4+r]*t[o*4+s];n[o*4+r]=a}return n};function Ka(e,t,n,o){const r=1/Math.tan(e/2),a=1/(n-o);return Float32Array.from([r/t,0,0,0,0,r,0,0,0,0,(o+n)*a,-1,0,0,2*o*n*a,0])}function Qa(e,t){const n=(i,u)=>[i[0]-u[0],i[1]-u[1],i[2]-u[2]],o=i=>{const u=Math.hypot(...i)||1;return i.map(p=>p/u)},r=(i,u)=>[i[1]*u[2]-i[2]*u[1],i[2]*u[0]-i[0]*u[2],i[0]*u[1]-i[1]*u[0]],a=o(n(e,t)),s=o(r([0,0,1],a)),l=r(a,s),c=(i,u)=>i[0]*u[0]+i[1]*u[1]+i[2]*u[2];return Float32Array.from([s[0],l[0],a[0],0,s[1],l[1],a[1],0,s[2],l[2],a[2],0,-c(s,e),-c(l,e),-c(a,e),1])}const er=`#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
layout(location = 0) in vec3 aVert;     // a, b along the face; face id
uniform usampler2D uHeights;
uniform mat4 uViewProj;
uniform ivec2 uGrid;                    // columns, rows
uniform vec2 uCell;                     // cell size in mm
uniform vec2 uOrigin;                   // world x of the left edge, y of the front edge
uniform vec2 uZ;                        // layer height mm, base mm
uniform float uRelief;
out float vZL;                          // height in layers (can be below 0: the base)
flat out int vFace;
void main() {
  int id = gl_InstanceID;
  int c = id % uGrid.x;
  int r = id / uGrid.x;
  uint hv = texelFetch(uHeights, ivec2(c, r), 0).r;
  int face = int(aVert.z + 0.5);
  vFace = face;
  vZL = 0.0;
  if (hv == ${kt}u) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float top = float(hv);
  float bottom = -uZ.y / uZ.x;          // down to the plate
  if (face > 0) {
    ivec2 nb = ivec2(c, r) + (face == 1 ? ivec2(1, 0) : face == 2 ? ivec2(-1, 0)
                            : face == 3 ? ivec2(0, -1) : ivec2(0, 1));
    if (nb.x >= 0 && nb.y >= 0 && nb.x < uGrid.x && nb.y < uGrid.y) {
      uint nh = texelFetch(uHeights, nb, 0).r;
      if (nh != ${kt}u) {
        if (float(nh) >= top) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        bottom = float(nh);
      }
    }
  }
  float dx = face == 0 ? aVert.x : face == 1 ? 1.0 : face == 2 ? 0.0 : aVert.x;
  float dy = face == 0 ? aVert.y : face == 3 ? 1.0 : face == 4 ? 0.0 : aVert.x;
  float zl = face == 0 ? top : mix(bottom, top, aVert.y);
  vZL = zl;
  vec3 p = vec3(uOrigin.x + (float(c) + dx) * uCell.x,
                uOrigin.y + (float(uGrid.y - 1 - r) + dy) * uCell.y,
                (uZ.y + zl * uZ.x) * uRelief);
  gl_Position = uViewProj * vec4(p, 1.0);
}`,tr=`#version 300 es
precision highp float;
precision highp int;
in float vZL;
flat in int vFace;
uniform sampler2D uLut;
uniform int uLutN;
uniform mat3 uViewRot;
out vec4 outColour;
void main() {
  int idx = clamp(int(ceil(vZL - 0.002)), 0, uLutN - 1);
  vec3 col = texelFetch(uLut, ivec2(idx, 0), 0).rgb;
  float f = 1.0;                         // tops are never shaded
  if (vFace != 0) {
    vec3 n = vFace == 1 ? vec3(1.0, 0.0, 0.0) : vFace == 2 ? vec3(-1.0, 0.0, 0.0)
           : vFace == 3 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, -1.0, 0.0);
    vec3 l = normalize(vec3(-0.35, 0.40, 0.85));
    f = 0.46 + 0.54 * clamp(dot(uViewRot * n, l), 0.0, 1.0);
  }
  outColour = vec4(col * f, 1.0);
}`,nr=`#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
uniform mat4 uViewProj;
uniform vec4 uRect;                      // x0, y0, x1, y1
uniform float uZ;
void main() {
  vec2 p = mix(uRect.xy, uRect.zw, aPos);
  gl_Position = uViewProj * vec4(p, uZ, 1.0);
}`,or=`#version 300 es
precision highp float;
uniform vec3 uColour;
out vec4 outColour;
void main() { outColour = vec4(uColour, 1.0); }`;function Cn(e,t,n){const o=e.createShader(t);if(e.shaderSource(o,n),e.compileShader(o),!e.getShaderParameter(o,e.COMPILE_STATUS))throw new Error(e.getShaderInfoLog(o)||"shader failed");return o}function Tn(e,t,n){const o=e.createProgram();if(e.attachShader(o,Cn(e,e.VERTEX_SHADER,t)),e.attachShader(o,Cn(e,e.FRAGMENT_SHADER,n)),e.linkProgram(o),!e.getProgramParameter(o,e.LINK_STATUS))throw new Error(e.getProgramInfoLog(o)||"link failed");return o}const ar=[[0,0],[1,0],[1,1],[0,1]],rr=Float32Array.from([0,1,2,3,4].flatMap(e=>ar.flatMap(([t,n])=>[t,n,e]))),zn=Uint8Array.from([0,1,2,3,4].flatMap(e=>[0,1,2,0,2,3].map(t=>e*4+t)));function un({onHint:e=!0,pose:t=null,offscreen:n=!1}={}){const o=t?{az:0,el:gt,zoom:1,relief:1,...t}:Wa,r=document.createElement("canvas");r.className="gl-canvas";let a;try{a=r.getContext("webgl2",{antialias:!0,alpha:!1,preserveDrawingBuffer:!0,powerPreference:"high-performance"})}catch{a=null}if(!a)return null;const s=document.createElement("div");s.className="gl-wrap";const l=document.createElement("span");l.className="gl-hint",l.textContent="drag to turn · pinch to zoom";const c=document.createElement("button");c.type="button",c.className="gl-btn";const i=document.createElement("button");i.type="button",i.className="gl-btn",i.textContent="⟲ view";const u=document.createElement("div");u.className="gl-tools",u.append(c,i),s.append(r,...e&&!t?[l]:[],...t?[]:[u]);let p=null,m=null,h=[],d=0,_=0,y=0,F=!1;function x(){const X=Tn(a,er,tr),b=Tn(a,nr,or),I=(J,L)=>Object.fromEntries(L.map(B=>[B,a.getUniformLocation(J,B)])),Z=a.createVertexArray();a.bindVertexArray(Z);const V=a.createBuffer();a.bindBuffer(a.ARRAY_BUFFER,V),a.bufferData(a.ARRAY_BUFFER,rr,a.STATIC_DRAW),a.enableVertexAttribArray(0),a.vertexAttribPointer(0,3,a.FLOAT,!1,0,0);const O=a.createBuffer();a.bindBuffer(a.ELEMENT_ARRAY_BUFFER,O),a.bufferData(a.ELEMENT_ARRAY_BUFFER,zn,a.STATIC_DRAW),a.bindVertexArray(null);const Y=a.createVertexArray();a.bindVertexArray(Y);const q=a.createBuffer();a.bindBuffer(a.ARRAY_BUFFER,q),a.bufferData(a.ARRAY_BUFFER,Float32Array.from([0,0,1,0,1,1,0,0,1,1,0,1]),a.STATIC_DRAW),a.enableVertexAttribArray(0),a.vertexAttribPointer(0,2,a.FLOAT,!1,0,0),a.bindVertexArray(null),p={col:X,plate:b,vao:Z,pvao:Y,cu:I(X,["uHeights","uViewProj","uGrid","uCell","uOrigin","uZ","uRelief","uLut","uLutN","uViewRot"]),pu:I(b,["uViewProj","uRect","uZ","uColour"]),lutTex:null}}function P(X,b,I,Z,V,O,Y){const q=a.createTexture();return a.bindTexture(a.TEXTURE_2D,q),a.pixelStorei(a.UNPACK_ALIGNMENT,Y),a.texImage2D(a.TEXTURE_2D,0,X,Z,V,0,b,I,O),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MIN_FILTER,a.NEAREST),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MAG_FILTER,a.NEAREST),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_S,a.CLAMP_TO_EDGE),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_T,a.CLAMP_TO_EDGE),q}function k(){for(const X of h)a.deleteTexture(X.tex);h=[]}function g(X,b,I,Z,V){const O=new Uint16Array(I*Z);let Y=0;for(let q=0;q<O.length;q++){if(b&&!b[q]){O[q]=kt;continue}const J=Math.min(kt-1,X[q]);O[q]=J,J>Y&&(Y=J)}return{tex:P(a.R16UI,a.RED_INTEGER,a.UNSIGNED_SHORT,I,Z,O,1),cols:I,rows:Z,cell:V,top:Y}}function v(){if(!m||!p)return;const{heights:X,w:b,h:I,mask:Z,lut:V,layerH:O,baseMm:Y,physicalW:q,maxCols:J=640}=m;k();const L=Math.max(1,Math.ceil(Math.max(b,I)/J)),B=xt(X,b,I,L),H=Mt(Z,b,I,L),W=q/b*L,Q=g(B.a,H,B.w,B.h,W);if(h=[Q],B.w*B.h>15e4){const se=xt(B.a,B.w,B.h,2);h.push(g(se.a,Mt(H,B.w,B.h,2),se.w,se.h,W*2))}const ee=V.length,te=new Uint8Array(ee*4);V.forEach((se,ge)=>{te[ge*4]=Math.round(se[0]),te[ge*4+1]=Math.round(se[1]),te[ge*4+2]=Math.round(se[2]),te[ge*4+3]=255}),p.lutTex&&a.deleteTexture(p.lutTex),p.lutTex=P(a.RGBA8,a.RGBA,a.UNSIGNED_BYTE,ee,1,te,1),p.lutN=ee,p.geo={layerH:O,baseMm:Y,widthMm:Q.cols*W,depthMm:Q.rows*W,topMm:Y+Q.top*O},p.fit=null}function G(X){const{widthMm:b,depthMm:I,topMm:Z}=p.geo,V=b/2+Re,O=I/2+Re,Y=Z*o.relief,q=[];for(const B of[-1,1])for(const H of[-1,1])for(const W of[0,Y])q.push([B*V,H*O,W]);const J=[0,0,Y/2];let L=Math.max(b,I)*2;for(let B=0;B<8;B++){const{vp:H}=z(X,L,t?o.el:gt,t?o.az:0,J);let W=0;for(const Q of q){const ee=H[0]*Q[0]+H[4]*Q[1]+H[8]*Q[2]+H[12],te=H[1]*Q[0]+H[5]*Q[1]+H[9]*Q[2]+H[13],se=H[3]*Q[0]+H[7]*Q[1]+H[11]*Q[2]+H[15];W=Math.max(W,Math.abs(ee/se),Math.abs(te/se))}L*=Math.max(.2,W/.97)}return L}function z(X,b,I,Z,V){const O=[V[0]+b*Math.sin(Z)*Math.cos(I),V[1]-b*Math.cos(Z)*Math.cos(I),V[2]+b*Math.sin(I)],Y=Qa(O,V),q=Ka(qa,X,b*.04,b*5);return{vp:Ja(q,Y),view:Y}}function E(){if(d=0,F||!p||!h.length||!p.geo||a.isContextLost())return;const X=r.width,b=r.height;if(!X||!b)return;const I=X/b;(!p.fit||p.fit.aspect!==I)&&(p.fit={aspect:I,dist:G(I)});const{widthMm:Z,depthMm:V,topMm:O,layerH:Y,baseMm:q}=p.geo,L=[0,0,O*o.relief/2],{vp:B,view:H}=z(I,p.fit.dist*o.zoom,o.el,o.az,L);a.viewport(0,0,X,b),a.clearColor(.098,.098,.09,1),a.enable(a.DEPTH_TEST),a.depthFunc(a.LEQUAL),a.disable(a.CULL_FACE),a.clear(a.COLOR_BUFFER_BIT|a.DEPTH_BUFFER_BIT),a.useProgram(p.plate),a.uniformMatrix4fv(p.pu.uViewProj,!1,B),a.uniform4f(p.pu.uRect,-Z/2-Re,-V/2-Re,Z/2+Re,V/2+Re),a.uniform1f(p.pu.uZ,-.05),a.uniform3f(p.pu.uColour,.165,.165,.15),a.bindVertexArray(p.pvao),a.drawArrays(a.TRIANGLES,0,6);const W=_&&h.length>1?h[1]:h[0];a.useProgram(p.col),a.uniformMatrix4fv(p.cu.uViewProj,!1,B),a.uniformMatrix3fv(p.cu.uViewRot,!1,Float32Array.from([H[0],H[1],H[2],H[4],H[5],H[6],H[8],H[9],H[10]])),a.uniform2i(p.cu.uGrid,W.cols,W.rows),a.uniform2f(p.cu.uCell,W.cell,W.cell),a.uniform2f(p.cu.uOrigin,-(W.cols*W.cell)/2,-(W.rows*W.cell)/2),a.uniform2f(p.cu.uZ,Y,q),a.uniform1f(p.cu.uRelief,o.relief),a.uniform1i(p.cu.uLutN,p.lutN),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,W.tex),a.uniform1i(p.cu.uHeights,0),a.activeTexture(a.TEXTURE1),a.bindTexture(a.TEXTURE_2D,p.lutTex),a.uniform1i(p.cu.uLut,1),a.bindVertexArray(p.vao),a.drawElementsInstanced(a.TRIANGLES,zn.length,a.UNSIGNED_BYTE,0,W.cols*W.rows),a.bindVertexArray(null)}const w=()=>{!d&&!F&&(d=requestAnimationFrame(E))};function M(){clearTimeout(y),y=setTimeout(()=>{_=0,w()},160)}const T=()=>{_=1,M(),w()},N=new ResizeObserver(()=>{const X=Math.min(window.devicePixelRatio||1,2.5),b=Math.round(r.clientWidth*X),I=Math.round(r.clientHeight*X);b===r.width&&I===r.height||(r.width=b,r.height=I,w())});n||N.observe(r);const S=new Map;let A=0,j=!1,$=0;r.addEventListener("pointerdown",X=>{try{r.setPointerCapture(X.pointerId)}catch{}if(S.set(X.pointerId,{x:X.clientX,y:X.clientY}),j=!1,S.size===2){const[b,I]=[...S.values()];$=Math.hypot(b.x-I.x,b.y-I.y)}X.preventDefault()}),r.addEventListener("pointermove",X=>{const b=S.get(X.pointerId);if(!b)return;const I=X.clientX-b.x,Z=X.clientY-b.y;if(b.x=X.clientX,b.y=X.clientY,Math.abs(I)+Math.abs(Z)>1&&(j=!0),S.size===1)o.az-=I*.008,o.el=Math.min(Va,Math.max(Ya,o.el+Z*.006));else if(S.size===2){const[V,O]=[...S.values()],Y=Math.hypot(V.x-O.x,V.y-O.y);$>0&&Y>0&&(o.zoom=Math.min(3,Math.max(.25,o.zoom*($/Y)))),$=Y}T()});const U=X=>{if(S.delete(X.pointerId)){if($=0,X.type==="pointerup"&&!j&&S.size===0){const b=performance.now();b-A<320?(D.resetCamera(),A=0):A=b}M()}};r.addEventListener("pointerup",U),r.addEventListener("pointercancel",U),r.addEventListener("wheel",X=>{X.preventDefault(),o.zoom=Math.min(3,Math.max(.25,o.zoom*Math.exp(X.deltaY*.0012))),T()},{passive:!1});const R=()=>{c.textContent=`relief ×${o.relief}`};c.addEventListener("click",()=>{o.relief=It[(It.indexOf(o.relief)+1)%It.length],p&&(p.fit=null),R(),w()}),i.addEventListener("click",()=>D.resetCamera()),R(),r.addEventListener("webglcontextlost",X=>{X.preventDefault(),p=null,h=[]}),r.addEventListener("webglcontextrestored",()=>{try{x(),v(),w()}catch(X){console.error(X)}});try{x()}catch(X){return console.error("3D view unavailable",X),null}const D={el:s,set(X){m=X,p&&(v(),w())},resetCamera(){o.az=0,o.el=gt,o.zoom=1,w()},redraw:w,snapshot(X,b){return r.width=X,r.height=b,p&&(p.fit=null),E(),new Promise(I=>r.toBlob(I,"image/png"))},destroy(){F=!0,cancelAnimationFrame(d),clearTimeout(y),N.disconnect(),s.remove(),a.getExtension("WEBGL_lose_context")?.loseContext()}};return D}const sr={az:-1,el:.2,zoom:1,relief:4};async function go(e,{w:t=480,h:n=300}={}){const o=un({pose:sr,offscreen:!0});if(!o)return null;try{return o.set(e),await o.snapshot(t,n)}finally{o.destroy()}}const ir="input, textarea, select, canvas, .slider, .crop-wrap, .gl-wrap, .lasso-layer, .rail, .sheet, .sheet-backdrop, .eye-box, .sv-box, [data-noswipe]",lr=()=>document.documentElement.dataset.motion==="calm"||window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;function cr(e,{drag:t,canGo:n,onGo:o,onBlocked:r}){let a=null;const s=(d,_)=>{t.style.transition=`transform ${d}ms ${_}, opacity ${d}ms ease`},l=()=>{t.classList.remove("dragging"),t.style.transition="",t.style.transform="",t.style.opacity=""},c=()=>{s(420,"cubic-bezier(.2, 1.3, .4, 1)"),t.style.transform="translate3d(0, 0, 0)",t.style.opacity="1",setTimeout(l,440)},i=d=>{d.pointerType==="mouse"||!d.isPrimary||d.target.closest(ir)||document.querySelector(".sheet-backdrop, .veil")||(a={id:d.pointerId,x:d.clientX,y:d.clientY,t:performance.now(),locked:!1,dx:0,dir:0,ok:!1})},u=d=>{if(!a||d.pointerId!==a.id)return;const _=d.clientX-a.x,y=d.clientY-a.y;if(!a.locked){if(Math.abs(y)>12&&Math.abs(y)>Math.abs(_)){a=null;return}if(Math.abs(_)<14||Math.abs(_)<Math.abs(y)*1.6)return;a.locked=!0,a.dir=_<0?1:-1,a.ok=n(a.dir);try{e.setPointerCapture(d.pointerId)}catch{}t.classList.add("dragging"),t.style.transition="none"}a.dx=_;const F=Math.sign(_)===-a.dir,x=a.ok?_*(F?1:.25):Math.sign(_)*Math.sqrt(Math.abs(_))*3.2,P=Math.max(1,e.clientWidth);t.style.transform=`translate3d(${x}px, 0, 0)`,t.style.opacity=String(Math.max(.35,1-Math.abs(x)/(P*1.1)))},p=(d,_)=>{if(!a||d.pointerId!==a.id)return;const y=a;if(a=null,!y.locked)return;const F=Math.max(1,e.clientWidth),x=y.dx,P=Math.max(1,performance.now()-y.t),k=Math.abs(x)/P>.55&&Math.abs(x)>40,g=Math.abs(x)>Math.min(120,F*.26);if(!_&&y.ok&&Math.sign(x)===-y.dir&&(g||k)){if(lr()){l(),o(y.dir);return}s(240,"cubic-bezier(.5, 0, 1, 1)"),t.style.transform=`translate3d(${y.dir>0?"-100%":"100%"}, 0, 0)`,t.style.opacity="0",setTimeout(()=>{l(),o(y.dir)},240);return}!_&&!y.ok&&Math.abs(x)>50&&r?.(y.dir),c()};e.addEventListener("pointerdown",i),e.addEventListener("pointermove",u);const m=d=>p(d,!1),h=d=>p(d,!0);return e.addEventListener("pointerup",m),e.addEventListener("pointercancel",h),()=>{e.removeEventListener("pointerdown",i),e.removeEventListener("pointermove",u),e.removeEventListener("pointerup",m),e.removeEventListener("pointercancel",h),l()}}const yo="huelite.sfx",wo="huelite.vol",bo=(e,t)=>{try{return localStorage.getItem(e)??t}catch{return t}},xo=(e,t)=>{try{localStorage.setItem(e,t)}catch{}};let de=null,je=null,Jt=null,Xe=bo(yo,"on")!=="off",et=Math.min(1,Math.max(0,parseFloat(bo(wo,"0.7"))||.7));const Mo=2.6;let he=72;const Ne=[];let vo=!1;const Pn={},ur={prep:72,solve:76,export:79},ye=e=>440*Math.pow(2,(e-69)/12),dr=e=>Math.min(1,Math.max(0,+e||0));function pr(e){je=e.createGain(),je.gain.value=et*Mo;const t=e.createDynamicsCompressor();t.threshold.value=-16,t.knee.value=18,t.ratio.value=6,t.attack.value=.003,t.release.value=.14,je.connect(t),t.connect(e.destination),Jt=e.createBuffer(1,e.sampleRate,e.sampleRate);const n=Jt.getChannelData(0);let o=1234567;for(let r=0;r<n.length;r++)o=o*1664525+1013904223>>>0,n[r]=o/2147483648-1}function ko(e,t){const n=performance.now();for(;Ne.length&&Ne[0]<n;)Ne.shift();Ne.push(n+(Math.max(0,e-(de?.currentTime??e))+t+.05)*1e3),Ne.sort((o,r)=>o-r)}const fr=()=>{const e=performance.now();return Ne.filter(t=>t>e).length};function Fo(){if(de)return de;const e=typeof window<"u"&&(window.AudioContext||window.webkitAudioContext);if(!e)return null;try{de=new e({latencyHint:"interactive"})}catch{return null}return pr(de),de}function ie(e,{f:t=440,to:n=0,type:o="sine",dur:r=.1,vol:a=.15,a:s=.004,lp:l=0,q:c=.7,det:i=0}){if(!de)return;const u=de.createOscillator(),p=de.createGain();if(u.type=o,u.detune.value=i,u.frequency.setValueAtTime(t,e),n&&u.frequency.exponentialRampToValueAtTime(Math.max(20,n),e+r),p.gain.setValueAtTime(1e-4,e),p.gain.linearRampToValueAtTime(a,e+s),p.gain.exponentialRampToValueAtTime(1e-4,e+r),l){const m=de.createBiquadFilter();m.type="lowpass",m.frequency.value=l,m.Q.value=c,u.connect(m),m.connect(p)}else u.connect(p);p.connect(je),ko(e,r),u.start(e),u.stop(e+r+.03)}function jn(e,{dur:t=.08,vol:n=.08,type:o="bandpass",f:r=1e3,to:a=0,q:s=1,a:l=.003}){if(!de)return;const c=de.createBufferSource(),i=de.createBiquadFilter(),u=de.createGain();c.buffer=Jt,c.loop=!0,i.type=o,i.Q.value=s,i.frequency.setValueAtTime(r,e),a&&i.frequency.exponentialRampToValueAtTime(Math.max(20,a),e+t),u.gain.setValueAtTime(1e-4,e),u.gain.linearRampToValueAtTime(n,e+l),u.gain.exponentialRampToValueAtTime(1e-4,e+t),c.connect(i),i.connect(u),u.connect(je),ko(e,t),c.start(e),c.stop(e+t+.03)}const hr=(e,t,n,o)=>t.forEach((r,a)=>o(e+a*n,r,a)),mr={tap:{gap:40,fn(e){ie(e,{f:760,to:620,dur:.05,vol:.08})}},select:{gap:150,fn(e){ie(e,{f:880,to:1046,dur:.075,vol:.11})}},on:{gap:150,fn(e){ie(e,{f:660,dur:.07,vol:.09}),ie(e+.06,{f:990,dur:.1,vol:.09})}},tab:{gap:60,fn(e){ie(e,{f:ye(he),dur:.07,vol:.13}),ie(e+.045,{f:ye(he+5),dur:.1,vol:.12})}},pageFwd:{gap:200,fn(e){jn(e,{dur:.5,vol:.085,f:350,to:2600,q:2.5,a:.07}),ie(e,{f:160,to:430,type:"triangle",dur:.55,vol:.1,lp:1500,a:.06}),ie(e+.3,{f:ye(he+12),dur:.26,vol:.085}),ie(e+.38,{f:ye(he+19),dur:.22,vol:.05})}},pageBack:{gap:200,fn(e){jn(e,{dur:.5,vol:.085,f:2600,to:350,q:2.5,a:.07}),ie(e,{f:430,to:160,type:"triangle",dur:.55,vol:.1,lp:1500,a:.06}),ie(e+.28,{f:ye(he+12),dur:.26,vol:.08}),ie(e+.36,{f:ye(he+5),dur:.22,vol:.05})}},arrive:{gap:200,fn(e,t=3){for(let n=0;n<Math.min(6,t);n++)ie(e+.2+n*.075,{f:ye(he+12+[0,2,4,7,9,12][n]),dur:.13,vol:.032})}},blocked:{gap:250,fn(e){ie(e,{f:170,type:"square",dur:.07,vol:.065,lp:700}),ie(e+.1,{f:150,type:"square",dur:.09,vol:.065,lp:700})}},done:{gap:200,fn(e){ie(e,{f:ye(he+12),dur:.08,vol:.075}),ie(e+.075,{f:ye(he+19),dur:.14,vol:.075})}},success:{gap:300,fn(e){hr(e,[0,4,7],.08,(t,n)=>ie(t,{f:ye(he+12+n),type:"triangle",dur:.2,vol:.085}))}},error:{gap:300,fn(e){ie(e,{f:240,to:130,type:"sawtooth",dur:.18,vol:.06,lp:900}),ie(e+.16,{f:200,to:100,type:"sawtooth",dur:.22,vol:.06,lp:800})}}};let Eo=!1;const _r=new Set(["select","on"]);function _e(e,t,n=!1){if(!Xe||!vo||Eo&&!n&&!_r.has(e))return;const o=mr[e];if(!o)return;const r=Fo();if(!r)return;const a=typeof performance<"u"?performance.now():0;if(!(o.gap&&a-(Pn[e]||0)<o.gap)){if(Pn[e]=a,r.state!=="running"){r.resume().then(()=>{r.state==="running"&&performance.now()-a<500&&o.fn(r.currentTime+.006,t)}).catch(()=>{});return}fr()>44||o.fn(r.currentTime+.006,t)}}const yt=()=>Xe,gr=()=>et;function So(e){Xe=!!e,xo(yo,Xe?"on":"off"),Xe&&_e("on")}function yr(){return So(!Xe),Xe}function wr(e){et=dr(e),xo(wo,String(et)),je&&(je.gain.value=et*Mo)}function br(e){he=ur[e]??72}function xr(e){Eo=!!e}function Mr(){return(e=!0,t=!1)=>{e?t||_e("done"):_e("error")}}function vr(){const e=[["tap",0],["select",400],["tab",900],["pageFwd",1300],["pageBack",2100],["done",2900],["success",3300]];for(const[t,n]of e)setTimeout(()=>_e(t,void 0,!0),n)}if(typeof window<"u"){const e=()=>{vo=!0;const t=Fo();t?.state==="suspended"&&t.resume().catch(()=>{})};window.addEventListener("pointerdown",e,{capture:!0,passive:!0}),window.addEventListener("keydown",e,{capture:!0,passive:!0})}const kr="huelite",Fr=1;let $t=null;function Gt(){return $t||($t=new Promise((e,t)=>{const n=indexedDB.open(kr,Fr);n.onupgradeneeded=()=>{const o=n.result;o.objectStoreNames.contains("projects")||o.createObjectStore("projects",{keyPath:"id"}),o.objectStoreNames.contains("files")||o.createObjectStore("files")},n.onsuccess=()=>e(n.result),n.onerror=()=>t(n.error)}),navigator.storage?.persist?.().catch(()=>{})),$t}async function At(e,t,n){const o=await Gt();return new Promise((r,a)=>{const s=o.transaction(e,t);let l;s.oncomplete=()=>r(l),s.onerror=()=>a(s.error),s.onabort=()=>a(s.error||new Error("storage transaction aborted")),l=n(...[e].flat().map(c=>s.objectStore(c)))})}const dn=e=>new Promise((t,n)=>{e.onsuccess=()=>t(e.result),e.onerror=()=>n(e.error)});async function pn(){const e=await Gt();return(await dn(e.transaction("projects").objectStore("projects").getAll())).sort((n,o)=>(o.modified||"").localeCompare(n.modified||""))}async function fn(e,t=void 0){const n=t===void 0?await ut(e.id):null,o={id:e.id,data:JSON.parse(JSON.stringify(e)),modified:e.modified,thumb:t===void 0?n?.thumb??null:t};return At("projects","readwrite",r=>r.put(o))}const Ee=(e,t,n)=>At("files","readwrite",o=>o.put(n,`${e}/${t}`)),Xn=(e,t)=>At("files","readwrite",n=>n.delete(`${e}/${t}`));async function Ie(e,t){const n=await Gt();return dn(n.transaction("files").objectStore("files").get(`${e}/${t}`))}async function ut(e){const t=await Gt();return dn(t.transaction("projects").objectStore("projects").get(e))}async function Er(e){await At(["projects","files"],"readwrite",(t,n)=>{t.delete(e);for(const o of["source","prepped","solved","side"])n.delete(`${e}/${o}`)})}async function Go(e,t){const n=await ut(e);n&&(n.data.group=String(t||"").trim().slice(0,60),await fn(n.data))}async function In(e,t){for(const n of await pn())(n.data.group||"")===e&&await Go(n.id,t)}const Ao=[137,80,78,71,13,10,26,10],Sr={0:1,2:3,4:2,6:4};async function Gr(e,t){const n=new Response(new Blob([t]).stream().pipeThrough(e)).arrayBuffer();return new Uint8Array(await n)}function Ut(e,t){const n=new Uint8Array(12+t.length),o=new DataView(n.buffer);o.setUint32(0,t.length);for(let r=0;r<4;r++)n[4+r]=e.charCodeAt(r);return n.set(t,8),o.setUint32(8+t.length,so([n.subarray(4,8+t.length)])),n}async function Je({width:e,height:t,channels:n,depth:o=8,samples:r}){const a={1:0,2:4,3:2,4:6}[n],s=o/8,l=e*n*s,c=new Uint8Array((l+1)*t);for(let m=0;m<t;m++){const h=m*(l+1);if(c[h]=0,o===8)c.set(r.subarray(m*e*n,(m+1)*e*n),h+1);else for(let d=0;d<e*n;d++){const _=r[m*e*n+d];c[h+1+d*2]=_>>8,c[h+2+d*2]=_&255}}const i=new Uint8Array(13),u=new DataView(i.buffer);u.setUint32(0,e),u.setUint32(4,t),i[8]=o,i[9]=a;const p=await Gr(new CompressionStream("deflate"),c);return new Blob([new Uint8Array(Ao),Ut("IHDR",i),Ut("IDAT",p),Ut("IEND",new Uint8Array(0))],{type:"image/png"})}async function Bt(e){e=e instanceof Uint8Array?e:new Uint8Array(e);for(let x=0;x<8;x++)if(e[x]!==Ao[x])throw new Error("not a PNG");const t=new DataView(e.buffer,e.byteOffset,e.byteLength);let n=8,o=0,r=0,a=0,s=0,l=0;const c=[];for(;n<e.length;){const x=t.getUint32(n),P=String.fromCharCode(...e.subarray(n+4,n+8)),k=e.subarray(n+8,n+8+x);if(P==="IHDR")o=t.getUint32(n+8),r=t.getUint32(n+12),a=k[8],s=k[9],l=k[12];else if(P==="IDAT")c.push(k);else if(P==="IEND")break;n+=12+x}const i=Sr[s];if(!i||a!==8&&a!==16||l)throw new Error(`unsupported PNG (type ${s}, ${a}-bit${l?", interlaced":""})`);if(!o||!r||o*r>36e6||o*r*i*(a/8)>16e7)throw new Error("that image is too large");const u=new Uint8Array(c.reduce((x,P)=>x+P.length,0));let p=0;for(const x of c)u.set(x,p),p+=x.length;const m=await io("deflate",u,(o*i*a/8+1)*r+1024),h=i*a/8,d=o*h,_=new Uint8Array(d);let y=new Uint8Array(d);const F=a===8?new Uint8Array(o*r*i):new Uint16Array(o*r*i);for(let x=0;x<r;x++){const P=m[x*(d+1)],k=m.subarray(x*(d+1)+1,(x+1)*(d+1));for(let g=0;g<d;g++){const v=g>=h?_[g-h]:0,G=y[g],z=g>=h?y[g-h]:0;let E=k[g];if(P===1)E+=v;else if(P===2)E+=G;else if(P===3)E+=v+G>>1;else if(P===4){const w=Math.abs(G-z),M=Math.abs(v-z),T=Math.abs(v+G-2*z);E+=w<=M&&w<=T?v:M<=T?G:z}_[g]=E&255}if(a===8)F.set(_,x*d);else for(let g=0;g<d/2;g++)F[x*(d/2)+g]=_[g*2]<<8|_[g*2+1];y=_.slice()}return{width:o,height:r,channels:i,depth:a,samples:F}}function Ar(e){return String(e||"").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase()||"project"}const Lo={".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".webp":"image/webp",".heic":"image/heic",".gif":"image/gif",".bmp":"image/bmp"};function Co(e,t){const n=/\.[a-z0-9]+$/i.exec(e||"");if(n)return n[0].toLowerCase();const o=Object.entries(Lo).find(([,r])=>r===t);return o?o[0]:".jpg"}const Lr=async e=>new Uint8Array(await e.arrayBuffer());function Cr(e,t,n,o=256){const r=Math.min(t,n),a=t-r>>1,s=n-r>>1,l=new Uint8Array(o*o*3);for(let c=0;c<o;c++){const i=s+Math.min(r-1,Math.floor((c+.5)*r/o));for(let u=0;u<o;u++){const p=a+Math.min(r-1,Math.floor((u+.5)*r/o)),m=(i*t+p)*4,h=(c*o+u)*3;l[h]=e[m],l[h+1]=e[m+1],l[h+2]=e[m+2]}}return l}async function Tr({data:e,source:t,prepped:n=null,solved:o=null}){const r=Ar(e.name),a=Co(e.source?.filename,t?.type),s=JSON.parse(JSON.stringify(e));s.source={...s.source||{},filename:`source${a}`};const l=[],c=async(i,u)=>l.push({name:`${r}/${i}`,chunks:[typeof u=="string"?u:await Lr(u)]});if(t&&await c(`source${a}`,t),n){const{w:i,h:u,rgba:p,mask:m}=n,h=new Uint8Array(i*u*3);for(let d=0;d<i*u;d++)h[d*3]=p[d*4],h[d*3+1]=p[d*4+1],h[d*3+2]=p[d*4+2];if(await c("prepped.png",await Je({width:i,height:u,channels:3,samples:h})),await c("thumb.png",await Je({width:256,height:256,channels:3,samples:Cr(p,i,u)})),m){const d=new Uint8Array(i*u);for(let _=0;_<d.length;_++)d[_]=m[_]?255:0;await c("shape.png",await Je({width:i,height:u,channels:1,samples:d}))}}if(o&&n){const{w:i,h:u,heights:p}=o;await c("heightmap.png",await Je({width:i,height:u,channels:1,depth:16,samples:p}));const m=s.solve,{lut:h}=Ve(m.filaments,m.layer_height_mm,m.band_mode||"solid"),d=n.mask,_=d?4:3,y=new Uint8Array(i*u*_);for(let F=0;F<i*u;F++){const x=h[Math.min(h.length-1,p[F])];for(let P=0;P<3;P++)y[F*_+P]=Math.max(0,Math.min(255,Math.trunc(x[P])));d&&(y[F*_+3]=d[F]?255:0)}await c("preview.png",await Je({width:i,height:u,channels:_,samples:y}))}return await c("project.json",JSON.stringify(s,null,2)),{blob:await lo(l),filename:`${r}.huelite.zip`}}async function zr(e){const t=Ma(e),n=[...t.keys()].filter(h=>!h.startsWith("__MACOSX/")&&!h.split("/").pop().startsWith("._")),o=n.filter(h=>h.endsWith("project.json")).sort((h,d)=>h.length-d.length)[0];if(!o)throw new Error("no project.json in that zip - is it a HueLite project?");const r=o.slice(0,-12),a=async h=>t.has(r+h)?t.get(r+h)():null,s=Et(JSON.parse(new TextDecoder().decode(await a("project.json"))));let l=s.source?.filename;if((!l||!t.has(r+l))&&(l=n.map(h=>h.slice(r.length)).find(h=>/^source\.[a-z0-9]+$/i.test(h))),!l)throw new Error("the project's photo is missing from the zip");const c=await a(l),i=new Blob([c],{type:Lo[Co(l)]||"application/octet-stream"});let u=null,p=null;const m=await a("prepped.png");if(m){const h=await Bt(m);if(h.depth!==8)throw new Error("prepped.png should be 8-bit");const{width:d,height:_,channels:y,samples:F}=h,x=new Uint8ClampedArray(d*_*4);for(let v=0;v<d*_;v++){const G=y<3;x[v*4]=F[v*y],x[v*4+1]=F[v*y+(G?0:1)],x[v*4+2]=F[v*y+(G?0:2)],x[v*4+3]=255}let P=null;const k=await a("shape.png");if(k){const v=await Bt(k);if(v.width===d&&v.height===_){P=new Uint8Array(d*_);const G=v.depth===16?32768:128;for(let z=0;z<d*_;z++)P[z]=v.samples[z*v.channels]>=G?1:0}}u={w:d,h:_,rgba:x,mask:P};const g=await a("heightmap.png");if(g){const v=await Bt(g);if(v.width===d&&v.height===_){const G=new Uint16Array(d*_);for(let z=0;z<d*_;z++)G[z]=v.samples[z*v.channels];p={w:d,h:_,heights:G}}}}return{data:s,source:i,prepped:u,solved:p}}const f=(e,t={},...n)=>{const o=document.createElement(e);for(const[r,a]of Object.entries(t))r.startsWith("on")?o.addEventListener(r.slice(2),a):r==="class"?o.className=a:a===!0?o.setAttribute(r,""):a!==!1&&a!=null&&o.setAttribute(r,a);for(const r of n.flat())r!=null&&r!==!1&&o.append(r);return o},Pr=e=>/^#?[0-9a-f]{6}$/i.test(String(e).trim());function rt(e){const t=String(e).trim().replace("#","");return[0,2,4].map(n=>parseInt(t.slice(n,n+2),16))}function Kt(e){return"#"+e.map(t=>Math.round(Math.max(0,Math.min(255,t))).toString(16).padStart(2,"0").toUpperCase()).join("")}function $n(e,t,n){e/=255,t/=255,n/=255;const o=Math.max(e,t,n),r=Math.min(e,t,n),a=o-r;let s=0;return a&&(o===e?s=(t-n)/a%6:o===t?s=(n-e)/a+2:s=(e-t)/a+4,s*=60,s<0&&(s+=360)),[s,o?a/o:0,o]}function Un(e,t,n){const o=n*t,r=o*(1-Math.abs(e/60%2-1)),a=n-o,[s,l,c]=e<60?[o,r,0]:e<120?[r,o,0]:e<180?[0,o,r]:e<240?[0,r,o]:e<300?[r,0,o]:[o,0,r];return[(s+a)*255,(l+a)*255,(c+a)*255]}const jr=[["black","#101010"],["charcoal","#3A3A3A"],["grey","#808080"],["silver","#C4C4C4"],["white","#F2F4F0"],["red","#C8202A"],["orange","#F07C1E"],["yellow","#F2D21B"],["green","#2C7A2E"],["teal","#1C9C94"],["blue","#0B39B5"],["sky","#5AA9E6"],["purple","#6B3FA0"],["pink","#E8799F"],["brown","#6B4426"],["tan","#C8A27A"]];function To({min:e,max:t,step:n=1,value:o,onInput:r,track:a="",fmt:s=String}){const l=t-e,c=Math.max(n,Math.round(l/40));let i=Math.min(t,Math.max(e,o));const u=f("div",{class:"slider-fill"}),p=f("div",{class:"slider-bubble"}),m=f("div",{class:"slider-knob",role:"slider",tabindex:"0","aria-valuemin":String(e),"aria-valuemax":String(t)},f("i"),p),h=f("div",{class:`slider-track${a?" plain":""}`,style:a?`background:${a}`:null},u),d=f("div",{class:"slider"},h,m),_=v=>Math.min(t,Math.max(e,Math.round((v-e)/n)*n+e)),y=()=>{const v=l?(i-e)/l*100:0;u.style.width=`${v}%`,m.style.left=`${v}%`,m.setAttribute("aria-valuenow",String(i)),p.textContent=s(i)},F=(v,G=!0)=>{v=_(v),v!==i&&(i=v,y(),G&&r?.(i))};let x=null;m.addEventListener("pointerdown",v=>{try{m.setPointerCapture(v.pointerId)}catch{}x={id:v.pointerId,x:v.clientX,v:i},m.classList.add("held"),v.preventDefault()}),m.addEventListener("pointermove",v=>{!x||v.pointerId!==x.id||F(x.v+(v.clientX-x.x)/Math.max(1,d.clientWidth)*l)});const P=v=>{x&&v.pointerId===x.id&&(x=null,m.classList.remove("held"))};m.addEventListener("pointerup",P),m.addEventListener("pointercancel",P),m.addEventListener("keydown",v=>{const G={ArrowLeft:-n,ArrowDown:-n,ArrowRight:n,ArrowUp:n,PageDown:-c,PageUp:c}[v.key];G?(F(i+G),v.preventDefault()):v.key==="Home"?(F(e),v.preventDefault()):v.key==="End"&&(F(t),v.preventDefault())});const k=(v,G)=>{let z=0,E=0,w=!1;const M=()=>{clearTimeout(z),clearInterval(E)};return f("button",{class:"slider-step","aria-label":G,type:"button",onpointerdown:()=>{w=!1,z=setTimeout(()=>{w=!0,E=setInterval(()=>F(i+v*c),70)},450)},onpointerup:M,onpointercancel:M,onpointerleave:M,onclick:()=>{w||F(i+v*c),w=!1}},v<0?"−":"+")},g=f("div",{class:"slider-row"},k(-1,"decrease"),d,k(1,"increase"));return g.get=()=>i,g.set=(v,G=!1)=>F(v,G),y(),g}function Xr(e,t){const n=f("div",{class:"rail-thumb"},f("i")),o=f("div",{class:"rail-track"},n),r=f("button",{class:"rail-btn",type:"button","aria-label":"scroll up",onclick:()=>{m(),e.scrollBy({top:-e.clientHeight*.6,behavior:"smooth"})}},"▲"),a=f("button",{class:"rail-btn",type:"button","aria-label":"scroll down",onclick:()=>{m(),e.scrollBy({top:e.clientHeight*.6,behavior:"smooth"})}},"▼"),s=f("div",{class:"rail-tab",role:"button","aria-label":"show or hide the scroll bar"},f("i")),l=f("div",{class:"rail",hidden:!0,"data-tucked":"1"},s,r,o,a);t.append(l);let c=!1,i=0,u=!1;const p=()=>{const g=c||u||!!i;l.dataset.tucked=g?"":"1",t.dataset.rail=c?"open":""};function m(){clearTimeout(i),i=setTimeout(()=>{i=0,p()},1500),p()}const h=()=>{const g=e.scrollHeight,v=e.clientHeight,G=o.clientHeight,z=Math.min(G,Math.max(68,G*v/Math.max(1,g)));return{sh:g,ch:v,th:G,tH:z,travel:Math.max(1,G-z),span:Math.max(1,g-v)}},d=()=>{const g=e.scrollHeight,v=e.clientHeight,G=g>v+2&&v>40;if(l.hidden=!G,!G)return;l.style.top=`${e.offsetTop}px`,l.style.height=`${v}px`;const z=h();n.style.height=`${z.tH}px`,n.style.transform=`translateY(${e.scrollTop/z.span*z.travel}px)`};let _=null;n.addEventListener("pointerdown",g=>{try{n.setPointerCapture(g.pointerId)}catch{}_={id:g.pointerId,y:g.clientY,top:e.scrollTop,g:h()},u=!0,n.classList.add("held"),p(),g.preventDefault()}),n.addEventListener("pointermove",g=>{!_||g.pointerId!==_.id||(e.scrollTop=_.top+(g.clientY-_.y)/_.g.travel*_.g.span)});const y=g=>{_&&g.pointerId===_.id&&(_=null,u=!1,n.classList.remove("held"),m())};n.addEventListener("pointerup",y),n.addEventListener("pointercancel",y),o.addEventListener("pointerdown",g=>{if(g.target!==o)return;m();const v=n.getBoundingClientRect();e.scrollBy({top:(g.clientY<v.top?-1:1)*e.clientHeight*.9,behavior:"smooth"})});let F=null;s.addEventListener("pointerdown",g=>{try{s.setPointerCapture(g.pointerId)}catch{}F={id:g.pointerId,x:g.clientX,moved:!1},g.preventDefault()}),s.addEventListener("pointermove",g=>{if(!F||g.pointerId!==F.id)return;const v=g.clientX-F.x;Math.abs(v)<14||(F.moved=!0,c=v<0,c&&(clearTimeout(i),i=0),p(),F.x=g.clientX)});const x=g=>{!F||g.pointerId!==F.id||(!F.moved&&g.type==="pointerup"&&(c=!c,c&&(clearTimeout(i),i=0),p()),F=null)};s.addEventListener("pointerup",x),s.addEventListener("pointercancel",x);const P=()=>{d(),m()};e.addEventListener("scroll",P,{passive:!0});const k=new ResizeObserver(d);return k.observe(e),e.firstElementChild&&k.observe(e.firstElementChild),window.addEventListener("resize",d),requestAnimationFrame(d),{update:d,destroy(){clearTimeout(i),k.disconnect(),window.removeEventListener("resize",d),e.removeEventListener("scroll",P),delete t.dataset.rail,l.remove()}}}function Ir({title:e,hex:t,printedAs:n,palette:o=[],photo:r=null,onChange:a,onClose:s}){let l=t.toUpperCase(),[c,i,u]=$n(...rt(l));const p=A=>{const j=f("b",{},"");return{box:f("div",{class:"big-sw"},f("span",{},A),j),b:j}},m=p("filament · exported"),h=p("prints as"),d=f("canvas",{class:"sv"}),_=f("div",{class:"sv-knob"}),y=f("div",{class:"sv-box"},d,_),F=()=>{const A=d.clientWidth,j=d.clientHeight;if(!A||!j)return;const $=window.devicePixelRatio||1;d.width=Math.round(A*$),d.height=Math.round(j*$);const U=d.getContext("2d"),R=U.createLinearGradient(0,0,d.width,0);R.addColorStop(0,"#fff"),R.addColorStop(1,Kt(Un(c,1,1))),U.fillStyle=R,U.fillRect(0,0,d.width,d.height);const D=U.createLinearGradient(0,0,0,d.height);D.addColorStop(0,"rgba(0,0,0,0)"),D.addColorStop(1,"#000"),U.fillStyle=D,U.fillRect(0,0,d.width,d.height),_.style.left=`${i*100}%`,_.style.top=`${(1-u)*100}%`},x=f("input",{class:"val hex-in",value:l,maxlength:"7",autocapitalize:"characters",autocomplete:"off",spellcheck:"false","aria-label":"hex colour"}),P=To({min:0,max:360,value:Math.round(c),track:"linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",onInput:A=>{c=A,g()}}),k=(A=!1)=>{m.box.style.background=l,m.box.style.color=Bn(l)>140?"#111":"#f2f2ea",m.b.textContent=l;const j=n?n(l):l;j?(h.box.style.background=j,h.box.style.color=Bn(j)>140?"#111":"#f2f2ea",h.b.textContent=j===l?"same":j):(h.box.style.background="transparent",h.box.style.color="var(--muted)",h.b.textContent="no layers"),A||(x.value=l)};function g(){l=Kt(Un(c,i,u)),F(),k(),a?.(l)}function v(A,j){l=A.toUpperCase();const[$,U,R]=$n(...rt(l));U>.02&&R>.02&&(c=$),i=U,u=R,P.set(Math.round(c),!1),F(),k(j==="hex"),a?.(l)}x.addEventListener("input",()=>{const A=x.value.trim();Pr(A)&&v("#"+A.replace("#",""),"hex")}),x.addEventListener("blur",()=>{x.value=l});let G=!1;const z=A=>{const j=d.getBoundingClientRect();i=Math.min(1,Math.max(0,(A.clientX-j.left)/j.width)),u=1-Math.min(1,Math.max(0,(A.clientY-j.top)/j.height)),g()};y.addEventListener("pointerdown",A=>{y.setPointerCapture(A.pointerId),G=!0,z(A),A.preventDefault()}),y.addEventListener("pointermove",A=>{G&&z(A)}),y.addEventListener("pointerup",()=>{G=!1}),y.addEventListener("pointercancel",()=>{G=!1});const E=A=>f("div",{class:"pal"},A.map(([j,$])=>f("button",{class:"pal-sw",type:"button",title:j||$,"aria-label":j||$,style:`background:${$}`,onclick:()=>v($,"pal")})));let w=null;if(r){const A=f("canvas",{class:"eye"}),j=f("div",{class:"eye-ring"}),$=f("div",{class:"eye-box"},A,j);A.width=r.canvas.width,A.height=r.canvas.height,A.getContext("2d").drawImage(r.canvas,0,0),$.style.aspectRatio=`${r.canvas.width} / ${r.canvas.height}`;let U=!1;const R=D=>{const X=A.getBoundingClientRect(),b=Math.min(1,Math.max(0,(D.clientX-X.left)/X.width)),I=Math.min(1,Math.max(0,(D.clientY-X.top)/X.height)),Z=r.sample(b,I);j.style.left=`${b*100}%`,j.style.top=`${I*100}%`,j.hidden=!1,Z&&v(Z,"eye")};j.hidden=!0,$.addEventListener("pointerdown",D=>{$.setPointerCapture(D.pointerId),U=!0,R(D),D.preventDefault()}),$.addEventListener("pointermove",D=>{U&&R(D)}),$.addEventListener("pointerup",()=>{U=!1}),$.addEventListener("pointercancel",()=>{U=!1}),w=[f("div",{class:"sheet-head"},"[ tap your photo to pick ]"),$]}const M=()=>{document.removeEventListener("keydown",T),S.remove(),s?.()},T=A=>{A.key==="Escape"&&M()};document.addEventListener("keydown",T);const N=f("div",{class:"sheet",role:"dialog","aria-label":e},f("div",{class:"sheet-bar"},f("b",{},e),f("button",{class:"sheet-x",type:"button","aria-label":"close",onclick:M},"✕")),f("div",{class:"sheet-swatches"},m.box,h.box),y,f("div",{class:"sheet-row"},P),f("label",{class:"field"},"hex",x),o.length?[f("div",{class:"sheet-head"},"[ from your photo ]"),E(o.map(A=>["",A]))]:null,w,f("div",{class:"sheet-head"},"[ common ]"),E(jr),f("button",{class:"btn primary sheet-done",type:"button",onclick:M},"done")),S=f("div",{class:"sheet-backdrop",onpointerdown:A=>{A.target===S&&M()}},N);return document.body.append(S),requestAnimationFrame(()=>{F(),k()}),new ResizeObserver(F).observe(d),{close:M}}function Bn(e){const[t,n,o]=rt(e);return .2126*t+.7152*n+.0722*o}function $r({title:e,folders:t,current:n="",onPick:o,onClose:r}){const a=h=>{h.key==="Escape"&&s()};function s(){document.removeEventListener("keydown",a),m.remove(),r?.()}const l=h=>{s(),o(h)},c=(h,d)=>f("button",{class:`chip${d===n?" on":""}`,type:"button",onclick:()=>l(d)},h),i=f("input",{class:"val wide-val",placeholder:"new folder name",maxlength:"40",autocomplete:"off","aria-label":"new folder name"}),u=()=>{const h=i.value.trim();h&&l(h.slice(0,40))};i.addEventListener("keydown",h=>{h.key==="Enter"&&u()}),document.addEventListener("keydown",a);const p=f("div",{class:"sheet",role:"dialog","aria-label":e},f("div",{class:"sheet-bar"},f("b",{},e),f("button",{class:"sheet-x",type:"button","aria-label":"close",onclick:s},"✕")),f("div",{class:"sheet-head"},"[ file under ]"),f("div",{class:"chips"},c("no folder",""),t.map(h=>c(h,h))),f("div",{class:"sheet-head"},"[ or a new folder ]"),f("div",{class:"row"},i,f("button",{class:"btn",type:"button",onclick:u},"create"))),m=f("div",{class:"sheet-backdrop",onpointerdown:h=>{h.target===m&&s()}},p);return document.body.append(m),{close:s}}const me=document.getElementById("app"),zo=360,Ur=320,Br=420;let K=null,Le="free",ht="sim",Rn=0,we={detail:"standard",formats:{"3mf":!0,stl:!1}};const Te=vt;let be=[],Fe="crop",Ce=null,mt="cut",De=!1,_t="top",Ze=null,tt=null,nt="rise";const st=[],ne=e=>f("div",{class:"section-head"},`[ ${e} ]`),Se=(e,...t)=>f("div",{class:"frame"},f("i"),f("i"),f("i"),f("i"),e?f("div",{class:"frame-caption"},e):null,...t),Lt=e=>f("dl",{class:"kv"},e.flatMap(([t,n])=>[f("dt",{},t),f("dd",{},n)]));function fe(e,...t){const n=t.flat(1/0).filter(a=>a!=null&&a!==!1);if(!e.split(" ").includes("ctrl"))return f("div",{class:`pane ${e}`},...n);const o=f("div",{class:"ctrl-inner"});let r=null;for(const a of n)(!r||a instanceof Element&&a.classList.contains("section-head"))&&(r=f("div",{class:"group"}),o.append(r)),r.append(a);return f("div",{class:`pane ${e}`},o)}const Rr=()=>new Promise(e=>requestAnimationFrame(()=>setTimeout(e,0)));function xe(e){const t=document.createElement("canvas");return t.width=e.width,t.height=e.height,t.getContext("2d").putImageData(e,0,0),t}function it(e,t,n,o=null){const r=o?new ImageData(new Uint8ClampedArray(o.data),t,n):new ImageData(t,n),a=Math.max(3,Math.round(t/40));for(let s=0;s<n;s++)for(let l=0;l<t;l++){const c=s*t+l;if(e[c])continue;const i=Math.floor(l/a)+Math.floor(s/a)&1?44:28;r.data.set([i,i,i-3,o?255:240],c*4)}return r}function Rt(e,[t,n,o,r],a){const s=Math.min(1,a/Math.max(o,r)),l=Math.max(1,Math.round(o*s)),c=Math.max(1,Math.round(r*s)),i=document.createElement("canvas");i.width=l,i.height=c;const u=i.getContext("2d",{willReadFrequently:!0});return u.imageSmoothingQuality="high",u.drawImage(e,t,n,o,r,0,0,l,c),u.getImageData(0,0,l,c)}function pe(e,t,n){const o=f("div",{class:"chips"});for(const r of e){const a=f("button",{class:`chip${r.key===t?" on":""}`,disabled:r.disabled||!1,title:r.tip||null,onclick:()=>{o.querySelectorAll(".chip").forEach(s=>s.classList.remove("on")),a.classList.add("on"),n(r.key)}},r.label);o.append(a)}return o}function Oe(e,t,{step:n,min:o,max:r,fmt:a=l=>String(l),onchange:s}){return f("label",{class:"field"},e,f("input",{class:"val",type:"number",inputmode:"decimal",step:n,min:o,max:r,value:a(t),onchange:l=>{const c=Math.min(r,Math.max(o,parseFloat(l.target.value))),i=Number.isFinite(c)?c:t;l.target.value=a(i),s(i)}}))}function He(e,t,{min:n,max:o,step:r=1,fmt:a,oninput:s,key:l=!1}){const c=f("span",{class:"range-val"},a(t));return f("div",{class:`range${l?" key":""}`},f("div",{class:"range-head"},f("span",{},e),c),To({min:n,max:o,step:r,value:t,fmt:a,onInput:i=>{c.textContent=a(i),s(i)}}))}const Dr={prep:"crop, orient, size and shape the source",solve:"filament stack and depth",export:"mesh, package, and send to the printer"};let Dn;function le(e,t=1800){/couldn't|can't|failed|too big|missing|damaged|unsupported/i.test(e)&&_e("error");let n=document.querySelector(".toast");n||(n=f("div",{class:"toast"}),document.body.append(n)),n.textContent=e,n.classList.add("show"),clearTimeout(Dn),Dn=setTimeout(()=>n.classList.remove("show"),t)}function Po(e,t=!1){return f("div",{class:`loader${t?" mini":""}`,role:"status"},f("div",{class:"stack"},f("i"),f("i"),f("i"),f("i"),f("b",{class:"nozzle"})),f("div",{class:"loader-label"},e.replace(/[….]+$/,""),f("span",{class:"dots"},f("i",{},"."),f("i",{},"."),f("i",{},"."))))}function hn(e,t="swap"){e.classList.remove(t),e.offsetWidth,e.classList.add(t)}async function We(e,t,{quiet:n=!1}={}){const o=f("div",{class:"veil"},Po(e));document.body.append(o);const r=Mr();await Rr();try{const a=await t();return r(!0,n),a}catch(a){throw r(!1),a}finally{o.remove()}}async function jo(e){const t=Math.min(1,256/Math.max(e.width,e.height)),n=document.createElement("canvas");n.width=Math.max(1,Math.round(e.width*t)),n.height=Math.max(1,Math.round(e.height*t));const o=n.getContext("2d",{willReadFrequently:!0});return o.drawImage(e,0,0,n.width,n.height),Kn(o.getImageData(0,0,n.width,n.height).data)}const Ct=f("input",{type:"file",accept:"image/*",hidden:!0,onchange:async e=>{const t=e.target.files?.[0];if(e.target.value="",!!t)try{const n=await to(t);C.sourceBitmap?.close?.(),C.sourceBitmap=n,C.sourceHasAlpha=await jo(n);const o=(t.name||"photo").replace(/\.[^.]+$/,"");C.project=qn(o),C.project.source={filename:t.name,width_px:n.width,height_px:n.height},C.sourceHasAlpha&&(C.project.prep.shape.mode="alpha"),C.prepped=C.proxy=C.solved=null,C.sourceFile=t,be=[],Le="free",Fe="crop",Ce=null,ke("prep"),await Ee(C.project.id,"source",t),await Be(await lt(n))}catch(n){console.error(n),le("Couldn't open that photo")}}});document.body.append(Ct);let Qt=0;function Nr(){clearTimeout(Qt),Qt=setTimeout(()=>Be(),700)}async function Be(e=void 0){if(clearTimeout(Qt),!!C.project){C.project.modified=new Date().toISOString().slice(0,19);try{await fn(C.project,e)}catch(t){console.error(t),le("couldn't save - is the phone's storage full?",3e3)}}}for(const e of["input","change","click","pointerup"])me.addEventListener(e,Nr);document.addEventListener("visibilitychange",()=>{document.hidden&&Be()});function lt(e){const t=document.createElement("canvas");t.width=t.height=256;const n=Math.min(e.width,e.height);return t.getContext("2d").drawImage(e,(e.width-n)/2,(e.height-n)/2,n,n,0,0,256,256),new Promise(o=>t.toBlob(o,"image/png"))}function Xo(e,t){const n=e.width,o=e.height,r=Math.min(1,zo/Math.max(n,o)),a=Math.max(1,Math.round(n*r)),s=Math.max(1,Math.round(o*r)),l=document.createElement("canvas");l.width=a,l.height=s;const c=l.getContext("2d",{willReadFrequently:!0});return c.imageSmoothingQuality="high",c.drawImage(e,0,0,a,s),{data:c.getImageData(0,0,a,s),mask:eo(t,n,o,a,s),w:a,h:s}}async function en(e){await We("opening…",async()=>{const t=await ut(e),n=await Ie(e,"source");if(!t||!n){le("That project is missing its photo",2600);return}const o=await to(n);C.sourceBitmap?.close?.(),C.sourceBitmap=o,C.sourceFile=n,C.sourceHasAlpha=await jo(o),C.project=Et(t.data),C.prepped=C.proxy=C.solved=null;const r=C.project.status.prep===oe?await Ie(e,"prepped"):null;if(r){const l=document.createElement("canvas");l.width=r.w,l.height=r.h;const c=new ImageData(new Uint8ClampedArray(r.rgba),r.w,r.h);l.getContext("2d").putImageData(c,0,0),C.prepped={canvas:l,data:c,mask:r.mask||null,w:r.w,h:r.h},C.proxy=Xo(l,C.prepped.mask)}else C.project.status.prep===oe&&Ue("prep",ue);const a=C.prepped&&C.project.status.solve===oe?await Ie(e,"solved"):null;if(a){const{s:l,lh:c,mode:i}=ve();C.solved={heights:a.heights,w:a.w,h:a.h,lut:Ve(l.filaments,c,i).lut}}else C.project.status.solve===oe&&Ue("solve",ue);be=[],Fe="crop",Ce=null,Le="free";const s=C.project.status;ke(s.solve===oe?"export":s.prep===oe?"solve":"prep")},{quiet:!0})}async function Or(e,t){const n=new File([e],t,{type:e.type||"application/octet-stream"});try{if(navigator.canShare?.({files:[n]})){await navigator.share({files:[n],title:t});return}}catch(a){if(a?.name==="AbortError")return}const o=URL.createObjectURL(n),r=f("a",{href:o,download:t});document.body.append(r),r.click(),r.remove(),setTimeout(()=>URL.revokeObjectURL(o),6e4),le(`saved ${t} to downloads`,2600)}async function tn(e){C.project?.id===e&&await Be();const t=await We("packing project…",async()=>{const n=await ut(e),[o,r,a]=await Promise.all(["source","prepped","solved"].map(l=>Ie(e,l))),s=n.data.status;return Tr({data:n.data,source:o,prepped:s.prep===oe?r:null,solved:s.prep===oe&&s.solve===oe?a:null})}).catch(n=>(console.error(n),le(`couldn't pack it: ${n.message}`,3e3),null));t&&await Or(t.blob,t.filename)}async function Zr(e){await We("importing…",async()=>{if(e.size>400*1024*1024)throw new Error("that file is too big to be a HueLite project");const{data:t,source:n,prepped:o,solved:r}=await zr(await e.arrayBuffer());(!t.id||await ut(t.id))&&(t.id&&(t.name=`${t.name} (copy)`),t.id=Vn()),o?r||(t.status={...t.status,solve:ue,export:ue}):t.status={prep:ue,solve:ue,export:ue},await Ee(t.id,"source",n),o&&await Ee(t.id,"prepped",o),r&&await Ee(t.id,"solved",r);let a=null;if(o){const s=new ImageData(new Uint8ClampedArray(o.rgba),o.w,o.h);a=await lt(xe(o.mask?it(o.mask,o.w,o.h,s):s))}else a=await lt(await createImageBitmap(n));await fn(t,a),le(`imported "${t.name}"`,2400)}).catch(t=>{console.error(t),le(`couldn't import: ${t.message}`,3600)}),Ge()}const mn=f("input",{type:"file",accept:".zip,application/zip",hidden:!0,onchange:e=>{const t=e.target.files?.[0];e.target.value="",t&&Zr(t)}});document.body.append(mn);async function Hr(){await Be(),C.sourceBitmap?.close?.(),C.sourceBitmap=null,C.sourceFile=null,C.project=C.prepped=C.proxy=C.solved=null,be.forEach(e=>URL.revokeObjectURL(e.url)),be=[],ze="main",ke("prep")}const re={side:!1,dual:!1,short:!1};function Io(){const e=window.innerWidth,t=window.innerHeight,n=e/Math.max(1,t),o=e>=560&&n>=.85;return{side:o,dual:o&&t>=780,short:t<520}}function $o(e){Object.assign(re,e);const t=document.documentElement;t.dataset.side=re.side?"1":"",t.dataset.dual=re.dual?"1":"",t.dataset.short=re.short?"1":""}let Nn=0;function Uo(){clearTimeout(Nn),Nn=setTimeout(()=>{const e=document.activeElement;if(e&&(e.tagName==="INPUT"||e.tagName==="TEXTAREA"))return;const t=Io(),n=t.side!==re.side||t.dual!==re.dual||t.short!==re.short,o=me.querySelector(".pane.ctrl")?.scrollTop||0;if($o(t),n){Ge();const r=me.querySelector(".pane.ctrl");r&&(r.scrollTop=o)}K?.relayout(),Ze?.update()},150)}window.addEventListener("resize",Uo);window.addEventListener("orientationchange",Uo);$o(Io());function Ge(){st.splice(0).forEach(p=>p()),tt?.close(),tt=null,K?.destroy(),K=null,Ze?.destroy(),Ze=null,me.innerHTML="",nt?me.dataset.enter=nt:delete me.dataset.enter,nt=null,me.dataset.stage=C.stage,document.documentElement.dataset.stage=C.stage,br(C.stage);const e=!C.project;me.dataset.home=e?"1":"";const t=C.project?.name||"menu";xr(e),document.documentElement.dataset.menu=e&&ze==="main"?"1":"";const n=ce.indexOf(C.stage)+1,o=f("header",{class:"top"},f("div",{class:"top-row"},f("h1",{class:"stage-title"},e?Zn[ze][0]:`0${n} ${$e[C.stage]}`),f("div",{class:"top-right"},ls(),C.project?f("button",{class:"brand link",onclick:Hr},"☰ menu"):ze!=="main"?f("button",{class:"brand link",onclick:()=>Qe("main")},"‹ menu"):null)),e?f("div",{class:"top-sub"},Zn[ze][1]):f("div",{class:"top-sub"},f("span",{class:"proj",onclick:Yr},t),f("span",{class:"dotsep"},"·"),Dr[C.stage])),r=f("main",{class:"screen"}),a=f("div",{class:"action"});({prep:Vr,solve:as,export:ss})[C.stage](r,a);const s=f("div",{class:"dock"},a.childElementCount?a:null,e?null:Bo()),l=f("div",{class:"body"},r);me.append(o,l,s);const c=r.querySelector(".pane.ctrl");c&&(Ze=Xr(c,r));const i=r.querySelectorAll(".ctrl-inner > .group");i.forEach((p,m)=>p.style.setProperty("--i",String(Math.min(m,9))));const u=me.dataset.enter;if(C.project&&(u==="fwd"||u==="back")&&(_e(u==="fwd"?"pageFwd":"pageBack"),_e("arrive",i.length)),C.project&&ct("swipe","on")!=="off"){const p=ce.indexOf(C.stage);st.push(cr(l,{drag:r,canGo:m=>!!ce[p+m]&&Ot(ce[p+m]),onGo:m=>ke(ce[p+m]),onBlocked:m=>{const h=ce[p+m];h&&!Ot(h)&&(_e("blocked"),le(`Finish ${$e[an[h]]} first`))}}))}}function Bo(){return f("nav",{class:"stepper"},ce.map((e,t)=>{const n=C.project?.status[e]===oe,o=!Ot(e),r=["step",e===C.stage&&"active",n&&"done",o&&"locked"].filter(Boolean).join(" ");return f("button",{class:r,onclick:()=>{if(o)return _e("blocked"),le(`Finish ${$e[an[e]]} first`);ke(e)}},f("span",{class:"num"},`0${t+1}`),$e[e])}))}function _n(){me.querySelector(".stepper")?.replaceWith(Bo())}function ke(e){const t=ce.indexOf(C.stage),n=ce.indexOf(e);nt=C.project&&t!==n?n>t?"fwd":"back":"rise",C.stage=e,Ge()}function Yr(){if(!C.project)return;const e=prompt("Project name",C.project.name);e&&e.trim()&&(C.project.name=e.trim(),Ge())}function Vr(e,t){if(!C.sourceBitmap){Jr(e);return}const n=C.project.prep;n.shape={...Zt,...n.shape||{}},Array.isArray(n.shape.cuts)||(n.shape.cuts=[]);const o=()=>{C.project.status.prep===oe&&(Ue("prep",ue),_n())},r=f("div"),a=f("div"),s=f("p",{class:"meta shape-note"},"");let l=null;const c=L=>{const[,,B,H]=n.crop||K?.getCrop()||[0,0,1,1];return Math.max(20,Math.min(L,Math.floor(Te/Math.max(1,H/B))))},i=L=>{const[,,B,H]=L,W=Math.min(1,Ye/Math.max(B,H)),Q=n.physical_width_mm*(H/B),ee=n.physical_width_mm>Te+.5||Q>Te+.5;a.replaceChildren(Lt([["crop",`${B} × ${H} px`],["solve",`${Math.round(B*W)} × ${Math.round(H*W)} px`],["print",`${n.physical_width_mm.toFixed(0)} × ${Q.toFixed(0)} mm${ee?"  ⚠ bigger than the 256 mm A1 plate":""}`]]))},u=(L,[B,H,W,Q])=>{if(d(),n.shape.mode==="rect"&&!n.shape.cuts.length)return s.textContent="prints the whole crop",null;const ee=Rt(L,[B,H,W,Q],Ur),te=nn(ee,[B,H,W,Q]);return s.textContent=ns(n.shape.mode,te),te?xe(it(te,ee.width,ee.height)):null},p=f("div",{class:"result-view"});let m=0;const h=()=>{if(!K||p.hidden)return;const L=K.getCrop(),B=Rt(K.oriented(),L,Br),H=nn(B,L);Yt(B);const W={...Ke,...n.adjustments},Q=Math.round(L[2]*Math.min(1,Ye/Math.max(L[2],L[3]))),ee=B.width/Math.max(1,Q);if(W.pixelize>0){const Tt=(1+W.pixelize*23)*ee;W.pixelize=Math.max(0,Math.min(1,(Tt-1)/23))}if(W.denoise>.01&&ee<1){const Tt=Math.max(1,Math.round(W.denoise*4));W.denoise=Math.max(1,Math.round(Tt*ee))/4}const te=_o(B,W),se=new ImageData(te.data,te.width,te.height),ge=xe(H?it(H,se.width,se.height,se):se);ge.className="preview-out",p.replaceChildren(ge)},d=()=>{clearTimeout(m),m=setTimeout(h,120)};let _=!1;requestAnimationFrame(()=>{K=ea(r,C.sourceBitmap,{rotateDeg:n.rotate_deg,flipH:n.flip_h,crop:n.crop,onChange:B=>{n.crop=B,i(B),_&&o()}});const L=zt.find(B=>B.key===Le);L?.ratio&&K.setAspect(L.ratio),K.setOverlay(u),n.crop=K.getCrop(),i(n.crop),_=!0,F(Fe)});const y=pe([{key:"crop",label:"crop"},{key:"result",label:"result"}],Fe,L=>F(L));function F(L){L!=="crop"&&U&&J(!1);const B=Fe;Fe=L,r.hidden=!re.dual&&L!=="crop",p.hidden=!re.dual&&L!=="result",y.querySelectorAll(".chip").forEach((H,W)=>H.classList.toggle("on",W===0==(L==="crop"))),p.hidden||h(),!re.dual&&B!==L&&hn(L==="crop"?r:p)}const x=()=>{o(),!re.dual&&Fe!=="result"?F("result"):d()},P=()=>pe(zt.map(L=>({key:L.key,label:L.label})),Le,L=>{Le=L,K?.setAspect(zt.find(B=>B.key===L).ratio)});let k=P();const g=He("background tolerance",Math.round(n.shape.tolerance*100),{min:0,max:100,fmt:L=>`${L}%`,oninput:L=>{n.shape.tolerance=L/100,o(),K?.refreshOverlay()}});g.hidden=n.shape.mode!=="knockout";const v=pe([{key:"rect",label:"rectangle",tip:"The whole crop prints, edge to edge."},{key:"ellipse",label:"circle / oval",tip:"A circle or oval filling the crop. 1:1 for a true circle."},{key:"alpha",label:"cut-out",disabled:!C.sourceHasAlpha,tip:C.sourceHasAlpha?"Cut to the image's own transparency.":"Needs a PNG with a transparent background."},{key:"knockout",label:"knock out bg",tip:"Remove a plain background around the subject."}],n.shape.mode,L=>{if(n.shape.mode=L,g.hidden=L!=="knockout",L==="ellipse"&&Le==="free"){Le="1:1",K?.setAspect(1);const B=P();k.replaceWith(B),k=B}o(),K?.refreshOverlay()});n.adjustments={...Ke,...n.adjustments||{}};const G=f("p",{class:"meta"},"the closer the source looks to a flat painting, the cleaner the 3D solve. try a preset or let it suggest."),z=(L,B)=>{n.adjustments={...Ke,...L};const[H,W]=[S(),A()];j.replaceWith(H),$.replaceWith(W),j=H,$=W,B&&(G.textContent=B),x()},E=f("button",{class:"chip",disabled:!Ce,onclick:()=>{Ce&&(z(Ce,"back to what you had before suggest"),Ce=null,E.disabled=!0)}},"↺ undo suggest"),w={poster:"smoothed, a little punchier, 12 colours",painterly:"soft with edges kept, 18 colours",flat:"bold shapes only, 6 colours",pixel:"mosaic blocks, 8 colours"},M=f("div",{class:"chips"},Object.keys(qt).map(L=>f("button",{class:"chip",onclick:()=>z(qt[L],`preset: ${L} - ${w[L]}`)},L)),f("button",{class:"chip accent",onclick:()=>{if(!K)return;Ce={...n.adjustments},E.disabled=!1;const L=Rt(K.oriented(),K.getCrop(),400);Yt(L);const{adjustments:B,reasons:H}=Ha(L);z(B,`suggested - ${H.join("; ")}`)}},"suggest for print"),E),T=L=>L?`${L>0?"+":""}${L}`:"0",N=(L,B,H,W,Q,{scale:ee=100,key:te=!1}={})=>He(L,Math.round(n.adjustments[B]*ee),{min:H,max:W,fmt:Q,key:te,oninput:se=>{n.adjustments[B]=se/ee,x()}}),S=()=>f("div",{},He("decimate",n.adjustments.decimate||1,{min:1,max:32,key:!0,fmt:L=>L>=2?`${L} colours`:"off",oninput:L=>{n.adjustments.decimate=L>=2?L:0,x()}}),N("saturation","saturation",-100,100,T,{key:!0})),A=()=>f("div",{},N("brightness","brightness",-60,60,T),N("contrast","contrast",-60,60,T),N("denoise","denoise",0,100,L=>L?`${L}%`:"off"),N("sharpen","sharpen",0,100,L=>L?`${L}%`:"off"),N("pixelize","pixelize",0,100,L=>L?`${Math.round(1+L/100*23)} px blocks`:"off"),f("button",{class:"btn wide",style:"margin-top:8px",onclick:()=>z(Ke,"adjustments reset")},"reset adjustments"));let j=S(),$=A(),U=!1,R=null;const D=[{key:"cut",label:"cut away",tip:"Remove what's inside the loop."},{key:"back",label:"put back",tip:"Restore what a cut took away."},{key:"only",label:"keep only",tip:"Keep what's inside the loop, remove everything else."}],X=f("p",{class:"meta"},""),b=f("button",{class:"btn wide lasso-btn",type:"button",onclick:()=>J(!U)},""),I=f("button",{class:"chip",type:"button",onclick:()=>{n.shape.cuts.length&&(n.shape.cuts.pop(),q())}},"↶ undo"),Z=f("button",{class:"chip",type:"button",onclick:()=>{n.shape.cuts.length&&(n.shape.cuts.length>1&&!confirm(`Remove all ${n.shape.cuts.length} cuts?`)||(n.shape.cuts=[],q()))}},"clear"),V=pe(D,mt,L=>{mt=L,K?.setLassoTool(L)}),O=f("div",{class:"lasso-bar",hidden:!0},V,f("div",{class:"chips"},I,Z,f("button",{class:"chip accent",type:"button",onclick:()=>J(!1)},"done")));function Y(){const L=n.shape.cuts.length;b.textContent=U?"✓ done lassoing":"✂ lasso cut",b.classList.toggle("on",U),I.disabled=!L,Z.disabled=!L,X.textContent=U?"draw a loop around the part to change with your finger. it works on top of the shape above.":L?`${L} cut${L===1?"":"s"} so far. start the lasso to chip away more.`:"draw around anything you don't want printed. each loop chips a bit more away - undo steps back."}function q(){o(),K?.refreshOverlay(),Y()}function J(L){if(L&&!K)return;U=L;const B=document.documentElement;L?(!re.dual&&Fe!=="crop"&&F("crop"),re.side||(R=B.dataset.big||"",B.dataset.big="1"),K.setLasso({tool:mt,onStroke:H=>{n.shape.cuts.push({tool:mt,pts:H}),q()}})):(K?.setLasso(null),R!==null&&(B.dataset.big=R,R=null)),O.hidden=!L,Y(),requestAnimationFrame(()=>{K?.relayout(),Ze?.update()})}Y(),st.push(()=>{R!==null&&(document.documentElement.dataset.big=R)}),e.append(re.dual?fe("view",Se("crop",r),Se("result",p),O):fe("view",f("div",{class:"view-bar"},y,gn()),Se(null,r,p),O),fe("ctrl",ne("colour & detail"),j,M,G,ne("fine tune"),$,ne("crop"),f("div",{class:"row"},f("button",{class:"btn grow",onclick:()=>{n.rotate_deg=(n.rotate_deg+270)%360,K?.setOrientation(n.rotate_deg,n.flip_h)}},"↺ rotate"),f("button",{class:"btn grow",onclick:()=>{n.flip_h=!n.flip_h,K?.setOrientation(n.rotate_deg,n.flip_h)}},"⇋ flip"),f("button",{class:"btn grow",onclick:()=>K?.reset()},"reset")),f("div",{class:"gap-top"},k),a,ne("shape"),v,f("div",{class:"gap-top"},g),s,!C.sourceHasAlpha&&f("p",{class:"meta"},"tip: a PNG with a transparent background prints as exactly that outline."),ne("lasso cut"),b,X,ne("print size"),l=Oe("width (mm)",n.physical_width_mm,{step:"1",min:20,max:Te,onchange:L=>{L=c(L),l.querySelector("input").value=String(L),n.physical_width_mm=L,i(n.crop),o(),K?.refreshOverlay()}}),f("p",{class:"meta"},"the A1 plate is 256 × 256 mm, and 256 mm tall"))),t.append(f("button",{class:"btn ghost",onclick:()=>Ct.click()},"new photo"),f("button",{class:"btn primary",onclick:os},"prep  &  continue  →"))}function gn(){const e=document.documentElement;return f("button",{class:"big-btn",type:"button","aria-label":"bigger or smaller preview",title:"bigger / smaller preview",onclick:()=>{e.dataset.big=e.dataset.big==="1"?"":"1",requestAnimationFrame(()=>{K?.relayout(),Ze?.update()})}},"⤢")}const ct=(e,t)=>{try{return localStorage.getItem(`huelite.${e}`)??t}catch{return t}},Ft=(e,t)=>{try{localStorage.setItem(`huelite.${e}`,t)}catch{}},qr=`<svg viewBox="0 0 160 100" aria-hidden="true">
  <polygon points="22,56 100,38 142,52 64,74" fill="#2b2b28" stroke="#55554d" stroke-width="1.2" stroke-dasharray="4 3"/>
  <polygon points="22,56 64,74 64,83 22,65" fill="#222220" stroke="#55554d" stroke-width="1.2" stroke-dasharray="4 3"/>
  <polygon points="64,74 142,52 142,61 64,83" fill="#1b1b19" stroke="#55554d" stroke-width="1.2" stroke-dasharray="4 3"/>
</svg>`;async function Wr(e){const[t,n]=await Promise.all([Ie(e.id,"prepped"),Ie(e.id,"solved")]);if(!t||!n)return null;const o=e.data,r=o.solve.layer_height_mm,{lut:a}=Ve(o.solve.filaments,r,o.solve.band_mode||"solid");return go({heights:n.heights,w:n.w,h:n.h,mask:t.mask||null,lut:a,layerH:r,baseMm:o.solve.base_layers*r,physicalW:o.prep.physical_width_mm,maxCols:320})}let On=Promise.resolve();function Jr(e){({main:Hn,projects:Kr,settings:Qr,help:es,about:ts}[ze]||Hn)(e)}function Kr(e){const t=ct("view","list")==="album",n=f("div",{class:"home-list"},Po("loading projects",!0)),o=new Set((()=>{try{return JSON.parse(ct("collapsed","[]"))}catch{return[]}})()),r=()=>Ft("collapsed",JSON.stringify([...o])),a=pe([{key:"list",label:"list"},{key:"album",label:"album"}],t?"album":"list",c=>{Ft("view",c),Ge()}),s=f("button",{class:"btn wide",type:"button",onclick:()=>Ct.click()},"+ new from a photo");e.append(fe("ctrl",f("div",{class:"home-bar"},ne("saved prints"),a),s,n,ne("files"),f("button",{class:"btn wide",onclick:()=>mn.click()},"import a project (.zip)"),f("p",{class:"meta"},"zip a project folder on the Mac (Finder › Compress) and open it here, or save one from here and unzip it into Documents/HueLite/projects on the Mac.")));const l=()=>pn().then(c=>{const i=c.map(k=>({...k,data:Et(k.data)}));if(!i.length){n.replaceChildren(f("p",{class:"meta"},"nothing saved yet - projects you start are kept on this phone."));return}const u=[...new Set(i.map(k=>k.data.group).filter(Boolean))].sort((k,g)=>k.localeCompare(g)),p=()=>l(),m=k=>$r({title:k.data.name,folders:u,current:k.data.group,onPick:async g=>{await Go(k.id,g),p()}}),h=async k=>{confirm(`Delete "${k.data.name}" from this phone? This can't be undone.`)&&(await Er(k.id),Ge())},d=k=>{const g=ce.find(G=>k.data.status[G]!==oe);return`${(k.modified||"").replace("T","  ").slice(0,17)} · ${g?`next: ${$e[g].toLowerCase()}`:"complete"}`},_=k=>f("span",{class:"pips"},ce.map(g=>f("i",{class:k.data.status[g]===oe?"on":""},$e[g]))),y=k=>{const g=f("img",{class:"thumb",alt:""});return k.thumb&&(g.src=URL.createObjectURL(k.thumb)),f("div",{class:"project"},f("button",{class:"project-open",onclick:()=>en(k.id)},g,f("span",{class:"project-text"},f("b",{},k.data.name),f("span",{class:"meta"},d(k)),_(k))),f("button",{class:"project-del",title:"move to a folder",onclick:()=>m(k)},"move"),f("button",{class:"project-del",title:"save as .zip",onclick:()=>tn(k.id)},"zip"),f("button",{class:"project-del",title:"delete",onclick:()=>h(k)},"✕"))},F=k=>{const g=f("img",{alt:"",class:"side-img"}),v=f("div",{class:"ph"});v.innerHTML=qr;const G=f("div",{class:"card-art"},v,g,f("span",{class:"ph-cap"},k.data.status.solve===oe?"":"not solved yet"));return k.data.status.solve===oe&&(On=On.then(async()=>{let z=await Ie(k.id,"side");if(z||(z=await Wr(k),z&&await Ee(k.id,"side",z)),z){const E=URL.createObjectURL(z);g.onload=()=>{G.classList.add("has-art"),URL.revokeObjectURL(E)},g.src=E}}).catch(z=>console.warn("no side view for",k.data.name,z))),f("div",{class:"card"},f("button",{class:"card-open",onclick:()=>en(k.id)},G,f("span",{class:"card-text"},f("b",{},k.data.name),f("span",{class:"meta"},d(k)),_(k))),f("div",{class:"card-tools"},f("button",{type:"button",onclick:()=>m(k)},"move"),f("button",{type:"button",onclick:()=>tn(k.id)},"zip"),f("button",{type:"button",onclick:()=>h(k)},"delete")))},x=(k,g)=>f("div",{class:"group-head"},f("button",{class:"group-toggle",type:"button",onclick:()=>{o.has(k)?o.delete(k):o.add(k),r(),p()}},`${o.has(k)?"▸":"▾"}  ${k||"no folder"}  (${g})`),k?f("button",{class:"chip",type:"button",onclick:async()=>{const v=prompt("Folder name",k);v!==null&&(await In(k,v.trim().slice(0,60)),p())}},"rename"):null,k?f("button",{class:"chip",type:"button",onclick:async()=>{confirm(`Take everything out of "${k}"? The projects stay; only the folder goes.`)&&(await In(k,""),p())}},"ungroup"):null),P=[];for(const k of[...u,""]){const g=i.filter(v=>v.data.group===k);g.length&&(u.length&&P.push(x(k,g.length)),o.has(k)||P.push(f("div",{class:t?"album-grid":"projects"},g.map(t?F:y))))}n.replaceChildren(...P)}).catch(c=>{console.error(c),n.replaceChildren(f("p",{class:"meta"},"couldn't read saved projects on this browser."))});l()}let ze="main";const Zn={main:["Main menu","photo → layered print"],projects:["Projects","your saved prints"],settings:["Settings","sound, motion and gestures"],help:["Help","how HueLite works"],about:["About","version and privacy"]};function Qe(e){nt=e==="main"?"back":"fwd",ze=e,Ge()}const Ae=(e,t,n,o,r="")=>f("button",{class:`menu-item ${r}`,type:"button",onclick:o},f("span",{class:"mi-n"},e),f("span",{class:"mi-t"},f("b",{},t),f("span",{class:"meta"},n)),f("span",{class:"mi-go"},"›"));function Hn(e){let t=null;const n=Ae("▶","Continue","",()=>t&&en(t.id),"menu-continue lead");n.hidden=!0;const o=Ae("02","Projects","your saved prints, folders and album",()=>Qe("projects")),r=f("div",{class:"menu-list"},n,Ae("01","New project","start from a photo",()=>Ct.click()),o,Ae("03","Import a project","open a .zip from the Mac",()=>mn.click()),Ae("04","Settings","sound, motion, gestures",()=>Qe("settings")),Ae("05","Help","how it works, gestures, tips",()=>Qe("help")),Ae("06","About","version and privacy",()=>Qe("about")));r.querySelectorAll(".menu-item").forEach((a,s)=>a.style.setProperty("--i",String(s))),e.append(fe("view",Se(null,f("div",{class:"hero"},f("div",{class:"hero-mark"},f("i"),f("i"),f("i"),f("i"),f("i")),f("div",{class:"hero-word"},"HUELITE"),f("div",{class:"hero-tag"},"photo → layered print"),f("div",{class:"hero-sub"},"multi-colour relief prints for the Bambu Lab A1")))),fe("ctrl",r,f("p",{class:"stamp"},"build 2026-10-31 02:16Z"))),pn().then(a=>{if(!a.length)return;const s=a[0],l=Et(s.data);t=s;const c=ce.find(i=>l.status[i]!==oe);n.querySelector(".meta").textContent=`${l.name} · ${c?`next: ${$e[c].toLowerCase()}`:"complete"}`,n.hidden=!1,o.querySelector(".meta").textContent=`${a.length} saved · folders and album`}).catch(a=>console.error(a))}function Qr(e){const t=(o,r)=>ct(o,r),n=f("p",{class:"meta"},"checking…");navigator.storage?.estimate?.().then(({usage:o=0,quota:r=0})=>{const a=s=>s/1048576>=1024?`${(s/1073741824).toFixed(1)} GB`:`${(s/1048576).toFixed(1)} MB`;n.textContent=`projects use ${a(o)} of ${a(r)} this browser allows`}).catch(()=>{n.textContent="storage size isn't available in this browser"}),navigator.storage?.estimate||(n.textContent="storage size isn't available in this browser"),e.append(fe("ctrl",ne("sound"),pe([{key:"on",label:"sound on"},{key:"off",label:"sound off"}],yt()?"on":"off",o=>So(o==="on")),He("volume",Math.round(gr()*100),{min:0,max:100,fmt:o=>`${o}%`,oninput:o=>wr(o/100)}),f("button",{class:"btn wide gap-top",type:"button",onclick:()=>vr()},"play a demo"),f("p",{class:"meta"},"sounds are for moving between stages, a quiet tick on buttons, and finishing jobs. the main menu, sliders and scroll bar are always silent. the ♪ button in the corner mutes everything."),ne("motion"),pe([{key:"full",label:"full"},{key:"calm",label:"calm"}],t("motion","full"),o=>{Ft("motion",o),on()}),f("p",{class:"meta"},"calm turns off the slides, fades and loaders (also followed automatically if the phone asks for reduced motion)."),ne("gestures"),pe([{key:"on",label:"swipe between stages"},{key:"off",label:"swipe off"}],t("swipe","on"),o=>Ft("swipe",o)),f("p",{class:"meta"},"swipe left or right on blank screen to go to the next or previous stage. takes effect on the next screen."),ne("storage"),n,f("p",{class:"meta"},"projects live in this browser on this phone only. zip a project to keep a copy elsewhere."),ne("reset"),f("button",{class:"btn wide",type:"button",onclick:()=>{if(confirm("Reset sound, motion, gesture and view settings? Your projects are not touched.")){for(const o of["sfx","vol","motion","swipe","view","collapsed"])try{localStorage.removeItem(`huelite.${o}`)}catch{}on(),location.reload()}}},"reset settings")))}function es(e){const t=(n,o)=>[f("p",{class:"note"},f("b",{},n+"  "),o)];e.append(fe("ctrl",ne("the three steps"),t("01 Prep","crop the photo, choose its shape (rectangle, oval, cut-out, or lasso your own), set the print width, and shape the picture. decimate (how many colours) and saturation matter most."),t("02 Solve",'choose up to four filaments. "fit colours to photo" picks the colours that make the printed stack look most like your photo. layers per filament set the thickness; print, angle, height and photo views show the result.'),t("03 Export","check cost and size, pick the mesh detail, and save a Bambu .3mf (or STL) for the A1. open it in Bambu Studio."),ne("moving around"),f("ul",{class:"tips"},f("li",{},"tap the stage tabs at the bottom, or swipe left and right on blank screen."),f("li",{},"a stage unlocks when the one before it is finished."),f("li",{},"☰ menu (top right) saves and returns here; projects are kept automatically."),f("li",{},"the grip on the right edge slides the scroll bar out; scrolling does too."),f("li",{},"sliders: drag the handle, or use − and +. hold − or + to repeat.")),ne("on the picture"),f("ul",{class:"tips"},f("li",{},"crop: drag the box and its corners."),f("li",{},"lasso cut: draw a loop. cut away, put back, or keep only what's inside. undo steps back."),f("li",{},"3D angle view: drag to turn, pinch to zoom, double-tap to reset.")),ne("tips"),f("ul",{class:"tips"},f("li",{},"the flatter the photo looks (try the presets), the cleaner the print."),f("li",{},"translucent blend mixes colours like layered filament; solid bands keep each colour pure."),f("li",{},"a thin print can curl: add base depth or layers if Solve says so."),f("li",{},"the A1 plate is 256 × 256 mm; a print wider or taller than that is flagged."),f("li",{},"add to home screen for a full-screen app that works offline."))))}function ts(e){e.append(fe("ctrl",ne("HueLite"),f("p",{class:"note"},"turns a photo into a layered, multi-colour relief print for the Bambu Lab A1, entirely on this phone."),Lt([["version","build 2026-10-31 02:16Z"],["runs","offline, in this browser"],["exports",".3mf (Bambu) and .stl"]]),ne("privacy"),f("p",{class:"note"},"photos and projects never leave this phone: there is no account, no server and no tracking. files are only shared when you export or zip a project."),ne("source"),f("a",{class:"btn wide",href:"https://github.com/billywilliamsspacecop-web/huelite-mobile",target:"_blank",rel:"noopener noreferrer"},"github.com/billywilliamsspacecop-web/huelite-mobile")))}function nn(e,t){const n=C.project.prep,o={tolerance:n.shape.tolerance,pxPerMm:e.width/n.physical_width_mm,minFeatureMm:n.shape.min_feature_mm};let r=Jo(n.shape.mode,e,o);const a=n.shape.cuts;if(a?.length&&K){const[s,l,c,i]=t,{width:u,height:p}=e;r=Wo(r,u,p,a,(m,h)=>{const[d,_]=K.toOriented(m,h);return[(d-s)*u/c,(_-l)*p/i]}),r=Qn(r,u,p,o.pxPerMm,o.minFeatureMm)}return r}function ns(e,t){if(!t)return"prints the whole crop";const n=rn(t);return n<.01?"nothing left to print - lower the tolerance, or undo a cut":e==="knockout"&&n>.985?"no background found - raise the tolerance, or crop tighter":`prints ${(n*100).toFixed(0)}% of the crop · checkered = no plate`}async function os(){if(!K)return;const e=C.project.prep;await We("prepping…",async()=>{const t=K.output(Ye),n=t.width,o=t.height,r=t.getContext("2d",{willReadFrequently:!0}),a=r.getImageData(0,0,n,o),s=nn(a,K.getCrop());if(s&&rn(s)<.01){le("The shape left nothing to print",2600);return}Yt(a);const l=_o(a,e.adjustments),c=new ImageData(l.data,n,o);r.putImageData(c,0,0),C.prepped={canvas:t,data:c,mask:s,w:n,h:o},C.proxy=Xo(t,s),C.solved=null,e.output_px=[n,o],Ue("prep",oe);const i=C.project.id;await Ee(i,"prepped",{w:n,h:o,rgba:c.data,mask:s}),await Xn(i,"solved"),await Xn(i,"side");const u=s?xe(it(s,n,o,c)):t;await Be(await lt(u)),ke("solve")},{quiet:!0})}function ve(){const e=C.project.solve,t=e.layer_height_mm;return{s:e,lh:t,baseLayers:Math.max(2,e.base_layers|0),mode:e.band_mode||"solid",mm:C.project.prep.physical_width_mm}}function Ro({data:e,mask:t,w:n,h:o}){const{s:r,lh:a,mode:s,mm:l}=ve(),{lut:c}=Ve(r.filaments,a,s);let i=oa(e.data,n,o,c,{dither:r.dither!=="none",amount:r.dither_amount??1});i=bn(i,t),i=aa(i,n,o,l/Math.max(1,n),r.slope_mm_per_layer??0);const u=r.border||{};return(u.mode||"raised")!=="none"&&(i=ra(i,n,o,{widthPx:Math.round((u.width_mm??3)*n/Math.max(1e-6,l)),mode:u.mode||"raised",rimLayers:sn(r.filaments,u.frame_slot??1),maxLayers:c.length-1,mask:t})),i=bn(i,t),{heights:i,lut:c,w:n,h:o}}function as(e,t){if(!C.prepped){e.append(f("div",{class:"todo"},f("b",{},"nothing prepped"),"Go back to Prep and continue from there."));return}const{s:n}=ve(),o=wt.map(S=>S.hex.toUpperCase());!n.colours_seeded&&n.filaments.every((S,A)=>S.hex.toUpperCase()===o[A])&&Dt(),n.colours_seeded=!0;const r=f("div",{class:"solve-view"});let a=null;const s=()=>(a===null&&(a=un()||!1,a&&st.push(()=>a.destroy())),a),l=f("div",{class:"ramp"}),c=f("div");let i=null;const u=()=>{C.project.status.solve===oe&&(Ue("solve",ue),_n())},p=S=>{const{lh:A,baseLayers:j,mm:$}=ve(),{proxy:U}=C,R=j*A;let D;if(S==="source"){const X=new ImageData(new Uint8ClampedArray(U.data.data),U.w,U.h);if(U.mask)for(let b=0;b<U.mask.length;b++)U.mask[b]||X.data.set([17,17,16,255],b*4);D=xe(X)}else if(S==="height")D=xe(ga({heights:i.heights,w:U.w,h:U.h,mask:U.mask}));else if(S==="oblique"){const X=s();if(X)return X.set({heights:i.heights,w:U.w,h:U.h,mask:U.mask,lut:i.lut,layerH:A,baseMm:R,physicalW:$,maxCols:zo}),X.el;D=ro({heights:i.heights,w:U.w,h:U.h,lut:i.lut,mask:U.mask,baseHex:n.filaments[0].hex,layerH:A,baseMm:R,physicalW:$,targetWidth:640,maxCols:180,shaded:De})}else D=xe(ln({heights:i.heights,w:U.w,h:U.h,lut:i.lut,mask:U.mask,layerH:A,baseMm:R,cellMm:$/U.w,shaded:De}));return D.className="preview-out",D},m=()=>{if(!i)return;const S=[p(ht)];re.dual&&S.push(p(ht==="oblique"?"sim":"oblique")),r.replaceChildren(...S)},h=()=>{i=Ro(C.proxy);const{lh:S,baseLayers:A,mm:j}=ve(),$=la(n.filaments,S,A),U=ua(i.lut),R=n.border.mode||"raised",D=$.base_mm+sn(n.filaments,n.border.frame_slot??1)*S,X=R==="raised"?`rim ${D.toFixed(2)} mm`:R==="flush"?"flush edge":"no border",b=$.colour_layers-U+1,I=C.project.prep.shape?.mode||"rect";c.replaceChildren(Lt([["total",`${$.total_layers} layers · ${$.total_mm.toFixed(2)} mm`],["base",`${$.base_mm.toFixed(2)} mm (${A} layers)`],["outline",C.prepped.mask?`${Wn[I]} (${(rn(C.prepped.mask)*100).toFixed(0)}% of crop)`:"rectangle"],["edge",X],["rigidity",ca($.base_mm,$.base_mm,j)],["distinct",`${U} of ${$.colour_layers+1} tones${b>6?` · ${b} duplicated, trim a band`:""}`]])),l.replaceChildren(...i.lut.map(Z=>f("i",{style:`background:${ot(Z)}`}))),g(),m()},d=()=>{u(),clearTimeout(Rn),Rn=setTimeout(h,150)},_=pe([{key:"sim",label:"print"},{key:"oblique",label:"angle"},{key:"height",label:"height"},{key:"source",label:"photo"}],ht,S=>{ht=S,m(),hn(r)}),y=f("button",{class:`chip${De?" on":""}`,type:"button",title:"Relief lighting on the top-down print. Off shows every tone flat, exactly as it prints.",onclick:()=>{De=!De,y.classList.toggle("on",De),m()}},"light"),F=(S,A)=>{const j=n.filaments.map((R,D)=>D===S?{...R,hex:A}:R);if(!(j[S].band_layers|0))return null;const{lut:$}=Ve(j,n.layer_height_mm,n.band_mode||"solid"),U=j.slice(0,S+1).reduce((R,D)=>R+(D.band_layers|0),0);return ot($[Math.min($.length-1,U)].map(Math.round))},x=()=>{const{w:S,h:A,data:j,mask:$}=C.prepped,U=Math.min(1,640/Math.max(S,A)),R=Math.max(1,Math.round(S*U)),D=Math.max(1,Math.round(A*U)),X=document.createElement("canvas");X.width=R,X.height=D;const b=xe(j),I=X.getContext("2d");if(I.imageSmoothingQuality="high",I.drawImage(b,0,0,R,D),$){const Z=I.getImageData(0,0,R,D),V=eo($,S,A,R,D);I.putImageData(it(V,R,D,Z),0,0)}return{canvas:X,sample(Z,V){const O=Math.min(S-1,Math.floor(Z*S)),Y=Math.min(A-1,Math.floor(V*A));let q=0,J=0,L=0,B=0;for(let H=-2;H<=2;H++)for(let W=-2;W<=2;W++){const Q=O+W,ee=Y+H;if(Q<0||ee<0||Q>=S||ee>=A)continue;const te=ee*S+Q;$&&!$[te]||(q+=j.data[te*4],J+=j.data[te*4+1],L+=j.data[te*4+2],B++)}return B?Kt([q/B,J/B,L/B]):null}}},P=(S,A,j)=>{tt?.close(),tt=Ir({title:`slot ${S.slot} colour`,hex:S.hex,printedAs:$=>F(A,$),palette:no(C.prepped.data.data,C.prepped.mask,12),photo:x(),onChange:$=>{S.hex=$,S.name="",n.colours_auto=!1,j.style.background=$,j.setAttribute("aria-label",`slot ${S.slot} colour ${$}`),d()},onClose:()=>{tt=null}})};let k=[];const g=()=>{k.forEach((S,A)=>{const j=n.filaments[A],$=j&&F(A,j.hex),U=j&&rt(j.hex);S.hidden=!$||rt($).every((R,D)=>Math.abs(R-U[D])<=3),$&&(S.style.background=$)})},v=()=>{n.colours_auto&&(Dt(),E())},G=()=>(k=[],f("div",{class:"fil-table"},f("span"),f("span",{class:"th"},"colour"),f("span",{class:"th"},"TD mm"),f("span",{class:"th"},"layers"),n.filaments.flatMap((A,j)=>{const $=f("i",{class:"pr",hidden:!0});return k.push($),[f("span",{class:"idx"},String(A.slot)),f("button",{class:"sw",type:"button",style:`background:${A.hex}`,"aria-label":`slot ${A.slot} colour ${A.hex}`,onclick:U=>P(A,j,U.currentTarget)},$),f("input",{class:"val",type:"number",inputmode:"decimal",step:"0.05",min:"0.05",max:"6",value:Number(A.td_mm).toFixed(2),onchange:U=>{const R=Math.min(6,Math.max(.05,parseFloat(U.target.value)||A.td_mm));A.td_mm=R,U.target.value=R.toFixed(2),v(),d()}}),f("input",{class:"val",type:"number",inputmode:"numeric",step:"1",min:"0",max:"120",value:String(A.band_layers),onchange:U=>{const R=Math.min(120,Math.max(0,parseInt(U.target.value,10)||0));A.band_layers=R,U.target.value=String(R),v(),d()}})]})));let z=G();const E=()=>{const S=G();z.replaceWith(S),z=S},w=Oe("rim width (mm)",n.border.width_mm??3,{step:"0.5",min:.4,max:15,onchange:S=>{n.border.width_mm=S,d()}}),M=Oe("frame colour (slot)",n.border.frame_slot??1,{step:"1",min:1,max:n.filaments.length,onchange:S=>{n.border.frame_slot=Math.round(S),d()}}),T=re.side&&!re.short,N=[l,f("p",{class:"meta"},"reachable tones, bottom layer to top")];e.append(fe("view",f("div",{class:"view-bar"},_,y,re.side?null:gn()),Se(null,r),f("div",{class:"below-view"},N,T?c:null)),fe("ctrl",T?null:[ne("summary"),c],ne("filaments"),f("p",{class:"meta"},"slot 1 prints lowest · tap a swatch to choose its colour"),z,f("button",{class:"btn wide gap-top",onclick:()=>{Dt(),E(),d()}},"fit colours to photo"),f("p",{class:"meta"},"picks the filament colours that make the printed stack look most like your prepped photo. the strip under a swatch is what that band really prints as."),ne("layers"),Oe("layer height (mm)",n.layer_height_mm,{step:"0.02",min:.04,max:.3,fmt:S=>S.toFixed(2),onchange:S=>{n.layer_height_mm=S,d()}}),Oe("base depth (mm)",+(n.base_layers*n.layer_height_mm).toFixed(2),{step:"0.2",min:.4,max:8,fmt:S=>S.toFixed(2),onchange:S=>{n.base_layers=Math.max(2,sa(S,n.layer_height_mm)),d()}}),ne("colour"),pe([{key:"solid",label:"solid bands"},{key:"blend",label:"translucent blend"}],n.band_mode||"solid",S=>{n.band_mode=S,v(),d()}),f("div",{class:"gap-top"},pe([{key:"bayer8",label:"dither on"},{key:"none",label:"dither off"}],n.dither==="none"?"none":"bayer8",S=>{n.dither=S,d()})),He("dither amount",Math.round((n.dither_amount??1)*100),{min:0,max:200,fmt:S=>`${S}%`,oninput:S=>{n.dither_amount=S/100,d()}}),He("foundations",Math.round((n.slope_mm_per_layer??0)*100),{min:0,max:100,fmt:S=>S?`${(S/100).toFixed(2)} mm run / layer`:"off",oninput:S=>{n.slope_mm_per_layer=S/100,d()}}),ne("border"),pe([{key:"raised",label:"raised rim"},{key:"flush",label:"flush"},{key:"none",label:"none"}],n.border.mode||"raised",S=>{n.border.mode=S,n.border.enabled=S!=="none",d()}),C.prepped.mask&&f("p",{class:"meta"},"the rim follows the outline"),w,M)),t.append(f("button",{class:"btn ghost",onclick:()=>ke("prep")},"back to prep"),f("button",{class:"btn primary",onclick:rs},"solve  &  continue  →")),requestAnimationFrame(h)}function Dt(){const{s:e,lh:t,mode:n}=ve(),{data:o,mask:r}=C.prepped,a=no(o.data,r,e.filaments.length),s=e.filaments.map((c,i)=>a[i]??c.hex);da(o.data,r,e.filaments.map((c,i)=>({...c,hex:s[i]})),t,n,{start:s}).forEach((c,i)=>{e.filaments[i].hex=c,e.filaments[i].name=""}),e.colours_auto=!0}async function rs(){const{s:e,lh:t,baseLayers:n,mode:o}=ve();if(e.filaments.reduce((r,a)=>r+(a.band_layers|0),0)<2){le("Give at least one filament some layers",2400);return}await We("solving at full size…",async()=>{C.solved=Ro(C.prepped),e.base_layers=n,e.base_mm=+(n*t).toFixed(3),e.max_layers=C.solved.lut.length-1,e.band_mode=o,e.border.rim_layers=sn(e.filaments,e.border.frame_slot??1),e.swap_plan=ia(e.filaments,t,n),Ue("solve",oe),be=[];const{heights:r,w:a,h:s,lut:l}=C.solved;await Ee(C.project.id,"solved",{w:a,h:s,heights:r}),go({heights:r,w:a,h:s,mask:C.prepped.mask,lut:l,layerH:t,baseMm:n*t,physicalW:C.project.prep.physical_width_mm,maxCols:320}).then(i=>i&&Ee(C.project.id,"side",i)).catch(()=>{});const c=xe(ln({heights:r,w:a,h:s,lut:l,mask:C.prepped.mask,layerH:t,baseMm:n*t,cellMm:C.project.prep.physical_width_mm/a,shaded:!1}));await Be(await lt(c)),ke("export")},{quiet:!0})}function Yn(){const{s:e,lh:t,baseLayers:n,mm:o}=ve(),{heights:r,w:a,h:s}=C.solved;return{heights:r,w:a,h:s,mask:C.prepped.mask,physicalW:o,layerH:t,baseLayers:n,filaments:e.filaments,detail:we.detail,name:C.project.name}}function ss(e,t){if(!C.solved){e.append(f("div",{class:"todo"},f("b",{},"nothing solved"),"Go back to Solve and continue from there."));return}const{s:n,lh:o,baseLayers:r,mm:a}=ve(),{heights:s,w:l,h:c,lut:i}=C.solved,u=C.prepped.mask,p=C.project.export,m=xe(ln({heights:s,w:l,h:c,lut:i,mask:u,layerH:o,baseMm:r*o,cellMm:a/l,shaded:!1}));m.className="preview-out";let h;const d=un();d?(st.push(()=>d.destroy()),d.set({heights:s,w:l,h:c,mask:u,lut:i,layerH:o,baseMm:r*o,physicalW:a,maxCols:800}),h=d.el):(h=ro({heights:s,w:l,h:c,lut:i,mask:u,baseHex:n.filaments[0].hex,layerH:o,baseMm:r*o,physicalW:a,targetWidth:640}),h.className="preview-out");const _=f("p",{class:"meta"},"building mesh…"),y=()=>{const E=vn(Yn()),w=C.project.prep.shape?.mode||"rect";_.textContent=`${E.stats.parts} parts · ${E.stats.triangles.toLocaleString()} triangles · A1 plate · outline ${u?Wn[w]:"rectangle"}`},F=f("div"),x=()=>{const E=ya({heights:s,w:l,h:c,mask:u,filaments:n.filaments,layerH:o,baseLayers:r,physicalW:a,pricePerKg:p.price_per_kg??25,bandMode:n.band_mode}),[w,M]=E.footprint_mm,T=[];E.max_height_mm/Math.max(w,M)>.35&&T.push("tall for its footprint: add a brim in Studio"),Math.max(w,M)>Te+.5?T.push(`${w.toFixed(0)} × ${M.toFixed(0)} mm is bigger than the A1's ${Te} mm plate: go back to Prep and make it smaller`):Math.max(w,M)>Te-22&&T.push("this nearly fills the plate: in Studio you may need to move the prime tower"),E.switches>=6&&T.push(`${E.switches} colour changes is a lot of AMS time; keep spools dry`),T.push(`slot 1 (${E.base_hex}) touches the plate: set bed temp and adhesion for that filament`),T.push("wipe the plate with IPA before printing"),F.replaceChildren(Lt([["cost",`$${E.total_cost.toFixed(2)} · ${E.total_grams.toFixed(1)} g`],["purge",`${E.purge_g.toFixed(1)} g · ${E.switches} colour switch${E.switches===1?"":"es"}`],["size",`${w.toFixed(0)} × ${M.toFixed(0)} mm · ${E.max_height_mm.toFixed(2)} mm tall`]]),f("ul",{class:"tips"},T.map(N=>f("li",{},N))))},P=f("div"),k=()=>{P.replaceChildren(...be.length?[ne("files"),f("div",{class:"files"},be.map(E=>f("a",{class:"btn wide",href:E.url,download:E.name},`⬇  ${E.name}`))),f("p",{class:"meta"},"tap to save again. open the .3mf in Bambu Studio.")]:[])},g=f("input",{class:"val wide-val",value:C.project.name,onchange:E=>{const w=E.target.value.trim();w&&(C.project.name=w)}}),v=()=>{m.hidden=!re.dual&&_t!=="top",h.hidden=!re.dual&&_t!=="angle"},G=pe([{key:"top",label:"top down"},{key:"angle",label:"angle"}],_t,E=>{_t=E,v(),hn(E==="top"?m:h)});v(),e.append(re.dual?fe("view",Se("top down",m),Se("~30° from the plate",h),f("div",{class:"below-view"},_)):fe("view",f("div",{class:"view-bar"},G,gn()),Se(null,m,h),f("div",{class:"below-view"},_)),fe("ctrl",ne("filament slots"),f("div",{class:"slots"},n.filaments.map((E,w)=>f("div",{class:"slot"},f("span",{class:"sw",style:`background:${E.hex}`}),`slot ${E.slot}  ${E.hex}${w===0?" · lowest":w===n.filaments.length-1?" · top":""}`))),ne("filament & print info"),F,Oe("price ($ / kg)",p.price_per_kg??25,{step:"1",min:0,max:500,fmt:E=>E.toFixed(2),onchange:E=>{p.price_per_kg=E,x()}}),ne("mesh detail"),pe([{key:"draft",label:"draft"},{key:"standard",label:"standard"},{key:"fine",label:"fine"}],we.detail,E=>{we.detail=E,y()}),ne("formats"),f("div",{class:"chips"},[["3mf","3MF (Bambu)"],["stl","STL"]].map(([E,w])=>f("button",{class:`chip${we.formats[E]?" on":""}`,onclick:M=>{we.formats[E]=!we.formats[E],M.currentTarget.classList.toggle("on",we.formats[E])}},w))),ne("name"),g,P,ne("project"),f("button",{class:"btn wide",onclick:()=>tn(C.project.id)},"save whole project (.zip) for the Mac"))),t.append(f("button",{class:"btn ghost",onclick:()=>ke("solve")},"back to solve"),f("button",{class:"btn primary",onclick:()=>z()},"commit  &  export  →")),requestAnimationFrame(()=>{y(),x(),k()});async function z(){const E=Object.keys(we.formats).filter(T=>we.formats[T]);if(!E.length)return le("Choose 3MF, STL, or both");const w=(C.project.name||"huelite").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-|-$/g,"").toLowerCase()||"huelite",M=await We("building files…",async()=>{const T=vn(Yn());if(!T.parts.length)throw new Error("every filament band came out empty");const N=[];return E.includes("3mf")&&N.push(new File([await za(T,{colours:n.filaments.map(S=>S.hex),layerHeight:o})],`${w}.3mf`,{type:"model/3mf"})),E.includes("stl")&&N.push(new File([Pa(T)],`${w}.stl`,{type:"model/stl"})),N.push(new File([ja(n.filaments,{layerHeight:o})],`${w}-filament-slots.txt`,{type:"text/plain"})),N},{quiet:!0}).catch(T=>(le(`Export failed: ${T.message}`,3e3),null));M&&(be.forEach(T=>URL.revokeObjectURL(T.url)),be=M.map(T=>({name:T.name,url:URL.createObjectURL(T)})),p.formats=E,p.last_export={time:new Date().toISOString().slice(0,19),detail:we.detail,plate:"A1",name:C.project.name,files:M.map(T=>T.name)},Ue("export",oe),_n(),k(),_e("success"),await is(M))}}async function is(e){const t=e[0];try{if(navigator.canShare?.({files:e}))return await navigator.share({files:e,title:t.name}),le("shared");if(navigator.canShare?.({files:[t]}))return await navigator.share({files:[t],title:t.name}),le("shared")}catch(o){if(o?.name==="AbortError")return}const n=f("a",{href:be[0].url,download:t.name});document.body.append(n),n.click(),n.remove(),le(`saved ${t.name} to downloads`,2600)}function ls(){const e=()=>yt()?"♪":"♪ ✕",t=f("button",{class:"brand link snd-btn",type:"button","aria-label":"sound on or off",onclick:()=>{yr(),t.textContent=e(),t.classList.toggle("off",!yt())}},e());return t.classList.toggle("off",!yt()),t}function cs(e){const t=e.closest("button");return!t||t.disabled||t.closest(".loader, .toast")?null:C.project?t.matches(".slider-step, .pal-sw, .fil-table .sw, .rail-btn, .action .btn.primary")?null:t.matches(".step")?t.classList.contains("locked")?null:"tab":"tap":t.matches(".project-open, .card-open, .menu-continue")?"select":null}document.addEventListener("pointerdown",e=>{const t=cs(e.target);t&&_e(t)},!0);function on(){document.documentElement.dataset.motion=ct("motion","full")}on();Ge();function us(){document.querySelector(".update-bar")||document.body.append(f("div",{class:"update-bar"},f("span",{},"a new version of HueLite is ready"),f("button",{type:"button",onclick:()=>location.reload()},"reload")))}if("serviceWorker"in navigator){let e=!!navigator.serviceWorker.controller;navigator.serviceWorker.addEventListener("controllerchange",()=>{e&&us(),e=!0}),window.addEventListener("load",()=>{navigator.serviceWorker.register("./sw.js").then(t=>{const n=()=>t.update().catch(()=>{});document.addEventListener("visibilitychange",()=>{document.hidden||n()}),setInterval(n,1800*1e3)}).catch(t=>console.warn("offline mode unavailable",t))})}
