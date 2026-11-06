/* ============================================================
   clinique.js — Plan 3D architectural de la clinique
   La Maison Africaine du Médecin
   Style: bleu/cyan professionnel, vue architecturale
   ============================================================ */
(function () {
  'use strict';

  const canvas = document.getElementById('c');
  const loading = document.getElementById('loading');
  const roomInfo = document.getElementById('roomInfo');
  const riNum = document.getElementById('riNum');
  const riTitle = document.getElementById('riTitle');
  const riDesc = document.getElementById('riDesc');
  const legendEl = document.getElementById('legend');

  let renderer, scene, camera, clock, raycaster, mouse;
  let orbitTheta = -0.65, orbitPhi = 0.85, orbitRadius = 38;
  let orbitTarget = new THREE.Vector3(0, 0, 8);
  let isDragging = false, prev = {x:0,y:0}, moved = false, downPos = {x:0,y:0};
  let camAnim = null;
  let roomMeshes = [];

  // Architectural blue palette
  const PAL = {
    floor:     0xf4f7f8,
    floorAlt:  0xeef3f5,
    wall:      0xe8eff2,
    wallOuter: 0xd4e0e6,
    wallTop:   0xc8d8e0,
    glass:     0xa8d8e8,
    glassTint: 0x7ec8dd,
    accent:    0x00a8cc,
    accentGlow:0x00c8ee,
    navy:      0x0b2239,
    navyLight: 0x163a54,
    steel:     0x9aaab4,
    white:     0xffffff,
    wood:      0xc4a882,
    fabric:    0x1a5f8a,
    fabricLight:0x2980b9,
    skin:      0xd4a574,
    skinDark:  0x8d5524,
    hair:      0x2c1810,
    uniform:   0xffffff,
    uniformTrim:0x00a8cc,
    green:     0x2ecc71,
    red:       0xe74c3c,
    corridor:  0xf0f4f6,
    ceiling:   0xfafcfd
  };

  const ROOMS = [
    { id:'reception',   num:'ACCUEIL', name:'Réception & Accueil',    color:0x00b4d8, desc:'Accueil des patients, orientation et admissions', pos:[0,0,0], size:[10,7] },
    { id:'bloc',        num:'01',      name:'Bloc Opératoire',        color:0x0077b6, desc:'Salle d\'opération équipée : table, scialytique, anesthésie', pos:[-11,0,6], size:[8,7] },
    { id:'rea',         num:'02',      name:'Anesthésie-Réanimation',  color:0x0096c7, desc:'Surveillance et réanimation : lit D8D, Hamilton C6, monitorage', pos:[11,0,6], size:[8,7] },
    { id:'urgences',    num:'03',      name:'Urgences',                color:0x023e8a, desc:'Prise en charge urgente : brancard SKB039F, défibrillateur, compresseur', pos:[-11,0,14.5], size:[8,7] },
    { id:'radio',       num:'04',      name:'Radiologie / Imagerie',   color:0x48cae4, desc:'Imagerie médicale et diagnostic', pos:[11,0,14.5], size:[8,7] },
    { id:'steril',      num:'05',      name:'Stérilisation',           color:0x0096c7, desc:'Traitement et stérilisation des dispositifs médicaux', pos:[-11,0,23], size:[8,7] },
    { id:'mobilier',    num:'06',      name:'Mobilier Médical',        color:0x00b4d8, desc:'Chambre équipée : 2× lits Saikang D8D, mobilier de soins', pos:[11,0,23], size:[8,7] },
  ];

  function M(color, opts) {
    opts = opts || {};
    const p = { color, roughness: opts.r != null ? opts.r : 0.6, metalness: opts.m != null ? opts.m : 0.05 };
    if (opts.transparent) { p.transparent = true; p.opacity = opts.opacity != null ? opts.opacity : 0.35; }
    if (opts.emissive) { p.emissive = opts.emissive; p.emissiveIntensity = opts.ei || 0.3; }
    if (opts.side) p.side = opts.side;
    return new THREE.MeshStandardMaterial(p);
  }

  function box(w,h,d,mat,x,y,z) { const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x||0,y||0,z||0); m.castShadow=true; m.receiveShadow=true; return m; }
  function cyl(rt,rb,h,mat,x,y,z,s) { const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,s||16),mat); m.position.set(x||0,y||0,z||0); m.castShadow=true; m.receiveShadow=true; return m; }
  function sphere(r,mat,x,y,z,s) { const m=new THREE.Mesh(new THREE.SphereGeometry(r,s||16,s||12),mat); m.position.set(x||0,y||0,z||0); m.castShadow=true; return m; }
  function rbox(w,h,d,r,mat,x,y,z) { // rounded-ish box using basic box + slight bevel visual via edges handled separately
    return box(w,h,d,mat,x,y,z);
  }

  function addEdges(mesh, color, threshold) {
    const edges = new THREE.EdgesGeometry(mesh.geometry, threshold || 15);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: color || 0x0077b6, transparent: true, opacity: 0.35 }));
    line.position.copy(mesh.position);
    line.rotation.copy(mesh.rotation);
    mesh.parent && mesh.parent.add(line);
    return line;
  }

  function makeLabelSprite(text, sub, opts) {
    opts = opts || {};
    const c = document.createElement('canvas');
    c.width = 1024; c.height = sub ? 220 : 140;
    const ctx = c.getContext('2d');
    // bg pill
    ctx.fillStyle = opts.bg || 'rgba(7,24,42,0.82)';
    const pad = 30, bh = c.height - 30;
    ctx.beginPath(); ctx.roundRect(pad, 15, c.width-pad*2, bh, 18); ctx.fill();
    ctx.strokeStyle = opts.border || 'rgba(0,200,238,0.55)';
    ctx.lineWidth = 3; ctx.stroke();
    // accent bar
    ctx.fillStyle = opts.accent || '#00c8ee';
    ctx.fillRect(pad + 18, 32, 6, sub ? 156 : 76);
    // text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px "Segoe UI", Arial';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, pad + 44, sub ? 72 : 85);
    if (sub) {
      ctx.fillStyle = '#8ed8ec';
      ctx.font = '30px "Segoe UI", Arial';
      ctx.fillText(sub, pad + 44, 135);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    const sc = opts.scale || 3.2;
    sp.scale.set(sc, sc * (c.height/c.width), 1);
    sp.renderOrder = 10;
    return sp;
  }

  function makeFloorLabel(text) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0,119,182,0.10)';
    ctx.fillRect(0,0,512,128);
    ctx.strokeStyle = 'rgba(0,168,204,0.3)';
    ctx.lineWidth = 2; ctx.strokeRect(4,4,504,120);
    ctx.fillStyle = '#0b5f8a';
    ctx.font = 'bold 44px "Segoe UI", Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);
    const tex = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    m.rotation.x = -Math.PI/2;
    m.position.y = 0.02;
    return m;
  }

  // ---- Person figure (stylized architectural) ----
  function buildPerson(opts) {
    opts = opts || {};
    const g = new THREE.Group();
    const skin = M(opts.skin || PAL.skin, {r:0.7});
    const cloth = M(opts.cloth || PAL.fabric, {r:0.75});
    const cloth2 = M(opts.cloth2 || opts.cloth || PAL.fabric, {r:0.75});
    const hairM = M(opts.hair || PAL.hair, {r:0.85});
    const shoeM = M(0x2c3e50, {r:0.6});

    const sit = !!opts.sitting;
    const s = opts.scale || 1;

    // legs
    if (sit) {
      // thighs forward, calves down
      const lt = box(0.14*s, 0.14*s, 0.38*s, cloth2, -0.1*s, 0.48*s, 0.12*s);
      const rt = box(0.14*s, 0.14*s, 0.38*s, cloth2, 0.1*s, 0.48*s, 0.12*s);
      g.add(lt, rt);
      g.add(box(0.13*s, 0.38*s, 0.13*s, cloth2, -0.1*s, 0.24*s, 0.28*s));
      g.add(box(0.13*s, 0.38*s, 0.13*s, cloth2, 0.1*s, 0.24*s, 0.28*s));
      g.add(box(0.15*s, 0.08*s, 0.22*s, shoeM, -0.1*s, 0.04*s, 0.32*s));
      g.add(box(0.15*s, 0.08*s, 0.22*s, shoeM, 0.1*s, 0.04*s, 0.32*s));
    } else {
      g.add(box(0.14*s, 0.48*s, 0.14*s, cloth2, -0.1*s, 0.24*s, 0));
      g.add(box(0.14*s, 0.48*s, 0.14*s, cloth2, 0.1*s, 0.24*s, 0));
      g.add(box(0.16*s, 0.08*s, 0.24*s, shoeM, -0.1*s, 0.04*s, 0.03*s));
      g.add(box(0.16*s, 0.08*s, 0.24*s, shoeM, 0.1*s, 0.04*s, 0.03*s));
    }

    const hipY = sit ? 0.55*s : 0.48*s;
    // torso
    g.add(box(0.36*s, 0.42*s, 0.22*s, cloth, 0, hipY + 0.21*s, 0));
    // collar/detail for receptionist
    if (opts.uniform) {
      g.add(box(0.18*s, 0.08*s, 0.23*s, M(PAL.uniformTrim,{r:0.5}), 0, hipY + 0.38*s, 0));
    }
    // head
    const headY = hipY + 0.42*s + 0.14*s;
    g.add(sphere(0.13*s, skin, 0, headY, 0, 14));
    // hair
    g.add(sphere(0.135*s, hairM, 0, headY + 0.04*s, -0.01*s, 14));
    g.add(box(0.26*s, 0.06*s, 0.22*s, hairM, 0, headY + 0.11*s, 0));
    // arms
    const shoulderY = hipY + 0.34*s;
    if (sit) {
      g.add(box(0.11*s, 0.32*s, 0.11*s, cloth, -0.24*s, shoulderY - 0.06*s, 0.06*s));
      g.add(box(0.11*s, 0.32*s, 0.11*s, cloth, 0.24*s, shoulderY - 0.06*s, 0.06*s));
      g.add(sphere(0.055*s, skin, -0.24*s, shoulderY - 0.24*s, 0.08*s));
      g.add(sphere(0.055*s, skin, 0.24*s, shoulderY - 0.24*s, 0.08*s));
    } else {
      g.add(box(0.11*s, 0.36*s, 0.11*s, cloth, -0.24*s, shoulderY - 0.14*s, 0));
      g.add(box(0.11*s, 0.36*s, 0.11*s, cloth, 0.24*s, shoulderY - 0.14*s, 0));
      g.add(sphere(0.055*s, skin, -0.24*s, shoulderY - 0.34*s, 0));
      g.add(sphere(0.055*s, skin, 0.24*s, shoulderY - 0.34*s, 0));
    }

    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  // ---- Furniture ----
  function buildReceptionDesk() {
    const g = new THREE.Group();
    const deskM = M(PAL.white, {r:0.35});
    const topM = M(0xdfe8ec, {r:0.25, m:0.1});
    const accentM = M(PAL.accent, {r:0.3, m:0.15});
    // main counter
    g.add(box(4.2, 1.05, 0.8, deskM, 0, 0.525, 0));
    g.add(box(4.3, 0.06, 0.9, topM, 0, 1.08, 0));
    // front accent panel
    g.add(box(4.22, 0.35, 0.02, accentM, 0, 0.22, 0.41));
    // side returns
    g.add(box(0.8, 1.05, 1.2, deskM, -1.7, 0.525, -0.2));
    g.add(box(0.8, 1.05, 1.2, deskM, 1.7, 0.525, -0.2));
    // monitor
    g.add(box(0.5, 0.32, 0.03, M(PAL.navy,{r:0.3}), 0, 1.42, -0.15));
    g.add(box(0.46, 0.28, 0.01, M(0x1a3a5c,{emissive:0x1a6a9c,ei:0.4}), 0, 1.42, -0.132));
    g.add(box(0.06, 0.18, 0.06, M(PAL.steel,{m:0.5}), 0, 1.17, -0.15));
    // keyboard
    g.add(box(0.38, 0.02, 0.14, M(0x34495e), 0, 1.12, 0.05));
    // small plant
    g.add(cyl(0.07,0.06,0.1, M(0xc0392b,{r:0.7}), -1.6, 1.16, 0.1));
    g.add(sphere(0.1, M(0x27ae60,{r:0.8}), -1.6, 1.28, 0.1));
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  function buildChair(opts) {
    opts = opts || {};
    const g = new THREE.Group();
    const seatM = M(opts.color || PAL.fabric, {r:0.7});
    const frameM = M(PAL.steel, {r:0.35, m:0.55});
    // seat
    g.add(box(0.48, 0.06, 0.46, seatM, 0, 0.46, 0));
    // back
    g.add(box(0.48, 0.44, 0.06, seatM, 0, 0.71, -0.2));
    // legs
    [[-0.2,-0.18],[0.2,-0.18],[-0.2,0.18],[0.2,0.18]].forEach(p => {
      g.add(cyl(0.018,0.018,0.46, frameM, p[0], 0.23, p[1]));
    });
    // armrests (optional)
    if (opts.arms) {
      g.add(box(0.04, 0.22, 0.38, frameM, -0.24, 0.58, -0.02));
      g.add(box(0.04, 0.22, 0.38, frameM, 0.24, 0.58, -0.02));
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  function buildWaitingBench(seats, opts) {
    opts = opts || {};
    const g = new THREE.Group();
    const sw = 0.52;
    const totalW = seats * sw + (seats-1)*0.04;
    // beam
    g.add(box(totalW + 0.1, 0.06, 0.08, M(PAL.steel,{m:0.5}), 0, 0.3, 0));
    g.add(box(totalW + 0.1, 0.06, 0.08, M(PAL.steel,{m:0.5}), 0, 0.3, -0.3));
    // legs
    g.add(box(0.06, 0.42, 0.5, M(PAL.steel,{m:0.5}), -totalW/2, 0.21, -0.11));
    g.add(box(0.06, 0.42, 0.5, M(PAL.steel,{m:0.5}), totalW/2, 0.21, -0.11));
    for (let i=0; i<seats; i++) {
      const x = -totalW/2 + sw/2 + i*(sw+0.04);
      const c = buildChair({ color: opts.color || PAL.fabric, arms: false });
      c.position.set(x, 0, 0);
      g.add(c);
    }
    return g;
  }

  function buildRoomShell(r) {
    const g = new THREE.Group();
    const [w, d] = r.size;
    const h = 3.0;
    const wallM = M(PAL.wall, {r:0.85, side:THREE.DoubleSide});
    const outerM = M(PAL.wallOuter, {r:0.8, side:THREE.DoubleSide});
    const floorM = M(PAL.floor, {r:0.9});
    const ceilM = M(PAL.ceiling, {r:0.95});
    const accentM = M(r.color, {r:0.4, m:0.1, transparent:true, opacity:0.12});
    const baseM = M(r.color, {r:0.35, m:0.2});

    // Floor with accent tint
    g.add(box(w, 0.1, d, floorM, 0, -0.05, 0));
    g.add(box(w-0.2, 0.02, d-0.2, accentM, 0, 0.015, 0));
    // Floor accent border
    const border = box(w-0.06, 0.015, d-0.06, M(r.color,{r:0.3,emissive:r.color,ei:0.08}), 0, 0.018, 0);
    g.add(border);

    // Ceiling (semi-transparent for architectural view)
    const ceil = box(w, 0.06, d, M(PAL.ceiling, {r:0.9, transparent:true, opacity:0.25, side:THREE.DoubleSide}), 0, h, 0);
    g.add(ceil);

    // Walls - lower height for cutaway architectural view
    const wh = 1.15; // cutaway wall height
    // back
    const bw = box(w, wh, 0.1, wallM, 0, wh/2, -d/2); g.add(bw);
    // front (with door opening)
    g.add(box(w*0.32, wh, 0.1, wallM, -w*0.34, wh/2, d/2));
    g.add(box(w*0.32, wh, 0.1, wallM, w*0.34, wh/2, d/2));
    // left
    g.add(box(0.1, wh, d, wallM, -w/2, wh/2, 0));
    // right
    g.add(box(0.1, wh, d, wallM, w/2, wh/2, 0));

    // Wall top accent strips (blue)
    const strip = 0.04;
    g.add(box(w, strip, 0.12, baseM, 0, wh + strip/2, -d/2));
    g.add(box(0.12, strip, d, baseM, -w/2, wh + strip/2, 0));
    g.add(box(0.12, strip, d, baseM, w/2, wh + strip/2, 0));

    // Glass-like top suggestion on back wall
    const glassTop = box(w-0.3, 0.6, 0.03, M(PAL.glassTint, {transparent:true, opacity:0.18, emissive:r.color, ei:0.06}), 0, wh + 0.35, -d/2+0.06);
    g.add(glassTop);

    // Baseboard
    g.add(box(w, 0.08, 0.02, baseM, 0, 0.04, -d/2+0.06));
    g.add(box(0.02, 0.08, d, baseM, -w/2+0.06, 0.04, 0));
    g.add(box(0.02, 0.08, d, baseM, w/2-0.06, 0.04, 0));

    // Door marker on floor
    g.add(box(1.1, 0.012, 0.3, M(r.color,{emissive:r.color,ei:0.2,r:0.3}), 0, 0.016, d/2-0.1));

    // Room label on floor
    const fl = makeFloorLabel(r.num === 'ACCUEIL' ? 'ACCUEIL' : r.num);
    fl.position.set(0, 0.02, -d/2 + 0.7);
    g.add(fl);

    // Floating label
    const lbl = makeLabelSprite(r.name, r.desc, { accent: '#'+r.color.toString(16).padStart(6,'0'), scale: 3.4 });
    lbl.position.set(0, 2.6, 0);
    g.add(lbl);

    // Hit area for interaction
    const hit = box(w, 0.5, d, new THREE.MeshBasicMaterial({visible:false}), 0, 0.25, 0);
    hit.userData.room = r;
    g.add(hit);
    roomMeshes.push(hit);

    g.position.set(r.pos[0], 0, r.pos[2]);
    return g;
  }

  // ---- Room contents ----
  function addRoomContents() {
    // BLOC OPÉRATOIRE
    const bloc = ROOMS.find(r=>r.id==='bloc');
    if (bloc) {
      const g = new THREE.Group();
      // operating table
      g.add(box(0.65, 0.06, 1.9, M(PAL.navyLight), 0, 0.82, 0));
      g.add(box(0.6, 0.08, 1.8, M(0x2a6376,{r:0.8}), 0, 0.89, 0));
      g.add(cyl(0.12,0.16,0.12, M(PAL.steel,{m:0.6}), 0, 0.7, 0));
      g.add(cyl(0.2,0.22,0.05, M(PAL.steel,{m:0.6}), 0, 0.58, 0));
      // scialytic light
      g.add(cyl(0.03,0.03,1.6, M(PAL.steel,{m:0.6}), 0, 1.9, 0));
      g.add(cyl(0.42,0.42,0.06, M(PAL.white), 0, 2.72, 0));
      g.add(cyl(0.32,0.32,0.03, M(0xfffef5,{emissive:0xfffef0,ei:0.5}), 0, 2.68, 0));
      // equipment carts
      g.add(box(0.5,0.7,0.35, M(PAL.steel,{m:0.4}), -2.2, 0.35, -1.8));
      g.add(box(0.45,0.6,0.4, M(0x34495e), 2.3, 0.3, -1.5));
      // monitor stand
      g.add(cyl(0.025,0.025,1.1, M(PAL.steel,{m:0.6}), -2.0, 0.55, 1.5));
      g.add(box(0.3,0.2,0.04, M(PAL.navy,{emissive:0x00aa66,ei:0.25}), -2.0, 1.2, 1.5));
      // staff figure
      const doc = buildPerson({ cloth: 0x27ae60, cloth2: 0x27ae60, uniform:true, skin:PAL.skinDark, scale:0.9 });
      doc.position.set(0.8, 0, 0.3); doc.rotation.y = -Math.PI/2;
      g.add(doc);
      g.position.set(bloc.pos[0], 0, bloc.pos[2]); scene.add(g);
    }

    // RÉANIMATION
    const rea = ROOMS.find(r=>r.id==='rea');
    if (rea) {
      const g = new THREE.Group();
      // bed D8D
      g.add(box(0.85,0.08,2.0, M(PAL.white,{r:0.4}), 0, 0.55, 0));
      g.add(box(0.8,0.12,1.88, M(0x2a6376,{r:0.85}), 0, 0.65, 0));
      [[-0.38,-0.92],[0.38,-0.92],[-0.38,0.92],[0.38,0.92]].forEach(p=>{
        g.add(cyl(0.025,0.025,0.5,M(PAL.steel,{m:0.6}),p[0],0.25,p[1]));
        const w=cyl(0.045,0.045,0.025,M(0x222),p[0],0.045,p[1]); w.rotation.z=Math.PI/2; g.add(w);
      });
      // ventilator
      g.add(box(0.08,0.5,0.08,M(0x333a42), -2.2, 0.42, -1.2));
      g.add(box(0.32,0.28,0.2,M(0x333a42), -2.2, 0.86, -1.2));
      g.add(box(0.26,0.16,0.01,M(PAL.navy,{emissive:0x0088cc,ei:0.35}), -2.2, 1.15, -1.1));
      // monitor
      g.add(cyl(0.02,0.02,1.0,M(PAL.steel,{m:0.6}), -1.5, 0.5, -2.0));
      g.add(box(0.28,0.18,0.03,M(PAL.navy,{emissive:0x00cc66,ei:0.3}), -1.5, 1.12, -2.0));
      // perfusion stand
      g.add(cyl(0.015,0.015,1.5,M(PAL.steel,{m:0.6}), 1.8, 0.75, 1.2));
      g.add(box(0.2,0.01,0.15,M(PAL.steel,{m:0.5}), 1.8, 1.52, 1.2));
      g.position.set(rea.pos[0], 0, rea.pos[2]); scene.add(g);
    }

    // URGENCES
    const urg = ROOMS.find(r=>r.id==='urgences');
    if (urg) {
      const g = new THREE.Group();
      // stretcher
      g.add(box(0.65,0.06,1.85,M(0xb0b8be,{m:0.4}), 0, 0.78, 0));
      g.add(box(0.6,0.1,1.75,M(0x1e2429), 0, 0.86, 0));
      [[-0.28,-0.82],[0.28,-0.82],[-0.28,0.82],[0.28,0.82]].forEach(p=>{const w=cyl(0.055,0.055,0.03,M(0x222),p[0],0.055,p[1]);w.rotation.z=Math.PI/2;g.add(w);});
      // defibrillator/monitor
      g.add(box(0.38,0.5,0.28,M(0x2a3038), 2.0, 0.65, -1.5));
      g.add(box(0.3,0.16,0.01,M(PAL.navy,{emissive:0x00aa44,ei:0.3}), 2.0, 0.8, -1.355));
      // crash cart
      g.add(box(0.5,0.85,0.4,M(0xdce2e6,{r:0.4}), -2.2, 0.425, 1.5));
      for(let i=0;i<4;i++) g.add(box(0.46,0.015,0.01,M(PAL.steel,{m:0.3}), -2.2, 0.2+i*0.18, 1.705));
      g.position.set(urg.pos[0], 0, urg.pos[2]); scene.add(g);
    }

    // RADIOLOGIE
    const rad = ROOMS.find(r=>r.id==='radio');
    if (rad) {
      const g = new THREE.Group();
      g.add(box(1.6,2.0,1.0,M(0xe8ecef,{r:0.35}), 0, 1.0, -1.2));
      g.add(box(1.2,0.3,0.01,M(PAL.navy,{emissive:0x0088aa,ei:0.2}), 0, 1.7, -0.695));
      // exam table
      g.add(box(0.7,0.06,1.9,M(0x607d8b), 0, 0.75, 1.2));
      g.add(cyl(0.08,0.1,0.7,M(PAL.steel,{m:0.5}), 0, 0.35, 1.2));
      // control booth suggestion
      g.add(box(2.0,1.15,0.08,M(PAL.glassTint,{transparent:true,opacity:0.25}), -2.5, 0.575, 0));
      g.position.set(rad.pos[0], 0, rad.pos[2]); scene.add(g);
    }

    // STÉRILISATION
    const ster = ROOMS.find(r=>r.id==='steril');
    if (ster) {
      const g = new THREE.Group();
      g.add(box(0.9,1.5,0.7,M(0xc8d0d4,{r:0.4}), -1.8, 0.75, -1.8));
      g.add(box(0.7,0.4,0.01,M(PAL.navy,{emissive:0x0088aa,ei:0.2}), -1.8, 1.15, -1.445));
      g.add(box(0.9,1.3,0.65,M(0xd4dce0,{r:0.4}), 0.2, 0.65, -1.8));
      // work table
      g.add(box(1.8,0.04,0.7,M(PAL.steel,{m:0.6,r:0.3}), 0, 0.85, 1.5));
      [[-0.8,-0.3],[0.8,-0.3],[-0.8,0.3],[0.8,0.3]].forEach(p=>g.add(cyl(0.025,0.025,0.85,M(PAL.steel,{m:0.6}),p[0],0.425,1.5+p[1])));
      // carts
      g.add(box(0.5,0.8,0.38,M(PAL.steel,{m:0.3}), 2.3, 0.4, 0.5));
      g.position.set(ster.pos[0], 0, ster.pos[2]); scene.add(g);
    }

    // MOBILIER MÉDICAL (2 D8D beds)
    const mob = ROOMS.find(r=>r.id==='mobilier');
    if (mob) {
      const g = new THREE.Group();
      function bed(x) {
        const b = new THREE.Group();
        b.add(box(0.85,0.08,2.0,M(PAL.white,{r:0.4}), 0, 0.55, 0));
        b.add(box(0.8,0.12,1.88,M(0x2a6376,{r:0.85}), 0, 0.65, 0));
        b.add(box(0.8,0.04,0.45,M(0x357c93), 0, 0.77, -0.68));
        // head/foot boards
        b.add(box(0.88,0.5,0.04,M(PAL.white,{r:0.45}), 0, 0.55, -1.0));
        b.add(box(0.88,0.38,0.04,M(PAL.white,{r:0.45}), 0, 0.49, 1.0));
        // rails
        b.add(box(0.03,0.25,0.9,M(0xb0c4de,{m:0.3,r:0.4}), -0.44, 0.78, 0.1));
        b.add(box(0.03,0.25,0.9,M(0xb0c4de,{m:0.3,r:0.4}), 0.44, 0.78, 0.1));
        [[-0.38,-0.92],[0.38,-0.92],[-0.38,0.92],[0.38,0.92]].forEach(p=>{
          g; b.add(cyl(0.025,0.025,0.5,M(PAL.steel,{m:0.6}),p[0],0.25,p[1]));
          const w=cyl(0.045,0.045,0.025,M(0x222),p[0],0.045,p[1]); w.rotation.z=Math.PI/2; b.add(w);
        });
        b.position.x = x; return b;
      }
      g.add(bed(-1.5));
      g.add(bed(1.5));
      // bedside tables
      g.add(box(0.45,0.55,0.4,M(PAL.white,{r:0.4}), -2.8, 0.275, -0.5));
      g.add(box(0.45,0.55,0.4,M(PAL.white,{r:0.4}), 2.8, 0.275, -0.5));
      // overbed table
      g.add(cyl(0.015,0.015,0.7,M(PAL.steel,{m:0.6}), 0, 0.35, 1.8));
      g.add(box(0.7,0.03,0.45,M(0xdfe8ec), 0, 0.72, 1.8));
      g.position.set(mob.pos[0], 0, mob.pos[2]); scene.add(g);
    }
  }

  // ---- Reception details ----
  function buildReceptionArea() {
    const rec = ROOMS.find(r=>r.id==='reception');
    if (!rec) return;
    const g = new THREE.Group();

    // Reception desk
    const desk = buildReceptionDesk();
    desk.position.set(0, 0, -1.5);
    g.add(desk);

    // Receptionist (standing behind desk)
    const receptionist = buildPerson({
      cloth: PAL.uniform, cloth2: 0x2c3e50, skin: PAL.skinDark, hair: 0x1a1a1a,
      uniform: true, sitting: false, scale: 1.0
    });
    receptionist.position.set(0, 0, -2.3);
    receptionist.rotation.y = 0; // facing front (toward patients)
    g.add(receptionist);

    // Name badge area indicator (small accent)
    g.add(box(0.08, 0.05, 0.01, M(PAL.accent,{emissive:PAL.accent,ei:0.3}), 0.1, 1.05, -2.19));

    // Waiting area - bench with patients
    const bench1 = buildWaitingBench(3, { color: PAL.fabric });
    bench1.position.set(-2.2, 0, 1.6);
    bench1.rotation.y = 0;
    g.add(bench1);

    const bench2 = buildWaitingBench(2, { color: PAL.fabricLight });
    bench2.position.set(2.5, 0, 1.8);
    bench2.rotation.y = -0.15;
    g.add(bench2);

    // Patients sitting
    const patientColors = [0x34495e, 0x7f8c8d, 0x16a085, 0x8e44ad, 0xd35400];
    const patients = [
      { bench: bench1, seat: 0, color: patientColors[0], skin: PAL.skin, xOff: -2.2 - 0.56, z: 1.6 },
      { bench: bench1, seat: 2, color: patientColors[1], skin: PAL.skinDark, xOff: -2.2 + 0.56, z: 1.6 },
      { bench: bench2, seat: 0, color: patientColors[2], skin: PAL.skin, xOff: 2.22, z: 1.82 },
      { bench: bench2, seat: 1, color: patientColors[3], skin: PAL.skinDark, xOff: 2.78, z: 1.78 },
    ];
    patients.forEach((p, i) => {
      const person = buildPerson({ cloth: p.color, cloth2: 0x2c3e50, skin: p.skin, sitting: true, scale: 0.95 });
      person.position.set(p.xOff, 0, p.z);
      person.rotation.y = Math.PI + (i % 2 === 0 ? 0.1 : -0.1); // facing desk area
      g.add(person);
    });

    // Standing person (arriving/waiting)
    const stander = buildPerson({ cloth: 0x2980b9, cloth2: 0x34495e, skin: PAL.skin, sitting: false, scale: 0.95 });
    stander.position.set(-0.8, 0, 0.3);
    stander.rotation.y = Math.PI * 0.9;
    g.add(stander);

    // Coffee/water table
    g.add(cyl(0.28, 0.28, 0.04, M(0xdfe8ec,{r:0.3}), 0, 0.42, 1.7));
    g.add(cyl(0.03, 0.04, 0.42, M(PAL.steel,{m:0.5}), 0, 0.21, 1.7));
    g.add(cyl(0.18, 0.18, 0.02, M(PAL.steel,{m:0.5}), 0, 0.01, 1.7));
    // magazine on table
    g.add(box(0.2, 0.015, 0.26, M(PAL.accent,{r:0.6}), 0.05, 0.45, 1.7));

    // Reception signage
    const signBg = box(2.2, 0.45, 0.04, M(PAL.navy,{r:0.3}), 0, 2.2, -3.35);
    g.add(signBg);
    const signLbl = makeLabelSprite('ACCUEIL / RÉCEPTION', 'Enregistrement des patients', { scale: 2.0, bg:'rgba(11,34,57,0.95)' });
    signLbl.position.set(0, 2.2, -3.2);
    g.add(signLbl);

    // Plants
    [[-4.2, -2.5],[4.2, -2.5]].forEach(p => {
      g.add(cyl(0.18,0.15,0.35, M(0xbdc3c7,{r:0.6}), p[0], 0.175, p[1]));
      g.add(sphere(0.28, M(0x27ae60,{r:0.85}), p[0], 0.52, p[1]));
      g.add(sphere(0.22, M(0x2ecc71,{r:0.85}), p[0]+0.12, 0.62, p[1]-0.05));
    });

    g.position.set(rec.pos[0], 0, rec.pos[2]);
    scene.add(g);
  }

  // ---- Corridor ----
  function buildCorridor() {
    const g = new THREE.Group();
    const cw = 5.0, cl = 24, ch = 3.0;
    // floor
    g.add(box(cw, 0.08, cl, M(PAL.corridor, {r:0.88}), 0, -0.04, 14.5));
    // ceiling
    g.add(box(cw, 0.04, cl, M(PAL.ceiling, {transparent:true,opacity:0.2,side:THREE.DoubleSide}), 0, ch, 14.5));
    // center guideline
    g.add(box(0.15, 0.012, cl-1, M(PAL.accent,{emissive:PAL.accent,ei:0.12,r:0.4,transparent:true,opacity:0.5}), 0, 0.012, 14.5));
    // direction arrows
    [6, 14.5, 23].forEach(z => {
      const a = box(0.4, 0.011, 0.08, M(PAL.accent,{emissive:PAL.accent,ei:0.15,transparent:true,opacity:0.35}), 0, 0.013, z);
      g.add(a);
    });
    // walls are formed by room walls; add end markers
    // subtle wall strips
    g.add(box(0.06, 1.15, cl, M(PAL.wallOuter,{r:0.85}), -cw/2, 0.575, 14.5));
    g.add(box(0.06, 1.15, cl, M(PAL.wallOuter,{r:0.85}), cw/2, 0.575, 14.5));
    // top accent on corridor walls
    g.add(box(0.08, 0.04, cl, M(PAL.accent,{r:0.3,m:0.15}), -cw/2, 1.17, 14.5));
    g.add(box(0.08, 0.04, cl, M(PAL.accent,{r:0.3,m:0.15}), cw/2, 1.17, 14.5));

    // Pillar accents at junctions
    [6, 14.5, 23].forEach(z => {
      [-cw/2+0.15, cw/2-0.15].forEach(x => {
        g.add(box(0.18, 1.15, 0.18, M(PAL.white,{r:0.5}), x, 0.575, z));
        g.add(box(0.2, 0.04, 0.2, M(PAL.accent,{emissive:PAL.accent,ei:0.15}), x, 1.17, z));
      });
    });

    // Corridor label
    const lbl = makeLabelSprite('CIRCULATION PRINCIPALE', 'Accès aux services', { scale: 2.6, accent:'#00c8ee' });
    lbl.position.set(0, 2.4, 14.5);
    g.add(lbl);

    scene.add(g);
  }

  // ---- Ground & context ----
  function buildContext() {
    // Large ground plane
    const ground = box(80, 0.15, 80, M(0x5a7a72, {r:0.95}), 0, -0.12, 12);
    ground.receiveShadow = true;
    scene.add(ground);
    // Site pad
    const pad = box(34, 0.06, 36, M(0x8a9e98, {r:0.9}), 0, -0.04, 12);
    scene.add(pad);
    // Walkway to entrance
    g = new THREE.Group();
    g.add(box(3, 0.04, 5, M(0xb8c4c0, {r:0.85}), 0, -0.01, -5.5));
    scene.add(g);
    // Simple landscaping
    [[-14, 2],[-14, 12],[14, 2],[14, 12],[-14, 22],[14, 22]].forEach(p => {
      scene.add(sphere(0.7, M(0x2d6a4f,{r:0.9}), p[0], 0.5, p[1]));
      scene.add(cyl(0.08,0.1,0.5, M(0x6b4226), p[0], 0.25, p[1]));
    });
  }
  let g; // used above

  // ---- Camera animation ----
  function animateCameraTo(pos, target, dur) {
    camAnim = { fromPos: camera.position.clone(), fromTarget: orbitTarget.clone(), toPos: new THREE.Vector3(...pos), toTarget: new THREE.Vector3(...target), start: performance.now(), dur: dur || 1200 };
  }
  function updateCameraAnim() {
    if (!camAnim) return;
    const t = Math.min(1, (performance.now() - camAnim.start) / camAnim.dur);
    const e = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
    camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, e);
    orbitTarget.lerpVectors(camAnim.fromTarget, camAnim.toTarget, e);
    // sync orbit params roughly
    const off = camera.position.clone().sub(orbitTarget);
    orbitRadius = off.length();
    orbitTheta = Math.atan2(off.x, off.z);
    orbitPhi = Math.acos(Math.max(-1, Math.min(1, off.y / orbitRadius)));
    if (t >= 1) camAnim = null;
  }

  // ---- Legend ----
  function buildLegend() {
    ROOMS.forEach(r => {
      const item = document.createElement('div');
      item.className = 'leg-item';
      item.innerHTML = `<span class="dot" style="background:#${r.color.toString(16).padStart(6,'0')}"></span><span><b>${r.num}</b> ${r.name}</span>`;
      item.addEventListener('click', () => {
        const x = r.pos[0], z = r.pos[2];
        animateCameraTo([x + 8, 9, z + 8], [x, 0, z], 1100);
      });
      legendEl.appendChild(item);
    });
  }

  // ---- Init ----
  function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1a28);
    scene.fog = new THREE.FogExp2(0x0c1a28, 0.012);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 200);
    updateOrbitCamera();

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputEncoding = THREE.sRGBEncoding;

    // Lighting - architectural
    scene.add(new THREE.AmbientLight(0xc8d8e8, 0.55));
    const hemi = new THREE.HemisphereLight(0xddeeff, 0x445566, 0.5);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff5e0, 0.85);
    sun.position.set(15, 25, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    // fill
    const fill = new THREE.DirectionalLight(0x8899bb, 0.3);
    fill.position.set(-10, 12, -5); scene.add(fill);
    // accent blue rim
    const rim = new THREE.DirectionalLight(0x00a8cc, 0.2);
    rim.position.set(-15, 8, 20); scene.add(rim);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Build scene
    buildContext();
    buildCorridor();
    ROOMS.forEach(r => scene.add(buildRoomShell(r)));
    buildReceptionArea();
    addRoomContents();
    buildLegend();

    // Controls
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);

    document.getElementById('btnReset').addEventListener('click', () => animateCameraTo([22, 18, 28], [0,0,10], 1000));
    document.getElementById('btnTop').addEventListener('click', () => animateCameraTo([0, 42, 12.01], [0,0,12], 1000));
    document.getElementById('btnWalk').addEventListener('click', () => window.location.href = 'parcours.html');

    clock = new THREE.Clock();
    loading.classList.add('hidden');
    animate();
  }

  function updateOrbitCamera() {
    const x = orbitTarget.x + orbitRadius * Math.sin(orbitPhi) * Math.sin(orbitTheta);
    const y = orbitTarget.y + orbitRadius * Math.cos(orbitPhi);
    const z = orbitTarget.z + orbitRadius * Math.sin(orbitPhi) * Math.cos(orbitTheta);
    camera.position.set(x, y, z);
    camera.lookAt(orbitTarget);
  }

  function onDown(e) {
    isDragging = true; moved = false; prev = {x:e.clientX,y:e.clientY}; downPos = {x:e.clientX,y:e.clientY};
    camAnim = null;
  }
  function onMove(e) {
    mouse.x = (e.clientX/window.innerWidth)*2-1;
    mouse.y = -(e.clientY/window.innerHeight)*2+1;
    if (isDragging) {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      if (Math.abs(e.clientX-downPos.x)+Math.abs(e.clientY-downPos.y) > 4) moved = true;
      orbitTheta -= dx * 0.006;
      orbitPhi = Math.max(0.25, Math.min(1.45, orbitPhi - dy * 0.006));
      prev = {x:e.clientX, y:e.clientY};
      updateOrbitCamera();
    } else {
      // hover
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(roomMeshes, false);
      if (hits.length > 0 && hits[0].object.userData.room) {
        const r = hits[0].object.userData.room;
        riNum.textContent = r.num; riTitle.textContent = r.name; riDesc.textContent = r.desc;
        roomInfo.classList.add('show');
        canvas.style.cursor = 'pointer';
      } else {
        roomInfo.classList.remove('show');
        canvas.style.cursor = 'grab';
      }
    }
  }
  function onUp(e) {
    if (isDragging && !moved) {
      // click to focus
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(roomMeshes, false);
      if (hits.length > 0 && hits[0].object.userData.room) {
        const r = hits[0].object.userData.room;
        animateCameraTo([r.pos[0]+7, 8, r.pos[2]+7], [r.pos[0], 0, r.pos[2]], 900);
      }
    }
    isDragging = false;
  }
  function onWheel(e) {
    e.preventDefault();
    camAnim = null;
    orbitRadius = Math.max(12, Math.min(65, orbitRadius + e.deltaY * 0.025));
    updateOrbitCamera();
  }
  function onResize() {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function animate() {
    requestAnimationFrame(animate);
    updateCameraAnim();
    if (!camAnim) camera.lookAt(orbitTarget);
    renderer.render(scene, camera);
  }

  if (window.THREE) init();
  else window.addEventListener('load', init);
})();
