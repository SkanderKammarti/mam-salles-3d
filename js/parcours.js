/* ============================================================
   parcours.js — Visite cinématique 3D (Congrès / Cabinet d'architecte)
   La Maison Africaine du Médecin
   - Rendu réaliste type salles (sRGB, ACES, ombres) + clarté maximale
   - Assets 3D réels OBJ/GLB + textures quand disponibles
   ============================================================ */
(function () {
  'use strict';

  const canvas = document.getElementById('tourCanvas');
  const loading = document.getElementById('tourLoading');
  const roomNumEl = document.getElementById('roomNum');
  const roomNameEl = document.getElementById('roomName');
  const roomDescEl = document.getElementById('roomDesc');
  const playPauseBtn = document.getElementById('playPause');
  const progressEl = document.getElementById('progress');
  const progressBar = document.getElementById('progressBar');
  const timeLabel = document.getElementById('timeLabel');
  const stepsEl = document.getElementById('steps');

  let renderer, scene, camera, clock;
  let playing = true, elapsed = 0;
  const DURATION = 105;

  const ASSETS = {
    d8d: 'assets/models/lit-saikang-d8d.obj',
    skb039: 'assets/models/brancard-skb039f.obj',
    e6: 'assets/models/compresseur-thoracique-amoul-e6.obj',
    table: 'assets/models/table_operation_infimed.glb',
    c6screen: 'assets/models/hamilton-c6-screen.jpg'
  };
  const cache = {};

  const P = {
    floor: 0xf6f8f9, wall: 0xecf1f4, wall2: 0xdfe7ec, ceil: 0xfcfdfe,
    accent: 0x00a8cc, accentHi: 0x00c8ee, navy: 0x0b2239,
    steel: 0xb3c1ca, steelD: 0x7f929d, white: 0xffffff, glass: 0xc6e6ef,
    dark: 0x2b333a, screen: 0x0a1828, corridor: 0xf3f6f8,
    skin: 0xd4a574, skin2: 0x8d5524, hair: 0x2c1810,
    fabric: 0x1a5f8a, fabric2: 0x2980b9, mattress: 0x2a6376
  };

  function M(color, o) {
    o = o || {};
    const p = { color: color, roughness: o.r != null ? o.r : 0.5, metalness: o.m != null ? o.m : 0.08 };
    if (o.e) { p.emissive = o.e; p.emissiveIntensity = o.ei || 0.3; }
    if (o.t) { p.transparent = true; p.opacity = o.op != null ? o.op : 0.3; }
    if (o.side) p.side = o.side;
    return new THREE.MeshStandardMaterial(p);
  }
  function box(w,h,d,mat,x,y,z,rx,ry,rz){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x||0,y||0,z||0);
    if(rx)m.rotation.x=rx; if(ry)m.rotation.y=ry; if(rz)m.rotation.z=rz; m.castShadow=true; m.receiveShadow=true; return m;
  }
  function cyl(rt,rb,h,mat,x,y,z,rx,ry,rz,seg){
    const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg||20),mat); m.position.set(x||0,y||0,z||0);
    if(rx)m.rotation.x=rx; if(ry)m.rotation.y=ry; if(rz)m.rotation.z=rz; m.castShadow=true; m.receiveShadow=true; return m;
  }
  function sph(r,mat,x,y,z,seg){ const m=new THREE.Mesh(new THREE.SphereGeometry(r,seg||16,seg||12),mat); m.position.set(x||0,y||0,z||0); m.castShadow=true; return m; }
  function rbox(w,h,d,r,mat,x,y,z){
    const s = new THREE.Shape();
    const hw=w/2, hd=d/2, rr=Math.min(r,hw,hd);
    s.moveTo(-hw+rr,-hd); s.lineTo(hw-rr,-hd); s.quadraticCurveTo(hw,-hd,hw,-hd+rr);
    s.lineTo(hw,hd-rr); s.quadraticCurveTo(hw,hd,hw-rr,hd);
    s.lineTo(-hw+rr,hd); s.quadraticCurveTo(-hw,hd,-hw,hd-rr);
    s.lineTo(-hw,-hd+rr); s.quadraticCurveTo(-hw,-hd,-hw+rr,-hd);
    const geo = new THREE.ExtrudeGeometry(s,{depth:h,bevelEnabled:true,bevelThickness:Math.min(0.01,h*0.15),bevelSize:Math.min(0.01,rr*0.3),bevelSegments:2});
    geo.translate(0,0,-h/2); geo.rotateX(-Math.PI/2);
    const m=new THREE.Mesh(geo,mat); m.position.set(x||0,(y||0)-h/2,z||0); m.castShadow=true; m.receiveShadow=true; return m;
  }

  function label(text, sub, opts){
    opts=opts||{};
    const c=document.createElement('canvas'); c.width=1024; c.height=sub?220:140;
    const ctx=c.getContext('2d');
    ctx.fillStyle=opts.bg||'rgba(7,24,42,0.88)'; ctx.beginPath(); ctx.roundRect(30,15,964,c.height-30,18); ctx.fill();
    ctx.strokeStyle=opts.border||'rgba(0,200,238,0.65)'; ctx.lineWidth=3; ctx.stroke();
    ctx.fillStyle=opts.accent||'#00c8ee'; ctx.fillRect(48,34,6,sub?152:72);
    ctx.fillStyle='#fff'; ctx.font='bold 50px "Segoe UI",Arial'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(text,74,sub?70:85);
    if(sub){ ctx.fillStyle='#8ed8ec'; ctx.font='29px "Segoe UI",Arial'; ctx.fillText(sub,74,134); }
    const tex=new THREE.CanvasTexture(c); tex.minFilter=THREE.LinearFilter; if(renderer) tex.anisotropy=renderer.capabilities.getMaxAnisotropy();
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false,depthWrite:false}));
    const sc=opts.sc||2.7; sp.scale.set(sc,sc*(c.height/c.width),1); sp.renderOrder=10; return sp;
  }

  // ---- Asset loading ----
  function normalizeObject(root, opts){
    opts=opts||{};
    const box3=new THREE.Box3().setFromObject(root);
    const size=new THREE.Vector3(), center=new THREE.Vector3();
    box3.getSize(size); box3.getCenter(center);
    root.position.sub(center);
    // after centering, recompute
    const box2=new THREE.Box3().setFromObject(root);
    // place on floor (y=0)
    root.position.y -= box2.min.y;
    // scale to target dimension
    const box3b=new THREE.Box3().setFromObject(root); box3b.getSize(size);
    let scale=1;
    if(opts.targetH && size.y>0.001) scale=opts.targetH/size.y;
    else if(opts.targetW && size.x>0.001) scale=opts.targetW/size.x;
    else if(opts.targetD && size.z>0.001) scale=opts.targetD/size.z;
    else if(opts.targetMax && Math.max(size.x,size.y,size.z)>0.001) scale=opts.targetMax/Math.max(size.x,size.y,size.z);
    if(scale!==1) root.scale.setScalar(scale);
    // re-floor after scale
    const box4=new THREE.Box3().setFromObject(root);
    root.position.y -= box4.min.y;
  }
  function applyMedicalMaterials(root){
    root.traverse(function(o){
      if(!o.isMesh) return;
      if(o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      o.castShadow=true; o.receiveShadow=true;
      // keep existing map if any; enhance material
      if(o.material){
        const mats = Array.isArray(o.material)?o.material:[o.material];
        mats.forEach(function(mat){
          if(!mat) return;
          mat.side = THREE.FrontSide;
          if(mat.roughness == null) mat.roughness = 0.45;
          if(mat.metalness == null) mat.metalness = 0.08;
          if(mat.map) { mat.map.encoding = THREE.sRGBEncoding; mat.needsUpdate=true; }
          mat.needsUpdate=true;
        });
      } else {
        o.material = M(0xe8edf0,{r:0.4,m:0.1});
      }
    });
  }
  function loadOBJ(key, url, normOpts){
    return new Promise(function(resolve){
      if(cache[key]) return resolve(cache[key].clone(true));
      if(!THREE.OBJLoader){ console.warn('OBJLoader missing'); return resolve(null); }
      new THREE.OBJLoader().load(url, function(obj){
        normalizeObject(obj, normOpts||{});
        applyMedicalMaterials(obj);
        cache[key]=obj;
        resolve(obj.clone(true));
      }, undefined, function(err){ console.warn('OBJ load failed',url,err); resolve(null); });
    });
  }
  function loadGLTF(key, url, normOpts){
    return new Promise(function(resolve){
      if(cache[key]) return resolve(cache[key].clone(true));
      if(!THREE.GLTFLoader){ console.warn('GLTFLoader missing'); return resolve(null); }
      new THREE.GLTFLoader().load(url, function(gltf){
        const obj=gltf.scene||gltf.scenes[0];
        normalizeObject(obj, normOpts||{});
        applyMedicalMaterials(obj);
        cache[key]=obj;
        resolve(obj.clone(true));
      }, undefined, function(err){ console.warn('GLTF load failed',url,err); resolve(null); });
    });
  }
  function loadTexture(url){
    return new Promise(function(resolve){
      new THREE.TextureLoader().load(url, function(t){ t.encoding=THREE.sRGBEncoding; resolve(t); }, undefined, function(){ resolve(null); });
    });
  }

  // ---- People / furniture (clear & pro) ----
  function person(opts){
    opts=opts||{}; const g=new THREE.Group();
    const skin=M(opts.skin||P.skin,{r:0.62}), cloth=M(opts.cloth||P.fabric,{r:0.7}), cloth2=M(opts.cloth2||opts.cloth||0x2c3e50,{r:0.7});
    const hairM=M(opts.hair||P.hair,{r:0.85}), shoe=M(0x2c3e50,{r:0.5}); const s=opts.scale||1, sit=!!opts.sitting;
    if(sit){
      g.add(box(0.14*s,0.14*s,0.38*s,cloth2,-0.1*s,0.48*s,0.12*s)); g.add(box(0.14*s,0.14*s,0.38*s,cloth2,0.1*s,0.48*s,0.12*s));
      g.add(box(0.13*s,0.38*s,0.13*s,cloth2,-0.1*s,0.24*s,0.28*s)); g.add(box(0.13*s,0.38*s,0.13*s,cloth2,0.1*s,0.24*s,0.28*s));
      g.add(box(0.15*s,0.08*s,0.22*s,shoe,-0.1*s,0.04*s,0.32*s)); g.add(box(0.15*s,0.08*s,0.22*s,shoe,0.1*s,0.04*s,0.32*s));
    } else {
      g.add(box(0.14*s,0.48*s,0.14*s,cloth2,-0.1*s,0.24*s,0)); g.add(box(0.14*s,0.48*s,0.14*s,cloth2,0.1*s,0.24*s,0));
      g.add(box(0.16*s,0.08*s,0.24*s,shoe,-0.1*s,0.04*s,0.03*s)); g.add(box(0.16*s,0.08*s,0.24*s,shoe,0.1*s,0.04*s,0.03*s));
    }
    const hipY=sit?0.55*s:0.48*s;
    g.add(box(0.36*s,0.42*s,0.22*s,cloth,0,hipY+0.21*s,0));
    if(opts.uniform) g.add(box(0.2*s,0.09*s,0.23*s,M(P.accent,{r:0.35}),0,hipY+0.38*s,0));
    const headY=hipY+0.56*s;
    g.add(sph(0.13*s,skin,0,headY,0,18));
    g.add(sph(0.138*s,hairM,0,headY+0.04*s,-0.01*s,18));
    g.add(box(0.26*s,0.06*s,0.22*s,hairM,0,headY+0.11*s,0));
    const sy=hipY+0.34*s;
    if(sit){
      g.add(box(0.11*s,0.32*s,0.11*s,cloth,-0.24*s,sy-0.06*s,0.06*s)); g.add(box(0.11*s,0.32*s,0.11*s,cloth,0.24*s,sy-0.06*s,0.06*s));
      g.add(sph(0.055*s,skin,-0.24*s,sy-0.24*s,0.08*s)); g.add(sph(0.055*s,skin,0.24*s,sy-0.24*s,0.08*s));
    } else {
      g.add(box(0.11*s,0.36*s,0.11*s,cloth,-0.24*s,sy-0.14*s,0)); g.add(box(0.11*s,0.36*s,0.11*s,cloth,0.24*s,sy-0.14*s,0));
      g.add(sph(0.055*s,skin,-0.24*s,sy-0.34*s,0)); g.add(sph(0.055*s,skin,0.24*s,sy-0.34*s,0));
    }
    g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    return g;
  }
  function chair(opts){ opts=opts||{}; const g=new THREE.Group(), seatM=M(opts.color||P.fabric,{r:0.66}), frameM=M(P.steel,{r:0.28,m:0.6});
    g.add(rbox(0.48,0.06,0.46,0.03,seatM,0,0.46,0)); g.add(rbox(0.48,0.44,0.06,0.03,seatM,0,0.71,-0.2));
    [[-0.2,-0.18],[0.2,-0.18],[-0.2,0.18],[0.2,0.18]].forEach(p=>g.add(cyl(0.018,0.018,0.46,frameM,p[0],0.23,p[1])));
    return g;
  }
  function bench(seats,opts){ opts=opts||{}; const g=new THREE.Group(),sw=0.52,tw=seats*sw+(seats-1)*0.04,fm=M(P.steel,{r:0.28,m:0.6});
    g.add(box(tw+0.1,0.06,0.08,fm,0,0.3,0)); g.add(box(tw+0.1,0.06,0.08,fm,0,0.3,-0.3));
    g.add(box(0.06,0.42,0.5,fm,-tw/2,0.21,-0.11)); g.add(box(0.06,0.42,0.5,fm,tw/2,0.21,-0.11));
    for(let i=0;i<seats;i++){ const c=chair({color:opts.color||P.fabric}); c.position.set(-tw/2+sw/2+i*(sw+0.04),0,0); g.add(c);} return g;
  }
  function receptionDesk(){
    const g=new THREE.Group(),dm=M(P.white,{r:0.32}),tm=M(0xe3ebef,{r:0.2,m:0.12}),am=M(P.accent,{r:0.28,m:0.18});
    g.add(rbox(4.3,1.06,0.82,0.04,dm,0,0.53,0)); g.add(rbox(4.4,0.06,0.92,0.04,tm,0,1.09,0));
    g.add(box(4.32,0.34,0.02,am,0,0.22,0.42));
    g.add(rbox(0.82,1.06,1.22,0.03,dm,-1.74,0.53,-0.2)); g.add(rbox(0.82,1.06,1.22,0.03,dm,1.74,0.53,-0.2));
    g.add(box(0.52,0.33,0.03,M(P.navy,{r:0.3}),0,1.43,-0.15));
    g.add(box(0.48,0.29,0.01,M(0x163a54,{e:0x1f6fa8,ei:0.5}),0,1.43,-0.132));
    g.add(box(0.06,0.18,0.06,M(P.steel,{m:0.55}),0,1.18,-0.15));
    g.add(box(0.38,0.02,0.14,M(0x34495e),0,1.13,0.05));
    g.add(cyl(0.07,0.06,0.1,M(0xc0392b,{r:0.7}),-1.65,1.17,0.1)); g.add(sph(0.11,M(0x27ae60,{r:0.8}),-1.65,1.3,0.1));
    g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}}); return g;
  }

  // ---- Procedural complements (when no OBJ, or for monitors/accents) ----
  function patientMonitor(){
    const g=new THREE.Group();
    g.add(cyl(0.22,0.24,0.03,M(P.steel,{m:0.65}),0,0.02,0,0,0,0,5)); g.add(cyl(0.025,0.025,1.05,M(P.steel,{m:0.7}),0,0.55,0));
    g.add(rbox(0.36,0.25,0.05,0.015,M(P.dark),0,1.2,0)); g.add(box(0.33,0.22,0.01,M(P.screen,{e:0x00bb66,ei:0.55}),0,1.2,0.031));
    return g;
  }
  function hamiltonC6(screenTex){
    const g=new THREE.Group(), bm=M(0xf0f3f5,{r:0.32}), silver=M(P.steel,{m:0.7,r:0.28}), blue=M(0x1f5e9c,{r:0.35,m:0.25});
    for(let i=0;i<4;i++){const a=i/4*Math.PI*2+Math.PI/4; g.add(box(0.22,0.04,0.06,silver,Math.cos(a)*0.2,0.14,Math.sin(a)*0.2,0,-a));}
    [[0.22,0.22],[-0.22,0.22],[0.22,-0.22],[-0.22,-0.22]].forEach(p=>{const w=cyl(0.055,0.055,0.03,M(0x1a1f24),p[0],0.055,p[1]);w.rotation.z=Math.PI/2;g.add(w);});
    g.add(cyl(0.04,0.04,0.78,M(0x2f3640,{r:0.4}),0,0.53,0));
    g.add(rbox(0.44,0.4,0.34,0.02,bm,0,0.93,0)); g.add(rbox(0.4,0.24,0.3,0.015,M(0xe6eaed,{r:0.38}),0,1.26,0));
    g.add(rbox(0.36,0.25,0.025,0.01,M(P.dark),0,1.54,0.05));
    const scrMat = screenTex ? new THREE.MeshStandardMaterial({map:screenTex,emissive:0x112233,emissiveIntensity:0.25,roughness:0.35,metalness:0.0}) : M(P.screen,{e:0x0077aa,ei:0.6});
    g.add(box(0.33,0.22,0.01,scrMat,0,1.54,0.064));
    g.add(box(0.05,0.18,0.05,M(0x3a4048),0,1.33,0.02));
    g.add(cyl(0.025,0.025,0.08,silver,0.12,1.03,0.175,Math.PI/2)); g.add(cyl(0.025,0.025,0.08,silver,-0.12,1.03,0.175,Math.PI/2));
    g.add(box(0.18,0.03,0.01,blue,0,0.78,0.175));
    return g;
  }
  function cabinet(){
    const g=new THREE.Group();
    g.add(rbox(0.52,1.68,0.46,0.02,M(P.white,{r:0.36}),0,0.84,0));
    g.add(box(0.47,0.74,0.015,M(P.glass,{r:0.08,t:true,op:0.22}),0,1.18,0.238));
    g.add(cyl(0.008,0.008,0.06,M(P.steel,{m:0.7}),0.18,1.18,0.25,Math.PI/2));
    return g;
  }
  function workTable(){
    const g=new THREE.Group();
    g.add(rbox(1.82,0.045,0.74,0.02,M(P.steel,{m:0.6,r:0.22}),0,0.85,0));
    [[-0.83,-0.31],[0.83,-0.31],[-0.83,0.31],[0.83,0.31]].forEach(p=>g.add(cyl(0.025,0.025,0.85,M(P.steel,{m:0.68}),p[0],0.425,p[1])));
    g.add(rbox(1.82,0.04,0.74,0.015,M(0xdfe6ea,{r:0.38}),0,0.55,0)); return g;
  }
  function autoclave(){
    const g=new THREE.Group(); g.add(rbox(1.02,1.68,0.84,0.03,M(0xc8d2d8,{r:0.38}),0,0.84,0));
    g.add(rbox(0.72,0.52,0.02,0.02,M(0x1a2633),0,1.08,0.43)); g.add(box(0.68,0.48,0.01,M(P.screen,{e:0x0088aa,ei:0.3}),0,1.08,0.442));
    g.add(cyl(0.12,0.12,0.03,M(P.steel,{m:0.6}),0,0.62,0.435,Math.PI/2)); g.add(box(0.85,0.02,0.78,M(P.steel,{m:0.4}),0,1.69,0)); return g;
  }
  function washer(){
    const g=new THREE.Group(); g.add(rbox(1.02,1.42,0.74,0.03,M(0xd2dce2,{r:0.38}),0,0.71,0));
    g.add(rbox(0.72,0.38,0.02,0.02,M(0x1a2633),0,0.98,0.38)); g.add(box(0.68,0.34,0.01,M(P.screen,{e:0x0088aa,ei:0.28}),0,0.98,0.392));
    g.add(box(0.85,0.02,0.68,M(P.steel,{m:0.4}),0,1.43,0)); return g;
  }
  function imagingUnit(){
    const g=new THREE.Group();
    g.add(rbox(1.75,2.18,1.12,0.04,M(0xe8ecef,{r:0.3}),0,1.09,-0.2));
    g.add(box(1.32,0.36,0.01,M(P.screen,{e:0x0088aa,ei:0.22}),0,1.74,0.366));
    g.add(rbox(0.82,0.08,1.95,0.03,M(0x607d8b,{r:0.48}),0,0.78,1.12));
    g.add(cyl(0.09,0.11,0.74,M(P.steel,{m:0.58}),0,0.37,1.12));
    g.add(cyl(0.32,0.32,0.08,M(0xdde3e7),0,1.75,0.2,Math.PI/2));
    return g;
  }
  function anesthesiaCart(){
    const g=new THREE.Group();
    g.add(rbox(0.56,0.04,0.43,0.015,M(P.steel,{m:0.5,r:0.3}),0,0.9,0)); g.add(rbox(0.56,0.04,0.43,0.015,M(P.steel,{m:0.5,r:0.3}),0,0.58,0));
    g.add(rbox(0.56,0.04,0.43,0.015,M(P.steel,{m:0.5,r:0.3}),0,0.26,0));
    [[-0.245,-0.185],[0.245,-0.185],[-0.245,0.185],[0.245,0.185]].forEach(p=>g.add(cyl(0.015,0.015,0.9,M(P.steel,{m:0.72}),p[0],0.45,p[1])));
    [[-0.22,-0.16],[0.22,-0.16],[-0.22,0.16],[0.22,0.16]].forEach(p=>{const w=cyl(0.04,0.04,0.025,M(0x1a1f24),p[0],0.04,p[1]);w.rotation.z=Math.PI/2;g.add(w);});
    g.add(box(0.18,0.12,0.1,M(P.dark),0,1.02,0)); g.add(box(0.15,0.09,0.01,M(P.screen,{e:0x0088cc,ei:0.38}),0,1.02,0.056)); return g;
  }
  function scialytic(){
    const g=new THREE.Group();
    g.add(cyl(0.045,0.045,1.4,M(P.steel,{m:0.68}),0,2.0,0)); g.add(box(0.8,0.05,0.06,M(P.steel,{m:0.65}),0.2,2.72,0));
    g.add(cyl(0.54,0.54,0.1,M(P.white,{r:0.28}),0.55,2.68,0)); g.add(cyl(0.44,0.44,0.04,M(0xfffef5,{e:0xfff4d8,ei:0.75}),0.55,2.62,0));
    return g;
  }

  // ---- Architecture (clear & realistic) ----
  function roomShell(w,d,h,accent){
    const g=new THREE.Group();
    const wallM=M(P.wall,{r:0.86,side:THREE.DoubleSide}), baseM=M(accent||P.accent,{r:0.32,m:0.18});
    g.add(box(w,0.12,d,M(P.floor,{r:0.88}),0,-0.06,0));
    g.add(box(w-0.1,0.014,d-0.1,M(accent||P.accent,{r:0.3,t:true,op:0.07}),0,0.013,0));
    g.add(box(w,0.05,d,M(P.ceil,{r:0.94,t:true,op:0.18,side:THREE.DoubleSide}),0,h,0));
    // walls
    g.add(box(w,h,0.12,wallM,0,h/2,-d/2));
    g.add(box(0.12,h,d,wallM,-w/2,h/2,0));
    g.add(box(0.12,h,d,wallM,w/2,h/2,0));
    g.add(box(w*0.3,h,0.12,wallM,-w*0.35,h/2,d/2));
    g.add(box(w*0.3,h,0.12,wallM,w*0.35,h/2,d/2));
    g.add(box(w*0.4,h-2.25,0.12,wallM,0,2.25+(h-2.25)/2,d/2));
    // baseboards/accent
    g.add(box(w,0.1,0.025,baseM,0,0.05,-d/2+0.07)); g.add(box(0.025,0.1,d,baseM,-w/2+0.07,0.05,0)); g.add(box(0.025,0.1,d,baseM,w/2-0.07,0.05,0));
    // door frame accent
    g.add(box(0.04,2.25,0.04,baseM,-w*0.2,1.125,d/2)); g.add(box(0.04,2.25,0.04,baseM,w*0.2,1.125,d/2)); g.add(box(w*0.4+0.04,0.04,0.04,baseM,0,2.25,d/2));
    // ceiling lights
    const lm=M(0xffffff,{e:0xf6fbff,ei:0.95});
    [[-w*0.22,-d*0.18],[w*0.22,-d*0.18],[-w*0.22,d*0.18],[w*0.22,d*0.18]].forEach(p=>g.add(rbox(1.0,0.03,0.2,0.02,lm,p[0],h-0.02,p[1])));
    return g;
  }

  const LAYOUT = {
    corridor: { w:3.8, h:3.15, z0:-5.5, len:46 },
    rooms: [
      { id:'bloc', num:'01', name:'Bloc Opératoire', desc:'Table d\'opération (réelle 3D), scialytique, chariot, Hamilton C6', x:-5.4, z:4.5, w:7.2, d:6.4, accent:0x0077b6 },
      { id:'rea',  num:'02', name:'Anesthésie-Réanimation', desc:'Lit Saikang D8D (OBJ réel), Hamilton C6, monitorage', x:5.4, z:10.2, w:7.2, d:6.4, accent:0x0096c7 },
      { id:'urg',  num:'03', name:'Urgences', desc:'Brancard SKB039F (OBJ réel), Amoul E6 (OBJ réel), Hamilton C6', x:-5.4, z:15.9, w:7.2, d:6.4, accent:0x023e8a },
      { id:'rad',  num:'04', name:'Radiologie / Imagerie', desc:'Unité d\'imagerie, table d\'examen, poste clair', x:5.4, z:21.6, w:7.2, d:6.4, accent:0x48cae4 },
      { id:'ster', num:'05', name:'Stérilisation', desc:'Autoclave, laveur-désinfecteur, conditionnement', x:-5.4, z:27.3, w:7.2, d:6.4, accent:0x0096c7 },
      { id:'mob',  num:'06', name:'Mobilier Médical', desc:'2× Lits Saikang D8D (OBJ réels), mobilier de chambre', x:5.4, z:33.0, w:7.2, d:6.4, accent:0x00b4d8 }
    ]
  };

  function buildCorridor(){
    const c=LAYOUT.corridor, g=new THREE.Group();
    g.add(box(c.w,0.12,c.len,M(P.corridor,{r:0.86}),0,-0.06,c.z0+c.len/2));
    g.add(box(c.w,0.05,c.len,M(P.ceil,{r:0.94,t:true,op:0.16,side:THREE.DoubleSide}),0,c.h,c.z0+c.len/2));
    g.add(box(0.2,0.013,c.len-1.5,M(P.accent,{e:P.accent,ei:0.08,r:0.38,t:true,op:0.42}),0,0.013,c.z0+c.len/2));
    g.add(box(0.1,1.25,c.len,M(P.wall2,{r:0.84}),-c.w/2,0.625,c.z0+c.len/2)); g.add(box(0.1,1.25,c.len,M(P.wall2,{r:0.84}),c.w/2,0.625,c.z0+c.len/2));
    g.add(box(0.12,0.045,c.len,M(P.accent,{r:0.3,m:0.18}),-c.w/2,1.27,c.z0+c.len/2)); g.add(box(0.12,0.045,c.len,M(P.accent,{r:0.3,m:0.18}),c.w/2,1.27,c.z0+c.len/2));
    const lm=M(0xffffff,{e:0xf8fcff,ei:1.0});
    for(let z=0;z<c.len-2;z+=3.6) g.add(rbox(1.8,0.03,0.18,0.02,lm,0,c.h-0.02,c.z0+2.2+z));
    g.add(box(c.w+0.24,c.h,0.12,M(P.wall,{r:0.86}),0,c.h/2,c.z0+c.len));
    const lbl=label('CIRCULATION PRINCIPALE','Couloir clair — accès aux 6 services',{sc:2.3}); lbl.position.set(0,2.55,c.z0+c.len/2); g.add(lbl);
    scene.add(g);
  }

  function buildEntrance(){
    const g=new THREE.Group(), w=10.5,d=7.4,h=3.5;
    g.add(box(w,0.12,d,M(P.floor,{r:0.86}),0,-0.06,0));
    g.add(box(w,0.05,d,M(P.ceil,{r:0.94,t:true,op:0.16,side:THREE.DoubleSide}),0,h,0));
    g.add(box(w,1.25,0.12,M(P.wall,{r:0.86}),0,0.625,-d/2));
    g.add(box(0.12,1.25,d,M(P.wall,{r:0.86}),-w/2,0.625,0)); g.add(box(0.12,1.25,d,M(P.wall,{r:0.86}),w/2,0.625,0));
    g.add(box(w,0.045,0.14,M(P.accent,{r:0.3,m:0.18}),0,1.27,-d/2));
    g.add(box(w*0.38,1.25,0.06,M(P.glass,{r:0.08,t:true,op:0.18}),-w*0.31,0.625,d/2));
    g.add(box(w*0.38,1.25,0.06,M(P.glass,{r:0.08,t:true,op:0.18}),w*0.31,0.625,d/2));
    g.add(rbox(3.8,0.03,0.22,0.02,M(0xffffff,{e:0xffffff,ei:0.85}),0,h-0.02,0));
    g.add(rbox(1.3,0.03,0.18,0.02,M(0xffffff,{e:0xffffff,ei:0.85}),-3.2,h-0.02,-1.5));
    g.add(rbox(1.3,0.03,0.18,0.02,M(0xffffff,{e:0xffffff,ei:0.85}),3.2,h-0.02,-1.5));

    const desk=receptionDesk(); desk.position.set(0,0,-1.7); g.add(desk);
    const recep=person({cloth:P.white,cloth2:0x2c3e50,skin:P.skin2,hair:0x1a1a1a,uniform:true,scale:1.02});
    recep.position.set(0,0,-2.5); recep.rotation.y=0; g.add(recep);
    g.add(box(0.08,0.05,0.01,M(P.accent,{e:P.accent,ei:0.4}),0.12,1.06,-2.39));

    const b1=bench(3,{color:P.fabric}); b1.position.set(-2.5,0,1.55); g.add(b1);
    const b2=bench(2,{color:P.fabric2}); b2.position.set(2.7,0,1.75); b2.rotation.y=-0.1; g.add(b2);
    [{x:-3.06,z:1.55,rot:Math.PI+0.08,c:0x34495e,sk:P.skin},{x:-2.5,z:1.55,rot:Math.PI,c:0x7f8c8d,sk:P.skin2},{x:-1.94,z:1.55,rot:Math.PI-0.06,c:0x16a085,sk:P.skin},
     {x:2.42,z:1.77,rot:Math.PI+0.16,c:0x8e44ad,sk:P.skin},{x:2.98,z:1.72,rot:Math.PI+0.05,c:0xd35400,sk:P.skin2}].forEach(p=>{
      const per=person({cloth:p.c,cloth2:0x2c3e50,skin:p.sk,sitting:true,scale:0.97}); per.position.set(p.x,0,p.z); per.rotation.y=p.rot; g.add(per);
    });
    const stand=person({cloth:0x2980b9,cloth2:0x34495e,skin:P.skin,scale:0.97}); stand.position.set(-0.95,0,0.05); stand.rotation.y=Math.PI; g.add(stand);

    g.add(cyl(0.28,0.28,0.04,M(0xdfe8ec,{r:0.28}),0,0.42,1.65)); g.add(cyl(0.03,0.04,0.42,M(P.steel,{m:0.55}),0,0.21,1.65)); g.add(cyl(0.18,0.18,0.02,M(P.steel,{m:0.55}),0,0.01,1.65));
    g.add(box(0.2,0.015,0.26,M(P.accent,{r:0.55}),0.05,0.45,1.65));
    [[-4.5,-2.8],[4.5,-2.8]].forEach(p=>{ g.add(cyl(0.18,0.15,0.35,M(0xbdc3c7,{r:0.55}),p[0],0.175,p[1])); g.add(sph(0.29,M(0x27ae60,{r:0.82}),p[0],0.53,p[1])); g.add(sph(0.22,M(0x2ecc71,{r:0.82}),p[0]+0.1,0.63,p[1]-0.04)); });
    const recLbl=label('ACCUEIL / RÉCEPTION','Réceptionniste et patients — espace clair et professionnel',{sc:1.9}); recLbl.position.set(0,2.35,-1.9); g.add(recLbl);
    const hallLbl=label("Hall d'accueil",'La Maison Africaine du Médecin',{sc:2.1,accent:'#00c8ee'}); hallLbl.position.set(0,2.85,0.6); g.add(hallLbl);

    g.position.set(0,0,-1.2); scene.add(g);
  }

  // ---- Rooms with real assets ----
  async function buildRooms(c6tex){
    for (const r of LAYOUT.rooms) {
      const shell = roomShell(r.w,r.d,3.15,r.accent);
      shell.position.set(r.x,0,r.z); scene.add(shell);
      const g = new THREE.Group();

      if (r.id === 'bloc') {
        const t = await loadGLTF('table', ASSETS.table, { targetD: 2.1 });
        if (t) { t.rotation.y = Math.PI/2; g.add(t); } else { g.add(box(2.0,0.07,0.62,M(P.mattress),0,0.86,0)); }
        g.add(scialytic());
        const c6 = hamiltonC6(c6tex); c6.position.set(-2.6,0,0.3); c6.rotation.y=Math.PI/2; g.add(c6);
        const cart = anesthesiaCart(); cart.position.set(-2.4,0,-1.7); cart.rotation.y=Math.PI/3; g.add(cart);
        const mon = patientMonitor(); mon.position.set(-1.9,0,1.9); g.add(mon);
        const cab = cabinet(); cab.position.set(2.9,0,-2.3); cab.rotation.y=-Math.PI/2; g.add(cab);
        const doc = person({cloth:0x27ae60,cloth2:0x27ae60,skin:P.skin2,uniform:true,scale:0.92}); doc.position.set(1.1,0,0.2); doc.rotation.y=-Math.PI/2; g.add(doc);
        const lbl=label('01 Bloc Opératoire','Table d\'opération 3D réelle • Scialytique • Hamilton C6',{sc:2.15,accent:'#0077b6'}); lbl.position.set(0,2.6,0); g.add(lbl);
      }
      else if (r.id === 'rea') {
        const bed = await loadOBJ('d8d', ASSETS.d8d, { targetD: 2.15 });
        if (bed) { bed.rotation.y = Math.PI; g.add(bed); } // orient head/foot nicely
        const vent = hamiltonC6(c6tex); vent.position.set(-2.4,0,-1.5); vent.rotation.y=Math.PI/3; g.add(vent);
        const mon = patientMonitor(); mon.position.set(-1.6,0,-2.2); g.add(mon);
        const cart = anesthesiaCart(); cart.position.set(2.5,0,1.6); cart.rotation.y=-Math.PI/2; g.add(cart);
        const cab = cabinet(); cab.position.set(2.9,0,-2.1); cab.rotation.y=-Math.PI/2; g.add(cab);
        const lbl=label('02 Anesthésie-Réanimation','Lit Saikang D8D (OBJ réel) • Hamilton C6 • Monitorage',{sc:2.15,accent:'#0096c7'}); lbl.position.set(0,2.6,0); g.add(lbl);
      }
      else if (r.id === 'urg') {
        const st = await loadOBJ('skb039', ASSETS.skb039, { targetD: 1.95 });
        if (st) { st.rotation.y = Math.PI; g.add(st); }
        const e6 = await loadOBJ('e6', ASSETS.e6, { targetH: 1.25 });
        if (e6) { e6.position.set(2.2,0,-1.6); e6.rotation.y=-Math.PI/4; g.add(e6); }
        const mon = patientMonitor(); mon.position.set(-2.1,0,-1.7); g.add(mon);
        const vent = hamiltonC6(c6tex); vent.position.set(-2.5,0,1.3); vent.rotation.y=Math.PI/2; g.add(vent);
        const cart = anesthesiaCart(); cart.position.set(2.6,0,1.6); cart.rotation.y=-Math.PI/2; g.add(cart);
        const nurse = person({cloth:0x27ae60,cloth2:0x1e8449,skin:P.skin,uniform:true,scale:0.92}); nurse.position.set(1.25,0,0.9); nurse.rotation.y=-2.2; g.add(nurse);
        const lbl=label('03 Urgences','Brancard SKB039F (OBJ réel) • Amoul E6 (OBJ réel) • Hamilton C6',{sc:2.1,accent:'#023e8a'}); lbl.position.set(0,2.6,0); g.add(lbl);
      }
      else if (r.id === 'rad') {
        g.add(imagingUnit());
        const mon = patientMonitor(); mon.position.set(-2.5,0,-1.9); g.add(mon);
        const cab = cabinet(); cab.position.set(2.9,0,-2.3); cab.rotation.y=-Math.PI/2; g.add(cab);
        g.add(box(1.9,1.25,0.06,M(P.glass,{r:0.12,t:true,op:0.2}),-2.3,0.625,1.3));
        g.add(box(1.94,0.045,0.12,M(P.steel,{m:0.45}),-2.3,1.27,1.3));
        const lbl=label('04 Radiologie / Imagerie','Unité d\'imagerie • Table d\'examen • Protection',{sc:2.15,accent:'#48cae4'}); lbl.position.set(0,2.6,-0.2); g.add(lbl);
      }
      else if (r.id === 'ster') {
        const ac=autoclave(); ac.position.set(-2.0,0,-1.9); g.add(ac);
        const wa=washer(); wa.position.set(0.15,0,-1.9); g.add(wa);
        const wt=workTable(); wt.position.set(0,0,1.6); wt.rotation.y=Math.PI/2; g.add(wt);
        const c1=anesthesiaCart(); c1.position.set(2.5,0,0.3); c1.rotation.y=-Math.PI/2; g.add(c1);
        const cab=cabinet(); cab.position.set(-2.9,0,1.7); cab.rotation.y=Math.PI/2; g.add(cab);
        const lbl=label('05 Stérilisation','Autoclave • Laveur-désinfecteur • Conditionnement',{sc:2.15,accent:'#0096c7'}); lbl.position.set(0,2.6,-0.8); g.add(lbl);
      }
      else if (r.id === 'mob') {
        const b1 = await loadOBJ('d8d', ASSETS.d8d, { targetD: 2.15 });
        if (b1) { b1.rotation.y=Math.PI; b1.position.x=-1.55; g.add(b1); }
        const b2 = await loadOBJ('d8d', ASSETS.d8d, { targetD: 2.15 });
        if (b2) { b2.rotation.y=Math.PI; b2.position.x=1.55; g.add(b2); }
        g.add(rbox(0.46,0.56,0.42,0.02,M(P.white,{r:0.36}),-2.95,0.28,-0.5));
        g.add(rbox(0.46,0.56,0.42,0.02,M(P.white,{r:0.36}),2.95,0.28,-0.5));
        g.add(cyl(0.015,0.015,0.7,M(P.steel,{m:0.68}),0,0.35,2.0)); g.add(rbox(0.72,0.03,0.46,0.015,M(0xdfe8ec,{r:0.32}),0,0.72,2.0));
        const cab=cabinet(); cab.position.set(-2.9,0,1.7); cab.rotation.y=Math.PI/2; g.add(cab);
        const lbl=label('06 Mobilier Médical','2× Lits Saikang D8D (OBJ réels) • Mobilier de chambre',{sc:2.15,accent:'#00b4d8'}); lbl.position.set(0,2.6,-0.5); g.add(lbl);
      }

      g.position.set(r.x,0,r.z);
      scene.add(g);
    }
  }

  function buildGround(){
    const gnd=box(90,0.22,100,M(0x6f8a84,{r:0.94}),0,-0.15,15); gnd.receiveShadow=true; scene.add(gnd);
    scene.add(box(42,0.06,54,M(0x93a8a2,{r:0.88}),0,-0.05,15));
  }

  // ---- Tour keyframes ----
  function kf(t,pos,look,room){return{t,pos,look,room};}
  const keyframes=[
    kf(0.00,[0,1.66,4.8],[0,1.45,-1.8],{num:'ACCUEIL',name:"Hall d'accueil",desc:'Réceptionniste et patients — rendu clair et professionnel'}),
    kf(0.035,[0,1.66,1.6],[0,1.3,-2.3],{num:'ACCUEIL',name:'Réception & Accueil',desc:'Comptoir, réceptionniste 3D, patients en attente visibles'}),
    kf(0.065,[-1.3,1.62,0.0],[0,1.0,-1.9],{num:'ACCUEIL',name:"Espace d'attente",desc:'Banquettes, patients assis, accueil 100% lisible'}),
    kf(0.095,[0,1.66,-3.5],[0,1.5,4.5],{num:'COULOIR',name:'Circulation principale',desc:'Couloir lumineux, palette architecturale bleu/cyan'}),
    kf(0.125,[0,1.66,3.0],[-3.8,1.3,4.5],{num:'COULOIR',name:'Vers Bloc Opératoire',desc:'Service 01'}),

    kf(0.155,[-2.9,1.7,4.5],[-5.4,1.1,4.5],{num:'01',name:'Bloc Opératoire',desc:'Table d\'opération 3D réelle, scialytique, Hamilton C6'}),
    kf(0.205,[-5.3,1.58,6.0],[-5.4,0.95,4.0],{num:'01',name:'Bloc Opératoire',desc:'Équipements chirurgicaux — rendu réaliste et clair'}),
    kf(0.235,[-2.9,1.66,4.5],[0,1.5,4.5],{num:'01',name:'Bloc Opératoire',desc:'Retour circulation'}),

    kf(0.265,[0,1.66,8.2],[3.8,1.3,10.2],{num:'COULOIR',name:'Vers Anesthésie-Réanimation',desc:'Service 02'}),
    kf(0.295,[2.9,1.7,10.2],[5.4,1.05,10.2],{num:'02',name:'Anesthésie-Réanimation',desc:'Lit Saikang D8D (OBJ réel), Hamilton C6, monitorage'}),
    kf(0.345,[5.3,1.56,11.7],[5.4,0.95,9.7],{num:'02',name:'Anesthésie-Réanimation',desc:'Rendu réaliste des produits — haute lisibilité'}),
    kf(0.375,[2.9,1.66,10.2],[0,1.5,10.2],{num:'02',name:'Anesthésie-Réanimation',desc:'Retour circulation'}),

    kf(0.405,[0,1.66,13.9],[-3.8,1.3,15.9],{num:'COULOIR',name:'Vers Urgences',desc:'Service 03'}),
    kf(0.435,[-2.9,1.7,15.9],[-5.4,1.0,15.9],{num:'03',name:'Urgences',desc:'Brancard SKB039F + Amoul E6 (OBJ réels), Hamilton C6'}),
    kf(0.485,[-5.2,1.56,17.4],[-5.4,0.9,15.4],{num:'03',name:'Urgences',desc:'Matériel d\'urgence identifiable et professionnel'}),
    kf(0.515,[-2.9,1.66,15.9],[0,1.5,15.9],{num:'03',name:'Urgences',desc:'Retour circulation'}),

    kf(0.545,[0,1.66,19.6],[3.8,1.3,21.6],{num:'COULOIR',name:'Vers Radiologie',desc:'Service 04'}),
    kf(0.575,[2.9,1.74,21.6],[5.4,1.2,21.6],{num:'04',name:'Radiologie / Imagerie',desc:'Imagerie médicale, table d\'examen, poste clair'}),
    kf(0.625,[5.1,1.62,23.1],[5.4,1.1,21.1],{num:'04',name:'Radiologie / Imagerie',desc:'Espace lumineux et technique'}),
    kf(0.655,[2.9,1.66,21.6],[0,1.5,21.6],{num:'04',name:'Radiologie / Imagerie',desc:'Retour circulation'}),

    kf(0.685,[0,1.66,25.3],[-3.8,1.3,27.3],{num:'COULOIR',name:'Vers Stérilisation',desc:'Service 05'}),
    kf(0.715,[-2.9,1.7,27.3],[-5.4,1.1,27.3],{num:'05',name:'Stérilisation',desc:'Autoclave, laveur-désinfecteur, conditionnement'}),
    kf(0.765,[-5.1,1.6,28.8],[-5.4,1.0,26.8],{num:'05',name:'Stérilisation',desc:'Circuit de stérilisation — clair et pro'}),
    kf(0.795,[-2.9,1.66,27.3],[0,1.5,27.3],{num:'05',name:'Stérilisation',desc:'Retour circulation'}),

    kf(0.825,[0,1.66,31.0],[3.8,1.3,33.0],{num:'COULOIR',name:'Vers Mobilier Médical',desc:'Service 06'}),
    kf(0.855,[2.9,1.74,33.0],[5.4,1.05,33.0],{num:'06',name:'Mobilier Médical',desc:'2× Lits Saikang D8D (OBJ réels), mobilier de chambre'}),
    kf(0.915,[5.1,1.6,34.5],[5.4,0.95,32.5],{num:'06',name:'Mobilier Médical',desc:'Les deux lits D8D réels, clairement visibles'}),
    kf(0.955,[2.9,1.66,33.0],[0,1.5,33.0],{num:'06',name:'Mobilier Médical',desc:'Retour circulation'}),

    kf(1.00,[1.8,1.9,29],[0,1.4,17],{num:'FIN',name:'Visite terminée',desc:'Merci — La Maison Africaine du Médecin (Congrès)'})
  ];
  const steps=[
    {t:0.00,label:'Accueil'},{t:0.155,label:'01 Bloc'},{t:0.295,label:'02 Réa'},
    {t:0.435,label:'03 Urgences'},{t:0.575,label:'04 Radio'},{t:0.715,label:'05 Stéril.'},{t:0.855,label:'06 Mobilier'}
  ];
  function lerp(a,b,t){return a+(b-a)*t;}
  function lerp3(a,b,t){return [lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];}
  function ease(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
  function sample(t){
    t=Math.max(0,Math.min(1,t)); let i=0; while(i<keyframes.length-2 && keyframes[i+1].t<t) i++;
    const a=keyframes[i],b=keyframes[i+1]; const local=(b.t===a.t)?0:(t-a.t)/(b.t-a.t), e=ease(local);
    return {pos:lerp3(a.pos,b.pos,e), look:lerp3(a.look,b.look,e), room: local<0.45?a.room:b.room};
  }
  function fmt(s){const m=Math.floor(s/60),sec=Math.floor(s%60); return m+':'+(sec<10?'0':'')+sec;}

  async function init(){
    scene=new THREE.Scene();
    scene.background=new THREE.Color(0xdce8ee); // clair
    scene.fog=new THREE.Fog(0xdce8ee, 35, 85);  // très léger (profondeur, pas voile)

    camera=new THREE.PerspectiveCamera(56, window.innerWidth/window.innerHeight, 0.08, 140);
    camera.position.set(0,1.66,4.8);

    renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    renderer.setSize(window.innerWidth,window.innerHeight);
    renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
    renderer.outputEncoding=THREE.sRGBEncoding;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.12; // réaliste mais très lisible
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.physicallyCorrectLights=false;

    // Lighting: realistic + hyper clear
    scene.add(new THREE.AmbientLight(0xffffff, 0.68));
    scene.add(new THREE.HemisphereLight(0xeaf6ff, 0xb9c7c3, 0.58));
    const sun=new THREE.DirectionalLight(0xfff7e6, 0.75);
    sun.position.set(12,26,10); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
    sun.shadow.camera.left=-32; sun.shadow.camera.right=32; sun.shadow.camera.top=32; sun.shadow.camera.bottom=-32;
    sun.shadow.camera.near=1; sun.shadow.camera.far=80; sun.shadow.bias=-0.00035; sun.shadow.normalBias=0.02;
    scene.add(sun);
    const fill=new THREE.DirectionalLight(0xe0ecff,0.28); fill.position.set(-14,16,-8); scene.add(fill);
    const rim=new THREE.DirectionalLight(0xc8f2ff,0.12); rim.position.set(-10,10,25); scene.add(rim);

    buildGround(); buildCorridor(); buildEntrance();

    // load texture + rooms with real assets
    const c6tex = await loadTexture(ASSETS.c6screen);
    await buildRooms(c6tex);

    // UI
    steps.forEach(s=>{ const btn=document.createElement('button'); btn.className='tour-step'; btn.textContent=s.label;
      btn.addEventListener('click',()=>{elapsed=s.t*DURATION; playing=true; playPauseBtn.textContent='❚❚';}); stepsEl.appendChild(btn); s._btn=btn; });
    playPauseBtn.addEventListener('click',()=>{playing=!playing; playPauseBtn.textContent=playing?'❚❚':'▶';});
    progressEl.addEventListener('click',(e)=>{const r=progressEl.getBoundingClientRect(); elapsed=((e.clientX-r.left)/r.width)*DURATION;});
    window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth,window.innerHeight);});

    clock=new THREE.Clock();
    loading.classList.add('hidden');
    animate();
  }

  let lastRoomName='';
  function animate(){
    requestAnimationFrame(animate);
    const dt=Math.min(clock.getDelta(),0.05);
    if(playing){ elapsed+=dt; if(elapsed>=DURATION){elapsed=DURATION; playing=false; playPauseBtn.textContent='▶';} }
    const t=elapsed/DURATION, s=sample(t);
    camera.position.set(s.pos[0],s.pos[1],s.pos[2]);
    camera.lookAt(s.look[0],s.look[1],s.look[2]);
    progressBar.style.width=(t*100)+'%'; timeLabel.textContent=fmt(elapsed)+' / '+fmt(DURATION);
    if(s.room && s.room.name!==lastRoomName){ lastRoomName=s.room.name; roomNumEl.textContent=s.room.num; roomNameEl.textContent=s.room.name; roomDescEl.textContent=s.room.desc; }
    steps.forEach(st=> st._btn && st._btn.classList.toggle('active', Math.abs(t-st.t)<0.032));
    renderer.render(scene,camera);
  }

  if(window.THREE) init(); else window.addEventListener('load', init);
})();
