/* ============================================================
   parcours.js — Visite cinématique 3D de la clinique (hyper claire & pro)
   La Maison Africaine du Médecin
   - Style architectural bleu/cyan, éclairage clinique, lisibilité maximale
   - Équipements représentatifs des vrais produits des salles 3D
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
  let playing = true;
  let elapsed = 0;
  const DURATION = 100;

  const P = {
    floor: 0xf5f8f9, floor2: 0xeef3f5, wall: 0xe9f0f3, wall2: 0xdce6eb,
    ceil: 0xfbfdfe, accent: 0x00a8cc, accentHi: 0x00c8ee, navy: 0x0b2239,
    steel: 0xa8b8c2, steelD: 0x7f929d, white: 0xffffff, glass: 0xbfe4ee,
    mattress: 0x2a6376, mattress2: 0x357c93, dark: 0x2b333a, screen: 0x0a1828,
    skin: 0xd4a574, skin2: 0x8d5524, hair: 0x2c1810, fabric: 0x1a5f8a,
    fabric2: 0x2980b9, green: 0x27ae60, red: 0xc0392b, wood: 0xc4a882,
    corridor: 0xf2f6f8, frame: 0xc8d8e0
  };

  function M(color, o) {
    o = o || {};
    const p = { color: color, roughness: o.r != null ? o.r : 0.55, metalness: o.m != null ? o.m : 0.08 };
    if (o.e) { p.emissive = o.e; p.emissiveIntensity = o.ei || 0.35; }
    if (o.t) { p.transparent = true; p.opacity = o.op != null ? o.op : 0.3; }
    if (o.side) p.side = o.side;
    return new THREE.MeshStandardMaterial(p);
  }
  function box(w,h,d,mat,x,y,z,rx,ry,rz) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.position.set(x||0,y||0,z||0);
    if (rx) m.rotation.x = rx; if (ry) m.rotation.y = ry; if (rz) m.rotation.z = rz;
    m.castShadow = true; m.receiveShadow = true; return m;
  }
  function cyl(rt,rb,h,mat,x,y,z,rx,ry,rz,seg) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg||18), mat);
    m.position.set(x||0,y||0,z||0);
    if (rx) m.rotation.x = rx; if (ry) m.rotation.y = ry; if (rz) m.rotation.z = rz;
    m.castShadow = true; m.receiveShadow = true; return m;
  }
  function sph(r,mat,x,y,z,seg) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r,seg||16,seg||12), mat);
    m.position.set(x||0,y||0,z||0); m.castShadow = true; return m;
  }

  function label(text, sub, opts) {
    opts = opts || {};
    const c = document.createElement('canvas'); c.width = 1024; c.height = sub ? 220 : 140;
    const ctx = c.getContext('2d');
    ctx.fillStyle = opts.bg || 'rgba(7,24,42,0.86)';
    ctx.beginPath(); ctx.roundRect(30,15,964,c.height-30,18); ctx.fill();
    ctx.strokeStyle = opts.border || 'rgba(0,200,238,0.6)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = opts.accent || '#00c8ee'; ctx.fillRect(48,34,6,sub?152:72);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 50px Segoe UI, Arial'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(text, 74, sub?70:85);
    if (sub) { ctx.fillStyle='#8ed8ec'; ctx.font='29px Segoe UI, Arial'; ctx.fillText(sub,74,134); }
    const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, transparent:true, depthTest:false, depthWrite:false}));
    const sc = opts.sc || 2.6; sp.scale.set(sc, sc*(c.height/c.width), 1); sp.renderOrder = 10; return sp;
  }

  // ---- People (clear, visible) ----
  function person(opts) {
    opts = opts || {};
    const g = new THREE.Group();
    const skin = M(opts.skin || P.skin, {r:0.65});
    const cloth = M(opts.cloth || P.fabric, {r:0.72});
    const cloth2 = M(opts.cloth2 || opts.cloth || 0x2c3e50, {r:0.72});
    const hairM = M(opts.hair || P.hair, {r:0.85});
    const shoe = M(0x2c3e50, {r:0.55});
    const s = opts.scale || 1, sit = !!opts.sitting;
    if (sit) {
      g.add(box(0.14*s,0.14*s,0.38*s,cloth2,-0.1*s,0.48*s,0.12*s));
      g.add(box(0.14*s,0.14*s,0.38*s,cloth2,0.1*s,0.48*s,0.12*s));
      g.add(box(0.13*s,0.38*s,0.13*s,cloth2,-0.1*s,0.24*s,0.28*s));
      g.add(box(0.13*s,0.38*s,0.13*s,cloth2,0.1*s,0.24*s,0.28*s));
      g.add(box(0.15*s,0.08*s,0.22*s,shoe,-0.1*s,0.04*s,0.32*s));
      g.add(box(0.15*s,0.08*s,0.22*s,shoe,0.1*s,0.04*s,0.32*s));
    } else {
      g.add(box(0.14*s,0.48*s,0.14*s,cloth2,-0.1*s,0.24*s,0));
      g.add(box(0.14*s,0.48*s,0.14*s,cloth2,0.1*s,0.24*s,0));
      g.add(box(0.16*s,0.08*s,0.24*s,shoe,-0.1*s,0.04*s,0.03*s));
      g.add(box(0.16*s,0.08*s,0.24*s,shoe,0.1*s,0.04*s,0.03*s));
    }
    const hipY = sit ? 0.55*s : 0.48*s;
    g.add(box(0.36*s,0.42*s,0.22*s,cloth,0,hipY+0.21*s,0));
    if (opts.uniform) g.add(box(0.18*s,0.08*s,0.23*s,M(P.accent,{r:0.4}),0,hipY+0.38*s,0));
    const headY = hipY + 0.56*s;
    g.add(sph(0.13*s,skin,0,headY,0,16));
    g.add(sph(0.136*s,hairM,0,headY+0.04*s,-0.01*s,16));
    g.add(box(0.26*s,0.06*s,0.22*s,hairM,0,headY+0.11*s,0));
    const sy = hipY + 0.34*s;
    if (sit) {
      g.add(box(0.11*s,0.32*s,0.11*s,cloth,-0.24*s,sy-0.06*s,0.06*s));
      g.add(box(0.11*s,0.32*s,0.11*s,cloth,0.24*s,sy-0.06*s,0.06*s));
      g.add(sph(0.055*s,skin,-0.24*s,sy-0.24*s,0.08*s));
      g.add(sph(0.055*s,skin,0.24*s,sy-0.24*s,0.08*s));
    } else {
      g.add(box(0.11*s,0.36*s,0.11*s,cloth,-0.24*s,sy-0.14*s,0));
      g.add(box(0.11*s,0.36*s,0.11*s,cloth,0.24*s,sy-0.14*s,0));
      g.add(sph(0.055*s,skin,-0.24*s,sy-0.34*s,0));
      g.add(sph(0.055*s,skin,0.24*s,sy-0.34*s,0));
    }
    g.traverse(o=>{ if(o.isMesh){o.castShadow=true;o.receiveShadow=true;} });
    return g;
  }

  function chair(opts) {
    opts = opts||{};
    const g = new THREE.Group();
    const seatM = M(opts.color||P.fabric,{r:0.68}), frameM = M(P.steel,{r:0.3,m:0.55});
    g.add(box(0.48,0.06,0.46,seatM,0,0.46,0));
    g.add(box(0.48,0.44,0.06,seatM,0,0.71,-0.2));
    [[-0.2,-0.18],[0.2,-0.18],[-0.2,0.18],[0.2,0.18]].forEach(p=>g.add(cyl(0.018,0.018,0.46,frameM,p[0],0.23,p[1])));
    return g;
  }
  function bench(seats, opts) {
    opts=opts||{}; const g=new THREE.Group(), sw=0.52, tw=seats*sw+(seats-1)*0.04;
    const fm=M(P.steel,{r:0.3,m:0.55});
    g.add(box(tw+0.1,0.06,0.08,fm,0,0.3,0)); g.add(box(tw+0.1,0.06,0.08,fm,0,0.3,-0.3));
    g.add(box(0.06,0.42,0.5,fm,-tw/2,0.21,-0.11)); g.add(box(0.06,0.42,0.5,fm,tw/2,0.21,-0.11));
    for(let i=0;i<seats;i++){ const c=chair({color:opts.color||P.fabric}); c.position.set(-tw/2+sw/2+i*(sw+0.04),0,0); g.add(c); }
    return g;
  }
  function receptionDesk() {
    const g = new THREE.Group();
    const dm=M(P.white,{r:0.35}), tm=M(0xdfe8ec,{r:0.22,m:0.1}), am=M(P.accent,{r:0.3,m:0.15});
    g.add(box(4.2,1.05,0.8,dm,0,0.525,0)); g.add(box(4.3,0.06,0.9,tm,0,1.08,0));
    g.add(box(4.22,0.35,0.02,am,0,0.22,0.41));
    g.add(box(0.8,1.05,1.2,dm,-1.7,0.525,-0.2)); g.add(box(0.8,1.05,1.2,dm,1.7,0.525,-0.2));
    g.add(box(0.5,0.32,0.03,M(P.navy,{r:0.3}),0,1.42,-0.15));
    g.add(box(0.46,0.28,0.01,M(0x1a3a5c,{e:0x1a6a9c,ei:0.45}),0,1.42,-0.132));
    g.add(box(0.06,0.18,0.06,M(P.steel,{m:0.5}),0,1.17,-0.15));
    g.add(box(0.38,0.02,0.14,M(0x34495e),0,1.12,0.05));
    g.add(cyl(0.07,0.06,0.1,M(0xc0392b,{r:0.7}),-1.6,1.16,0.1)); g.add(sph(0.1,M(0x27ae60,{r:0.8}),-1.6,1.28,0.1));
    g.traverse(o=>{ if(o.isMesh){o.castShadow=true;o.receiveShadow=true;} });
    return g;
  }

  // ---- Equipment (product-representative, clear) ----
  function bedD8D() { // Saikang D8D
    const g = new THREE.Group();
    const frameM=M(P.white,{r:0.38}), railM=M(0xb8c8d8,{r:0.35,m:0.25});
    g.add(box(0.9,0.07,2.05,frameM,0,0.56,0)); // deck
    g.add(box(0.84,0.13,1.92,M(P.mattress,{r:0.85}),0,0.66,0)); // mattress
    g.add(box(0.8,0.05,0.48,M(P.mattress2,{r:0.8}),0,0.78,-0.68)); // pillow section
    // head/foot boards
    g.add(box(0.92,0.55,0.05,frameM,0,0.56,-1.02));
    g.add(box(0.92,0.42,0.05,frameM,0,0.50,1.02));
    // side rails
    g.add(box(0.03,0.28,0.95,railM,-0.455,0.78,0.12));
    g.add(box(0.03,0.28,0.95,railM,0.455,0.78,0.12));
    g.add(box(0.03,0.18,0.5,railM,-0.455,0.73,-0.72));
    g.add(box(0.03,0.18,0.5,railM,0.455,0.73,-0.72));
    // columns & base
    [[-0.4,-0.94],[0.4,-0.94],[-0.4,0.94],[0.4,0.94]].forEach(p=>{
      g.add(cyl(0.03,0.03,0.52,M(P.steel,{m:0.65}),p[0],0.26,p[1]));
      const w=cyl(0.055,0.055,0.03,M(0x1a1f24,{r:0.9}),p[0],0.055,p[1]); w.rotation.z=Math.PI/2; g.add(w);
    });
    // control panel hint
    g.add(box(0.12,0.08,0.02,M(0x34495e),0.3,0.72,-1.0));
    return g;
  }
  function stretcherSKB039F() { // SKB039(F)
    const g = new THREE.Group();
    g.add(box(0.72,0.06,1.95,M(0xc0c8ce,{r:0.35,m:0.45}),0,0.78,0));
    g.add(box(0.66,0.11,1.82,M(0x1f252b,{r:0.85}),0,0.865,0));
    g.add(box(0.68,0.45,0.04,M(0xb8c0c6,{r:0.4}),0,0.78,-0.96)); // head
    g.add(box(0.68,0.28,0.04,M(0xb8c0c6,{r:0.4}),0,0.78,0.96)); // foot
    // rails
    g.add(cyl(0.015,0.015,1.7,M(P.steel,{m:0.7}),-0.34,0.92,0,Math.PI/2));
    g.add(cyl(0.015,0.015,1.7,M(P.steel,{m:0.7}),0.34,0.92,0,Math.PI/2));
    // base/legs
    g.add(box(0.5,0.04,1.2,M(P.steel,{m:0.5}),0,0.45,0));
    [[-0.3,-0.85],[0.3,-0.85],[-0.3,0.85],[0.3,0.85]].forEach(p=>{
      g.add(cyl(0.025,0.025,0.42,M(P.steel,{m:0.6}),p[0],0.24,p[1]));
      const w=cyl(0.065,0.065,0.035,M(0x1a1f24),p[0],0.065,p[1]); w.rotation.z=Math.PI/2; g.add(w);
    });
    g.add(box(0.55,0.03,0.2,M(0xe74c3c,{r:0.5}),0,0.8,0.85)); // accent
    return g;
  }
  function hamiltonC6() { // ventilator
    const g = new THREE.Group();
    const bm=M(0xf0f3f5,{r:0.35});
    // trolley base
    for(let i=0;i<4;i++){const a=i/4*Math.PI*2+Math.PI/4; g.add(box(0.22,0.04,0.06,M(P.steel,{m:0.6}),Math.cos(a)*0.2,0.14,Math.sin(a)*0.2));}
    [[0.22,0.22],[-0.22,0.22],[0.22,-0.22],[-0.22,-0.22]].forEach(p=>{const w=cyl(0.055,0.055,0.03,M(0x1a1f24),p[0],0.055,p[1]);w.rotation.z=Math.PI/2;g.add(w);});
    g.add(cyl(0.04,0.04,0.78,M(0x2f3640,{r:0.4}),0,0.53,0));
    // main body
    g.add(box(0.42,0.38,0.32,bm,0,0.92,0));
    g.add(box(0.38,0.22,0.28,M(0xe6eaed,{r:0.4}),0,1.24,0));
    // screen (C6 large display)
    g.add(box(0.34,0.24,0.02,M(P.dark),0,1.52,0.05));
    g.add(box(0.31,0.21,0.01,M(P.screen,{e:0x0077aa,ei:0.55}),0,1.52,0.062));
    // screen arm
    g.add(box(0.05,0.18,0.05,M(0x3a4048),0,1.32,0.02));
    // breathing circuit ports
    g.add(cyl(0.025,0.025,0.08,M(P.steel,{m:0.6}),0.12,1.02,0.17,Math.PI/2));
    g.add(cyl(0.025,0.025,0.08,M(P.steel,{m:0.6}),-0.12,1.02,0.17,Math.PI/2));
    // Hamilton label area
    g.add(box(0.18,0.03,0.01,M(P.accent,{e:P.accent,ei:0.15}),0,0.78,0.165));
    return g;
  }
  function amoulE6Compressor() { // Amoul E6
    const g = new THREE.Group();
    // base/cart
    g.add(box(0.44,0.06,0.38,M(P.steel,{r:0.35,m:0.5}),0,0.32,0));
    [[-0.18,-0.15],[0.18,-0.15],[-0.18,0.15],[0.18,0.15]].forEach(p=>{const w=cyl(0.045,0.045,0.025,M(0x1a1f24),p[0],0.045,p[1]);w.rotation.z=Math.PI/2;g.add(w);});
    g.add(cyl(0.025,0.025,0.28,M(P.steel,{m:0.6}),0,0.49,0));
    // main housing
    g.add(box(0.38,0.42,0.3,M(0x2f3640,{r:0.4}),0,0.84,0));
    g.add(box(0.36,0.18,0.01,M(P.screen,{e:0x00aa55,ei:0.45}),0,0.9,0.156));
    // top handle/mechanism
    g.add(box(0.28,0.08,0.2,M(0x3a4048,{r:0.45}),0,1.09,0));
    g.add(cyl(0.06,0.06,0.12,M(0xe74c3c,{r:0.5}),0,1.18,0)); // compression head accent
    g.add(box(0.2,0.03,0.01,M(P.accent,{e:P.accent,ei:0.12}),0,0.72,0.156));
    return g;
  }
  function patientMonitor() {
    const g = new THREE.Group();
    g.add(cyl(0.22,0.24,0.03,M(P.steel,{m:0.6}),0,0.02,0,0,0,0,5));
    g.add(cyl(0.025,0.025,1.05,M(P.steel,{m:0.65}),0,0.55,0));
    g.add(box(0.34,0.24,0.05,M(P.dark),0,1.2,0));
    g.add(box(0.31,0.21,0.01,M(P.screen,{e:0x00bb66,ei:0.5}),0,1.2,0.031));
    return g;
  }
  function opTable() {
    const g = new THREE.Group();
    g.add(cyl(0.22,0.3,0.06,M(P.steel,{m:0.7}),0,0.08,0));
    g.add(cyl(0.05,0.05,0.72,M(P.steel,{m:0.7}),0,0.46,0));
    g.add(box(2.0,0.07,0.62,M(P.mattress,{r:0.8}),0,0.86,0));
    g.add(box(2.06,0.025,0.66,M(P.steel,{m:0.75,r:0.25}),0,0.905,0));
    g.add(box(0.4,0.06,0.58,M(P.mattress,{r:0.8}),-1.15,0.82,0,0,-0.15));
    return g;
  }
  function scialytic() {
    const g = new THREE.Group();
    g.add(cyl(0.045,0.045,1.4,M(P.steel,{m:0.65}),0,2.0,0));
    g.add(box(0.8,0.05,0.06,M(P.steel,{m:0.6}),0.2,2.72,0));
    g.add(cyl(0.52,0.52,0.1,M(P.white,{r:0.3}),0.55,2.68,0));
    g.add(cyl(0.42,0.42,0.04,M(0xfffef5,{e:0xfff8e0,ei:0.7}),0.55,2.62,0));
    g.add(cyl(0.04,0.04,0.25,M(P.steel,{m:0.6}),0.55,2.78,0));
    return g;
  }
  function anesthesiaCart() {
    const g = new THREE.Group();
    g.add(box(0.55,0.04,0.42,M(P.steel,{m:0.45}),0,0.9,0));
    g.add(box(0.55,0.04,0.42,M(P.steel,{m:0.45}),0,0.58,0));
    g.add(box(0.55,0.04,0.42,M(P.steel,{m:0.45}),0,0.26,0));
    [[-0.24,-0.18],[0.24,-0.18],[-0.24,0.18],[0.24,0.18]].forEach(p=>g.add(cyl(0.015,0.015,0.9,M(P.steel,{m:0.7}),p[0],0.45,p[1])));
    [[-0.22,-0.16],[0.22,-0.16],[-0.22,0.16],[0.22,0.16]].forEach(p=>{const w=cyl(0.04,0.04,0.025,M(0x1a1f24),p[0],0.04,p[1]);w.rotation.z=Math.PI/2;g.add(w);});
    g.add(box(0.18,0.12,0.1,M(P.dark),0,1.02,0)); g.add(box(0.15,0.09,0.01,M(P.screen,{e:0x0088cc,ei:0.35}),0,1.02,0.056));
    return g;
  }
  function medMachine(w,h,d,col,screenText) {
    const g = new THREE.Group();
    g.add(box(w,h,d,M(col||0x3a4550,{r:0.42}),0,h/2,0));
    g.add(box(w*0.72,h*0.28,0.01,M(P.screen,{e:0x0088aa,ei:0.35}),0,h*0.72,d/2+0.006));
    g.add(box(w*0.85,0.02,d*0.9,M(P.steel,{m:0.4,r:0.3}),0,h+0.01,0));
    return g;
  }
  function autoclave() { return medMachine(1.0,1.65,0.82,0xc8d2d8); }
  function washer() { return medMachine(1.0,1.4,0.72,0xd2dce2); }
  function imagingUnit() {
    const g = new THREE.Group();
    g.add(box(1.7,2.15,1.1,M(0xe8ecef,{r:0.32}),0,1.075,-0.2));
    g.add(box(1.3,0.35,0.01,M(P.screen,{e:0x0088aa,ei:0.25}),0,1.72,0.356));
    g.add(box(0.8,0.08,1.6,M(0x607d8b,{r:0.5}),0,0.78,1.1)); // table
    g.add(cyl(0.09,0.11,0.74,M(P.steel,{m:0.55}),0,0.37,1.1));
    return g;
  }
  function cabinet() {
    const g = new THREE.Group();
    g.add(box(0.5,1.65,0.45,M(P.white,{r:0.38}),0,0.825,0));
    g.add(box(0.46,0.72,0.015,M(P.glass,{r:0.1,t:true,op:0.25}),0,1.15,0.233));
    g.add(cyl(0.008,0.008,0.06,M(P.steel,{m:0.7}),0.18,1.15,0.245,Math.PI/2));
    return g;
  }
  function workTable() {
    const g = new THREE.Group();
    g.add(box(1.8,0.04,0.72,M(P.steel,{m:0.6,r:0.25}),0,0.85,0));
    [[-0.82,-0.3],[0.82,-0.3],[-0.82,0.3],[0.82,0.3]].forEach(p=>g.add(cyl(0.025,0.025,0.85,M(P.steel,{m:0.65}),p[0],0.425,p[1])));
    g.add(box(1.8,0.04,0.72,M(0xdfe6ea,{r:0.4}),0,0.55,0));
    return g;
  }

  // ---- Architecture ----
  function roomShell(w,d,h,accent) {
    const g = new THREE.Group();
    const wallM=M(P.wall,{r:0.88,side:THREE.DoubleSide});
    const baseM=M(accent||P.accent,{r:0.35,m:0.15});
    g.add(box(w,0.1,d,M(P.floor,{r:0.9}),0,-0.05,0));
    g.add(box(w-0.15,0.015,d-0.15,M(accent||P.accent,{r:0.3,t:true,op:0.08}),0,0.012,0));
    g.add(box(w,0.05,d,M(P.ceil,{r:0.95,t:true,op:0.22,side:THREE.DoubleSide}),0,h,0));
    // walls (open front toward corridor feel / doorway)
    g.add(box(w,h,0.1,wallM,0,h/2,-d/2)); // back
    g.add(box(0.1,h,d,wallM,-w/2,h/2,0)); // left
    g.add(box(0.1,h,d,wallM,w/2,h/2,0)); // right
    g.add(box(w*0.3,h,0.1,wallM,-w*0.35,h/2,d/2));
    g.add(box(w*0.3,h,0.1,wallM,w*0.35,h/2,d/2));
    g.add(box(w*0.4,h-2.25,0.1,wallM,0,2.25+(h-2.25)/2,d/2)); // above door
    // baseboards & accent
    g.add(box(w,0.09,0.02,baseM,0,0.045,-d/2+0.06));
    g.add(box(0.02,0.09,d,baseM,-w/2+0.06,0.045,0));
    g.add(box(0.02,0.09,d,baseM,w/2-0.06,0.045,0));
    // ceiling lights (bright)
    const lm=M(0xffffff,{e:0xf4fbff,ei:0.85});
    [[-w*0.22,-d*0.18],[w*0.22,-d*0.18],[-w*0.22,d*0.18],[w*0.22,d*0.18]].forEach(p=>g.add(box(0.9,0.03,0.18,lm,p[0],h-0.02,p[1])));
    return g;
  }

  const LAYOUT = {
    corridor: { x:0, w:3.6, h:3.1, z0:-5, len:44 },
    entrance: { x:0, z:-1 },
    rooms: [
      { id:'bloc', num:'01', name:'Bloc Opératoire', desc:'Table d\'opération, scialytique, chariot d\'anesthésie, monitorage', x:-5.3, z:4, w:7, d:6.2, side:'left', accent:0x0077b6 },
      { id:'rea',  num:'02', name:'Anesthésie-Réanimation', desc:'Lit Saikang D8D, ventilateur Hamilton C6, moniteur patient', x:5.3, z:9.5, w:7, d:6.2, side:'right', accent:0x0096c7 },
      { id:'urg',  num:'03', name:'Urgences', desc:'Brancard SKB039(F), compresseur thoracique Amoul E6, moniteur', x:-5.3, z:15, w:7, d:6.2, side:'left', accent:0x023e8a },
      { id:'rad',  num:'04', name:'Radiologie / Imagerie', desc:'Unité d\'imagerie, table d\'examen, poste de contrôle', x:5.3, z:20.5, w:7, d:6.2, side:'right', accent:0x48cae4 },
      { id:'ster', num:'05', name:'Stérilisation', desc:'Autoclave, laveur-désinfecteur, tables de conditionnement', x:-5.3, z:26, w:7, d:6.2, side:'left', accent:0x0096c7 },
      { id:'mob',  num:'06', name:'Mobilier Médical', desc:'2× Lits médicaux Saikang D8D, mobilier de chambre', x:5.3, z:31.5, w:7, d:6.2, side:'right', accent:0x00b4d8 }
    ]
  };

  function buildCorridor() {
    const c = LAYOUT.corridor; const g = new THREE.Group();
    g.add(box(c.w,0.1,c.len,M(P.corridor,{r:0.88}),c.x,-0.05,c.z0+c.len/2));
    g.add(box(c.w,0.05,c.len,M(P.ceil,{r:0.95,t:true,op:0.18,side:THREE.DoubleSide}),c.x,c.h,c.z0+c.len/2));
    // guideline
    g.add(box(0.18,0.012,c.len-1,M(P.accent,{e:P.accent,ei:0.1,r:0.4,t:true,op:0.45}),0,0.012,c.z0+c.len/2));
    // side walls (low/clear architectural)
    g.add(box(0.08,1.2,c.len,M(P.wall2,{r:0.85}),-c.w/2,0.6,c.z0+c.len/2));
    g.add(box(0.08,1.2,c.len,M(P.wall2,{r:0.85}),c.w/2,0.6,c.z0+c.len/2));
    g.add(box(0.1,0.045,c.len,M(P.accent,{r:0.3,m:0.15}),-c.w/2,1.22,c.z0+c.len/2));
    g.add(box(0.1,0.045,c.len,M(P.accent,{r:0.3,m:0.15}),c.w/2,1.22,c.z0+c.len/2));
    // bright lights
    const lm=M(0xffffff,{e:0xf6fcff,ei:0.9});
    for(let z=0;z<c.len-2;z+=3.5) g.add(box(1.6,0.03,0.16,lm,0,c.h-0.02,c.z0+2+z));
    // end wall
    g.add(box(c.w+0.2,c.h,0.1,M(P.wall),0,c.h/2,c.z0+c.len));
    const lbl = label('CIRCULATION PRINCIPALE','Accès aux services',{sc:2.2});
    lbl.position.set(0,2.5,c.z0+c.len/2); g.add(lbl);
    scene.add(g);
  }

  function buildEntrance() {
    const g = new THREE.Group();
    const w=10,d=7,h=3.4;
    // shell
    g.add(box(w,0.1,d,M(P.floor,{r:0.88}),0,-0.05,0));
    g.add(box(w,0.05,d,M(P.ceil,{r:0.95,t:true,op:0.2,side:THREE.DoubleSide}),0,h,0));
    g.add(box(w,1.2,0.1,M(P.wall,{r:0.88}),0,0.6,-d/2));
    g.add(box(0.1,1.2,d,M(P.wall,{r:0.88}),-w/2,0.6,0));
    g.add(box(0.1,1.2,d,M(P.wall,{r:0.88}),w/2,0.6,0));
    // accent top
    g.add(box(w,0.045,0.12,M(P.accent,{r:0.3,m:0.15}),0,1.22,-d/2));
    // glass front suggestion
    g.add(box(w*0.38,1.2,0.06,M(P.glass,{r:0.1,t:true,op:0.2}),-w*0.31,0.6,d/2));
    g.add(box(w*0.38,1.2,0.06,M(P.glass,{r:0.1,t:true,op:0.2}),w*0.31,0.6,d/2));
    // lights
    g.add(box(3.5,0.03,0.2,M(0xffffff,{e:0xffffff,ei:0.8}),0,h-0.02,0));
    g.add(box(1.2,0.03,0.16,M(0xffffff,{e:0xffffff,ei:0.8}),-3,h-0.02,-1.5));
    g.add(box(1.2,0.03,0.16,M(0xffffff,{e:0xffffff,ei:0.8}),3,h-0.02,-1.5));

    // Reception desk + receptionist
    const desk = receptionDesk(); desk.position.set(0,0,-1.6); g.add(desk);
    const recep = person({cloth:P.white,cloth2:0x2c3e50,skin:P.skin2,hair:0x1a1a1a,uniform:true,scale:1});
    recep.position.set(0,0,-2.4); recep.rotation.y = 0; g.add(recep);
    const badge = box(0.08,0.05,0.01,M(P.accent,{e:P.accent,ei:0.35}),0.1,1.05,-2.29); g.add(badge);
    const recLbl = label('ACCUEIL / RÉCEPTION','Réceptionniste disponible',{sc:1.8});
    recLbl.position.set(0,2.3,-2.0); g.add(recLbl);

    // Waiting area - benches + patients (100% visible)
    const b1 = bench(3,{color:P.fabric}); b1.position.set(-2.4,0,1.5); g.add(b1);
    const b2 = bench(2,{color:P.fabric2}); b2.position.set(2.6,0,1.7); b2.rotation.y=-0.12; g.add(b2);
    // seated patients
    const seated = [
      {x:-2.96,z:1.5,rot:Math.PI+0.08,cloth:0x34495e,skin:P.skin},
      {x:-1.84,z:1.5,rot:Math.PI-0.06,cloth:0x16a085,skin:P.skin2},
      {x:2.32,z:1.72,rot:Math.PI+0.18,cloth:0x8e44ad,skin:P.skin},
      {x:2.88,z:1.66,rot:Math.PI+0.06,cloth:0xd35400,skin:P.skin2}
    ];
    seated.forEach(p=>{
      const per = person({cloth:p.cloth,cloth2:0x2c3e50,skin:p.skin,sitting:true,scale:0.96});
      per.position.set(p.x,0,p.z); per.rotation.y=p.rot; g.add(per);
    });
    // standing patient at desk
    const stand = person({cloth:0x2980b9,cloth2:0x34495e,skin:P.skin,scale:0.96});
    stand.position.set(-0.9,0,0.1); stand.rotation.y = Math.PI; g.add(stand);

    // waiting table + plant
    g.add(cyl(0.28,0.28,0.04,M(0xdfe8ec,{r:0.3}),0,0.42,1.6));
    g.add(cyl(0.03,0.04,0.42,M(P.steel,{m:0.5}),0,0.21,1.6));
    g.add(cyl(0.18,0.18,0.02,M(P.steel,{m:0.5}),0,0.01,1.6));
    g.add(box(0.2,0.015,0.26,M(P.accent,{r:0.6}),0.05,0.45,1.6));
    [[-4.3,-2.6],[4.3,-2.6]].forEach(p=>{
      g.add(cyl(0.18,0.15,0.35,M(0xbdc3c7,{r:0.6}),p[0],0.175,p[1]));
      g.add(sph(0.28,M(0x27ae60,{r:0.85}),p[0],0.52,p[1]));
    });

    const hallLbl = label('Hall d\'accueil','Bienvenue — La Maison Africaine du Médecin',{sc:2.0,accent:'#00c8ee'});
    hallLbl.position.set(0,2.75,0.5); g.add(hallLbl);

    g.position.set(LAYOUT.entrance.x,0,LAYOUT.entrance.z);
    scene.add(g);
  }

  function addRoomContents(r) {
    const g = new THREE.Group();
    if (r.id === 'bloc') {
      const t = opTable(); g.add(t);
      const sc = scialytic(); g.add(sc);
      const cart = anesthesiaCart(); cart.position.set(-2.4,-0,-1.6); cart.rotation.y=Math.PI/3; g.add(cart);
      const mon = patientMonitor(); mon.position.set(-1.8,0,1.8); g.add(mon);
      const vent = hamiltonC6(); vent.position.set(-2.6,0,0.2); vent.rotation.y=Math.PI/2; g.add(vent);
      const cab = cabinet(); cab.position.set(2.8,0,-2.2); cab.rotation.y=-Math.PI/2; g.add(cab);
      const doc = person({cloth:P.green,cloth2:P.green,skin:P.skin2,uniform:true,scale:0.9});
      doc.position.set(1.0,0,0.2); doc.rotation.y=-Math.PI/2; g.add(doc);
      const lbl = label('01 Bloc Opératoire','Table d\'opération • Scialytique • Anesthésie',{sc:2.1,accent:'#0077b6'}); lbl.position.set(0,2.55,0); g.add(lbl);
    } else if (r.id === 'rea') {
      const b = bedD8D(); g.add(b);
      const vent = hamiltonC6(); vent.position.set(-2.3,0,-1.4); vent.rotation.y=Math.PI/3; g.add(vent);
      const mon = patientMonitor(); mon.position.set(-1.6,0,-2.1); g.add(mon);
      const cart = anesthesiaCart(); cart.position.set(2.4,0,1.5); cart.rotation.y=-Math.PI/2; g.add(cart);
      const cab = cabinet(); cab.position.set(2.8,0,-2.0); cab.rotation.y=-Math.PI/2; g.add(cab);
      const lbl = label('02 Anesthésie-Réanimation','Lit Saikang D8D • Hamilton C6 • Monitorage',{sc:2.1,accent:'#0096c7'}); lbl.position.set(0,2.55,0); g.add(lbl);
    } else if (r.id === 'urg') {
      const st = stretcherSKB039F(); g.add(st);
      const comp = amoulE6Compressor(); comp.position.set(2.1,0,-1.5); comp.rotation.y=-Math.PI/4; g.add(comp);
      const mon = patientMonitor(); mon.position.set(-2.0,0,-1.6); g.add(mon);
      const vent = hamiltonC6(); vent.position.set(-2.4,0,1.2); vent.rotation.y=Math.PI/2; g.add(vent);
      const cart = anesthesiaCart(); cart.position.set(2.5,0,1.5); cart.rotation.y=-Math.PI/2; g.add(cart);
      const nurse = person({cloth:0x27ae60,cloth2:0x1e8449,skin:P.skin,uniform:true,scale:0.9});
      nurse.position.set(1.2,0,0.8); nurse.rotation.y=-2.2; g.add(nurse);
      const lbl = label('03 Urgences','Brancard SKB039(F) • Amoul E6 • Ventilation',{sc:2.1,accent:'#023e8a'}); lbl.position.set(0,2.55,0); g.add(lbl);
    } else if (r.id === 'rad') {
      const img = imagingUnit(); g.add(img);
      const mon = patientMonitor(); mon.position.set(-2.4,0,-1.8); g.add(mon);
      const cab = cabinet(); cab.position.set(2.8,0,-2.2); cab.rotation.y=-Math.PI/2; g.add(cab);
      // lead screen
      g.add(box(1.8,1.2,0.06,M(P.glass,{r:0.15,t:true,op:0.22}),-2.2,0.6,1.2));
      g.add(box(1.84,0.04,0.1,M(P.steel,{m:0.4}),-2.2,1.22,1.2));
      const lbl = label('04 Radiologie / Imagerie','Unité d\'imagerie • Table d\'examen • Protection',{sc:2.1,accent:'#48cae4'}); lbl.position.set(0,2.55,-0.2); g.add(lbl);
    } else if (r.id === 'ster') {
      const ac = autoclave(); ac.position.set(-1.9,0,-1.8); g.add(ac);
      const wa = washer(); wa.position.set(0.2,0,-1.8); g.add(wa);
      const wt = workTable(); wt.position.set(0,0,1.5); wt.rotation.y=Math.PI/2; g.add(wt);
      const c1 = anesthesiaCart(); c1.position.set(2.4,0,0.2); c1.rotation.y=-Math.PI/2; g.add(c1);
      const cab = cabinet(); cab.position.set(-2.8,0,1.6); cab.rotation.y=Math.PI/2; g.add(cab);
      const lbl = label('05 Stérilisation','Autoclave • Laveur-désinfecteur • Conditionnement',{sc:2.1,accent:'#0096c7'}); lbl.position.set(0,2.55,-0.8); g.add(lbl);
    } else if (r.id === 'mob') {
      const b1 = bedD8D(); b1.position.x = -1.5; g.add(b1);
      const b2 = bedD8D(); b2.position.x = 1.5; g.add(b2);
      // bedside tables
      g.add(box(0.45,0.55,0.4,M(P.white,{r:0.38}),-2.85,0.275,-0.5));
      g.add(box(0.45,0.55,0.4,M(P.white,{r:0.38}),2.85,0.275,-0.5));
      // overbed table
      g.add(cyl(0.015,0.015,0.7,M(P.steel,{m:0.65}),0,0.35,1.9));
      g.add(box(0.7,0.03,0.45,M(0xdfe8ec,{r:0.35}),0,0.72,1.9));
      const cab = cabinet(); cab.position.set(-2.8,0,1.6); cab.rotation.y=Math.PI/2; g.add(cab);
      const lbl = label('06 Mobilier Médical','2× Lits médicaux Saikang D8D • Mobilier de chambre',{sc:2.1,accent:'#00b4d8'}); lbl.position.set(0,2.55,-0.5); g.add(lbl);
    }
    g.position.set(r.x, 0, r.z);
    scene.add(g);
  }

  function buildRooms() {
    LAYOUT.rooms.forEach(r => {
      const shell = roomShell(r.w, r.d, 3.1, r.accent);
      shell.position.set(r.x, 0, r.z);
      scene.add(shell);
      addRoomContents(r);
    });
  }

  function buildGround() {
    const gnd = box(80,0.2,90,M(0x6f8a84,{r:0.95}),0,-0.14,14);
    gnd.receiveShadow = true; scene.add(gnd);
    scene.add(box(38,0.06,50,M(0x93a8a2,{r:0.9}),0,-0.05,14));
  }

  // ---- Tour path ----
  function kf(t, pos, look, room) { return {t,pos,look,room}; }
  const R = (id)=>LAYOUT.rooms.find(r=>r.id===id);
  const keyframes = [
    kf(0.00,[0,1.65,5.0],[0,1.45,-1.5],{num:'ACCUEIL',name:"Hall d'accueil",desc:'Réception, réceptionniste et patients en attente'}),
    kf(0.04,[0,1.65,1.8],[0,1.35,-2.2],{num:'ACCUEIL',name:"Réception & Accueil",desc:'Réceptionniste disponible — patients assis sur les banquettes'}),
    kf(0.07,[ -1.2,1.62,0.2],[0,1.0,-1.8],{num:'ACCUEIL',name:"Espace d'attente",desc:'Patients visibles, accueil clair et professionnel'}),
    kf(0.10,[0,1.65,-3.2],[0,1.5,4],{num:'COULOIR',name:'Circulation principale',desc:'Couloir lumineux — accès aux services de soins'}),
    kf(0.13,[0,1.65,2.5],[-3.5,1.3,4],{num:'COULOIR',name:'Vers Bloc Opératoire',desc:'Service 01 — Chirurgie'}),

    kf(0.16,[-2.8,1.68,4],[-5.3,1.1,4],{num:'01',name:'Bloc Opératoire',desc:'Table d\'opération, scialytique, Hamilton C6, monitorage'}),
    kf(0.21,[-5.2,1.58,5.5],[-5.3,0.95,3.5],{num:'01',name:'Bloc Opératoire',desc:'Équipements de bloc clairement visibles'}),
    kf(0.24,[-2.8,1.65,4],[0,1.5,4],{num:'01',name:'Bloc Opératoire',desc:'Retour vers la circulation'}),

    kf(0.27,[0,1.65,7.5],[3.5,1.3,9.5],{num:'COULOIR',name:'Vers Anesthésie-Réanimation',desc:'Couloir clair — Service 02'}),
    kf(0.30,[2.8,1.68,9.5],[5.3,1.05,9.5],{num:'02',name:'Anesthésie-Réanimation',desc:'Lit Saikang D8D, Hamilton C6, monitorage patient'}),
    kf(0.35,[5.2,1.55,11],[5.3,0.95,9],{num:'02',name:'Anesthésie-Réanimation',desc:'Surveillance et ventilation — équipements visibles'}),
    kf(0.38,[2.8,1.65,9.5],[0,1.5,9.5],{num:'02',name:'Anesthésie-Réanimation',desc:'Retour vers la circulation'}),

    kf(0.41,[0,1.65,13],[ -3.5,1.3,15],{num:'COULOIR',name:'Vers Urgences',desc:'Couloir lumineux — Service 03'}),
    kf(0.44,[-2.8,1.68,15],[-5.3,1.0,15],{num:'03',name:'Urgences',desc:'Brancard SKB039(F), compresseur Amoul E6, Hamilton C6'}),
    kf(0.49,[-5.1,1.55,16.5],[-5.3,0.9,14.5],{num:'03',name:'Urgences',desc:'Prise en charge urgente — matériel clairement identifiable'}),
    kf(0.52,[-2.8,1.65,15],[0,1.5,15],{num:'03',name:'Urgences',desc:'Retour vers la circulation'}),

    kf(0.55,[0,1.65,18.5],[3.5,1.3,20.5],{num:'COULOIR',name:'Vers Radiologie',desc:'Couloir clair — Service 04 Imagerie'}),
    kf(0.58,[2.8,1.72,20.5],[5.3,1.2,20.5],{num:'04',name:'Radiologie / Imagerie',desc:'Unité d\'imagerie, table d\'examen, protection radiologique'}),
    kf(0.63,[5.0,1.6,22],[5.3,1.1,20],{num:'04',name:'Radiologie / Imagerie',desc:'Diagnostic par imagerie — espace clair'}),
    kf(0.66,[2.8,1.65,20.5],[0,1.5,20.5],{num:'04',name:'Radiologie / Imagerie',desc:'Retour vers la circulation'}),

    kf(0.69,[0,1.65,24],[-3.5,1.3,26],{num:'COULOIR',name:'Vers Stérilisation',desc:'Couloir lumineux — Service 05'}),
    kf(0.72,[-2.8,1.68,26],[-5.3,1.1,26],{num:'05',name:'Stérilisation',desc:'Autoclave, laveur-désinfecteur, conditionnement'}),
    kf(0.77,[-5.0,1.58,27.5],[-5.3,1.0,25.5],{num:'05',name:'Stérilisation',desc:'Circuit de stérilisation — équipements visibles'}),
    kf(0.80,[-2.8,1.65,26],[0,1.5,26],{num:'05',name:'Stérilisation',desc:'Retour vers la circulation'}),

    kf(0.83,[0,1.65,29.5],[3.5,1.3,31.5],{num:'COULOIR',name:'Vers Mobilier Médical',desc:'Couloir clair — Service 06'}),
    kf(0.86,[2.8,1.72,31.5],[5.3,1.05,31.5],{num:'06',name:'Mobilier Médical',desc:'2× Lits médicaux Saikang D8D, mobilier de chambre'}),
    kf(0.92,[5.0,1.58,33],[5.3,0.95,31],{num:'06',name:'Mobilier Médical',desc:'Deux lits D8D clairement visibles et équipés'}),
    kf(0.96,[2.8,1.65,31.5],[0,1.5,31.5],{num:'06',name:'Mobilier Médical',desc:'Retour vers la circulation'}),

    kf(1.00,[1.5,1.85,28],[0,1.4,16],{num:'FIN',name:'Visite terminée',desc:'Merci — La Maison Africaine du Médecin'})
  ];

  const steps = [
    {t:0.00,label:'Accueil'},{t:0.16,label:'01 Bloc'},{t:0.30,label:'02 Réa'},
    {t:0.44,label:'03 Urgences'},{t:0.58,label:'04 Radio'},{t:0.72,label:'05 Stéril.'},{t:0.86,label:'06 Mobilier'}
  ];

  function lerp(a,b,t){return a+(b-a)*t;}
  function lerp3(a,b,t){return [lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];}
  function ease(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
  function sample(t){
    t=Math.max(0,Math.min(1,t)); let i=0;
    while(i<keyframes.length-2 && keyframes[i+1].t < t) i++;
    const a=keyframes[i], b=keyframes[i+1];
    const local=(b.t===a.t)?0:(t-a.t)/(b.t-a.t), e=ease(local);
    return { pos:lerp3(a.pos,b.pos,e), look:lerp3(a.look,b.look,e), room: local<0.45?a.room:b.room };
  }
  function fmt(s){ const m=Math.floor(s/60),sec=Math.floor(s%60); return m+':'+(sec<10?'0':'')+sec; }

  function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd7e6ed); // bright, clear
    scene.fog = new THREE.Fog(0xd7e6ed, 28, 75);   // very light fog, keeps depth but stays clear

    camera = new THREE.PerspectiveCamera(58, window.innerWidth/window.innerHeight, 0.1, 120);
    camera.position.set(0,1.65,5);

    renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false});
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.outputEncoding = THREE.sRGBEncoding;

    // Bright clinical lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    scene.add(new THREE.HemisphereLight(0xe8f6ff, 0xb8c8c4, 0.55));
    const sun = new THREE.DirectionalLight(0xfff8ea, 0.65);
    sun.position.set(10,22,8); sun.castShadow = true;
    sun.shadow.mapSize.set(2048,2048);
    sun.shadow.camera.left=-28; sun.shadow.camera.right=28;
    sun.shadow.camera.top=28; sun.shadow.camera.bottom=-28;
    sun.shadow.camera.far=70; sun.shadow.bias=-0.0004;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xddeeff, 0.25); fill.position.set(-12,14,-6); scene.add(fill);

    buildGround();
    buildCorridor();
    buildEntrance();
    buildRooms();

    // UI steps
    steps.forEach(s=>{
      const btn = document.createElement('button'); btn.className='tour-step'; btn.textContent=s.label;
      btn.addEventListener('click',()=>{ elapsed=s.t*DURATION; playing=true; playPauseBtn.textContent='❚❚'; });
      stepsEl.appendChild(btn); s._btn=btn;
    });
    playPauseBtn.addEventListener('click',()=>{ playing=!playing; playPauseBtn.textContent=playing?'❚❚':'▶'; });
    progressEl.addEventListener('click',(e)=>{ const r=progressEl.getBoundingClientRect(); elapsed=((e.clientX-r.left)/r.width)*DURATION; });
    window.addEventListener('resize',()=>{ camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth,window.innerHeight); });

    clock = new THREE.Clock();
    loading.classList.add('hidden');
    animate();
  }

  let lastRoomName='';
  function animate(){
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (playing) { elapsed += dt; if (elapsed>=DURATION){ elapsed=DURATION; playing=false; playPauseBtn.textContent='▶'; } }
    const t = elapsed/DURATION;
    const s = sample(t);
    camera.position.set(s.pos[0],s.pos[1],s.pos[2]);
    camera.lookAt(s.look[0],s.look[1],s.look[2]);
    progressBar.style.width = (t*100)+'%';
    timeLabel.textContent = fmt(elapsed)+' / '+fmt(DURATION);
    if (s.room && s.room.name !== lastRoomName) {
      lastRoomName = s.room.name;
      roomNumEl.textContent = s.room.num; roomNameEl.textContent = s.room.name; roomDescEl.textContent = s.room.desc;
    }
    steps.forEach(st=> st._btn && st._btn.classList.toggle('active', Math.abs(t-st.t) < 0.035));
    renderer.render(scene, camera);
  }

  if (window.THREE) init(); else window.addEventListener('load', init);
})();
