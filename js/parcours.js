/* ============================================================
   parcours.js — Visite cinématique 3D de la clinique
   La Maison Africaine du Médecin
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
  const DURATION = 90; // seconds for full tour

  const COLORS = {
    wall: 0xd8e1de, wallLow: 0xb8c8c3, floor: 0xcfd8d6, ceil: 0xe8eeed,
    steel: 0xaebbc2, dark: 0x252c32, white: 0xf2f5f6, blue: 0x27689e,
    cyan: 0x00c8ee, mattress: 0x2a6376, red: 0xc0392b, green: 0x2a8552,
    yellow: 0xd3a02c, glass: 0xb8d4de
  };

  function mat(color, opts) {
    opts = opts || {};
    return new THREE.MeshStandardMaterial(Object.assign({
      color: color, roughness: opts.r != null ? opts.r : 0.55,
      metalness: opts.m != null ? opts.m : 0.15
    }, opts.emissive ? { emissive: opts.emissive, emissiveIntensity: opts.ei || 0.4 } : {}));
  }

  function box(w, h, d, m, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
  function cyl(rt, rb, h, m, x, y, z, seg) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 16), m);
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
  function sphere(r, m, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m);
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.castShadow = true; return mesh;
  }

  function makeLabel(text, color) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(8,20,34,0.88)';
    ctx.beginPath(); ctx.roundRect(8, 8, 496, 80, 12); ctx.fill();
    ctx.strokeStyle = color || '#00c8ee'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#eaf6fb'; ctx.font = 'bold 36px Segoe UI, Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 52);
    const tex = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.scale.set(1.8, 0.34, 1);
    return sp;
  }

  // ---- Build room shell ----
  function buildRoom(w, d, h, doorSide) {
    const g = new THREE.Group();
    const wallM = mat(COLORS.wall, { r: 0.92 });
    const floorM = mat(COLORS.floor, { r: 0.85 });
    const ceilM = mat(COLORS.ceil, { r: 0.95 });
    const baseM = mat(0x5a6870, { r: 0.5, m: 0.3 });
    // floor
    g.add(box(w, 0.08, d, floorM, 0, -0.04, 0));
    // ceiling
    g.add(box(w, 0.06, d, ceilM, 0, h + 0.03, 0));
    // back wall
    g.add(box(w, h, 0.12, wallM, 0, h/2, -d/2));
    // left wall
    g.add(box(0.12, h, d, wallM, -w/2, h/2, 0));
    // right wall (with door gap on +X side for corridor connection)
    if (doorSide === 'right') {
      // split right wall leaving doorway
      g.add(box(0.12, h, d*0.35, wallM, w/2, h/2, -d*0.325));
      g.add(box(0.12, h, d*0.35, wallM, w/2, h/2, d*0.325));
      g.add(box(0.12, h - 2.2, d*0.3, wallM, w/2, 2.2 + (h-2.2)/2, 0)); // above door
    } else if (doorSide === 'left') {
      g.add(box(0.12, h, d*0.35, wallM, -w/2, h/2, -d*0.325));
      g.add(box(0.12, h, d*0.35, wallM, -w/2, h/2, d*0.325));
      g.add(box(0.12, h - 2.2, d*0.3, wallM, -w/2, 2.2 + (h-2.2)/2, 0));
    } else {
      g.add(box(0.12, h, d, wallM, w/2, h/2, 0));
    }
    // front wall partial
    g.add(box(w*0.3, h, 0.12, wallM, -w*0.35, h/2, d/2));
    g.add(box(w*0.3, h, 0.12, wallM, w*0.35, h/2, d/2));
    g.add(box(w*0.4, h - 2.2, 0.12, wallM, 0, 2.2 + (h-2.2)/2, d/2));
    // baseboards
    g.add(box(w, 0.12, 0.04, baseM, 0, 0.06, -d/2+0.08));
    g.add(box(w, 0.12, 0.04, baseM, 0, 0.06, d/2-0.08));
    // ceiling lights
    const lightM = mat(0xffffff, { emissive: 0xf0f8ff, ei: 0.8 });
    [[-w*0.25, -d*0.2], [w*0.25, -d*0.2], [-w*0.25, d*0.2], [w*0.25, d*0.2]].forEach(p => {
      g.add(box(0.6, 0.04, 0.15, lightM, p[0], h - 0.02, p[1]));
    });
    return g;
  }

  // ---- Equipment helpers (simplified) ----
  function addBed(g, x, z, rot) {
    const b = new THREE.Group();
    b.add(box(0.9, 0.08, 2.0, mat(COLORS.white, {r:0.4,m:0.1}), 0, 0.55, 0));
    b.add(box(0.86, 0.12, 1.88, mat(COLORS.mattress), 0, 0.65, 0));
    b.add(box(0.86, 0.04, 0.5, mat(0x357c93), 0, 0.78, -0.68));
    [[-0.42,-0.95],[0.42,-0.95],[-0.42,0.95],[0.42,0.95]].forEach(p => b.add(cyl(0.025,0.025,0.5,mat(COLORS.steel,{m:0.6}),p[0],0.25,p[1])));
    [[-0.44,-0.9],[0.44,-0.9],[-0.44,0.9],[0.44,0.9]].forEach(p => { const w=cyl(0.05,0.05,0.03,mat(0x1a1f24,{r:0.9}),p[0],0.05,p[1]); w.rotation.z=Math.PI/2; b.add(w); });
    b.position.set(x, 0, z); b.rotation.y = rot || 0; g.add(b);
  }
  function addMonitor(g, x, z, rot) {
    const m = new THREE.Group();
    m.add(cyl(0.025,0.025,1.0,mat(COLORS.steel,{m:0.7}), 0, 0.5, 0));
    m.add(cyl(0.22,0.22,0.03,mat(COLORS.steel,{m:0.6}), 0, 0.02, 0, 5));
    m.add(box(0.32,0.22,0.04,mat(COLORS.dark), 0, 1.15, 0));
    m.add(box(0.29,0.19,0.01,mat(0x0a1828,{emissive:0x00aa66,ei:0.5}), 0, 1.15, 0.025));
    m.position.set(x, 0, z); m.rotation.y = rot||0; g.add(m);
  }
  function addCart(g, x, z, rot, col) {
    const c = new THREE.Group();
    c.add(box(0.55,0.04,0.4,mat(col||COLORS.steel,{m:0.5}), 0, 0.85, 0));
    c.add(box(0.55,0.04,0.4,mat(col||COLORS.steel,{m:0.5}), 0, 0.55, 0));
    c.add(box(0.55,0.04,0.4,mat(col||COLORS.steel,{m:0.5}), 0, 0.25, 0));
    [[-0.24,-0.17],[0.24,-0.17],[-0.24,0.17],[0.24,0.17]].forEach(p => c.add(cyl(0.015,0.015,0.85,mat(COLORS.steel,{m:0.7}),p[0],0.425,p[1])));
    [[-0.22,-0.15],[0.22,-0.15],[-0.22,0.15],[0.22,0.15]].forEach(p => { const w=cyl(0.04,0.04,0.025,mat(0x1a1f24),p[0],0.04,p[1]); w.rotation.z=Math.PI/2; c.add(w); });
    c.position.set(x,0,z); c.rotation.y=rot||0; g.add(c);
  }
  function addVentilator(g, x, z, rot) {
    const v = new THREE.Group();
    for(let i=0;i<5;i++){const a=i/5*Math.PI*2; v.add(box(0.24,0.04,0.06,mat(COLORS.steel,{m:0.6}),Math.cos(a)*0.12,0.14,Math.sin(a)*0.12));}
    [[0.24,0],[ -0.12,0.21],[-0.12,-0.21],[0.07,0.23],[0.07,-0.23]].forEach(p=>{const w=cyl(0.05,0.05,0.025,mat(0x1a1f24),p[0],0.05,p[1]);w.rotation.z=Math.PI/2;v.add(w);});
    v.add(box(0.08,0.5,0.08,mat(COLORS.dark), 0, 0.42, -0.1));
    v.add(box(0.34,0.32,0.22,mat(0x333a42), 0, 0.88, 0));
    v.add(box(0.28,0.18,0.01,mat(0x0a1828,{emissive:0x0066aa,ei:0.6}), 0, 1.2, 0.08));
    v.position.set(x,0,z); v.rotation.y=rot||0; g.add(v);
  }
  function addTable(g, x, z, rot) {
    const t = new THREE.Group();
    t.add(cyl(0.2,0.28,0.06,mat(COLORS.steel,{m:0.7}), 0, 0.08, 0));
    t.add(cyl(0.04,0.04,0.7,mat(COLORS.steel,{m:0.7}), 0, 0.45, 0));
    t.add(box(1.8,0.06,0.6,mat(COLORS.mattress), 0, 0.85, 0));
    t.add(box(1.85,0.02,0.65,mat(COLORS.steel,{m:0.8}), 0, 0.88, 0));
    t.position.set(x,0,z); t.rotation.y=rot||0; g.add(t);
  }
  function addDefib(g, x, z, rot) {
    const d = new THREE.Group();
    d.add(box(0.4,0.55,0.3,mat(0x2a3038), 0, 0.7, 0));
    d.add(box(0.32,0.18,0.01,mat(0x0a1828,{emissive:0x00aa44,ei:0.5}), 0, 0.85, 0.155));
    d.add(cyl(0.12,0.15,0.04,mat(COLORS.steel,{m:0.6}), 0, 0.4, 0));
    [[-0.12,-0.1],[0.12,-0.1],[-0.12,0.1],[0.12,0.1]].forEach(p=>{const w=cyl(0.035,0.035,0.02,mat(0x1a1f24),p[0],0.035,p[1]);w.rotation.z=Math.PI/2;d.add(w);});
    d.position.set(x,0,z); d.rotation.y=rot||0; g.add(d);
  }
  function addCabinet(g, x, z, rot) {
    const c = new THREE.Group();
    c.add(box(0.5,1.6,0.45,mat(COLORS.white,{r:0.4}), 0, 0.8, 0));
    c.add(box(0.46,0.02,0.01,mat(COLORS.glass,{r:0.1,m:0.1}), 0, 1.2, 0.226));
    c.add(box(0.46,0.02,0.01,mat(COLORS.glass,{r:0.1,m:0.1}), 0, 0.7, 0.226));
    c.position.set(x,0,z); c.rotation.y=rot||0; g.add(c);
  }
  function addMachine(g, x, z, rot, w, h, d, col) {
    const m = new THREE.Group();
    m.add(box(w,h,d,mat(col||0x3a4550,{r:0.45}), 0, h/2, 0));
    m.add(box(w*0.7,h*0.25,0.01,mat(0x0a1828,{emissive:0x0088aa,ei:0.4}), 0, h*0.72, d/2+0.006));
    m.position.set(x,0,z); m.rotation.y=rot||0; g.add(m);
  }

  // ---- Scene segments (rooms along a corridor) ----
  const segments = [];
  // Corridor config: runs along Z from 0 to 40
  const CORRIDOR_X = 0, CORRIDOR_W = 3.2, CORRIDOR_H = 3.0;

  function buildCorridor() {
    const g = new THREE.Group();
    const len = 48;
    const z0 = -4;
    // floor
    g.add(box(CORRIDOR_W, 0.08, len, mat(0xc5cecb, {r:0.8}), 0, -0.04, z0 + len/2));
    // ceiling
    g.add(box(CORRIDOR_W, 0.06, len, mat(COLORS.ceil), 0, CORRIDOR_H + 0.03, z0 + len/2));
    // walls (with gaps for room doors)
    // continuous left wall segments
    const gaps = [
      {z: 3, w: 2.2}, {z: 11, w: 2.2}, {z: 19, w: 2.2}
    ];
    const gapsR = [
      {z: 7, w: 2.2}, {z: 15, w: 2.2}, {z: 23, w: 2.2}
    ];
    function wallWithGaps(side, gapList) {
      const x = side * (CORRIDOR_W/2 + 0.06);
      let prev = z0;
      gapList.forEach(gap => {
        const segLen = (gap.z - gap.w/2) - prev;
        if (segLen > 0.1) g.add(box(0.12, CORRIDOR_H, segLen, mat(COLORS.wall,{r:0.9}), x, CORRIDOR_H/2, prev + segLen/2));
        // above door
        g.add(box(0.12, CORRIDOR_H - 2.2, gap.w, mat(COLORS.wall,{r:0.9}), x, 2.2 + (CORRIDOR_H-2.2)/2, gap.z));
        prev = gap.z + gap.w/2;
      });
      const lastLen = (z0 + len) - prev;
      if (lastLen > 0.1) g.add(box(0.12, CORRIDOR_H, lastLen, mat(COLORS.wall,{r:0.9}), x, CORRIDOR_H/2, prev + lastLen/2));
    }
    wallWithGaps(-1, gaps);
    wallWithGaps(1, gapsR);
    // end walls
    g.add(box(CORRIDOR_W + 0.24, CORRIDOR_H, 0.12, mat(COLORS.wall), 0, CORRIDOR_H/2, z0));
    g.add(box(CORRIDOR_W + 0.24, CORRIDOR_H, 0.12, mat(COLORS.wall), 0, CORRIDOR_H/2, z0 + len));
    // corridor lights
    const lm = mat(0xffffff, {emissive:0xf0faff, ei:0.7});
    for (let z = 0; z < 40; z += 4) g.add(box(1.2, 0.03, 0.12, lm, 0, CORRIDOR_H - 0.02, z));
    // floor strip
    g.add(box(0.3, 0.01, len, mat(0x00c8ee, {emissive:0x00c8ee, ei:0.15, r:0.4}), 0, 0.01, z0 + len/2));
    scene.add(g);
  }

  function buildBlocOperatoire(cx, cz) {
    const g = buildRoom(7, 6, 3.2, 'right');
    addTable(g, 0, 0, 0);
    addMonitor(g, -1.8, -1.8, Math.PI/4);
    addVentilator(g, -2.2, 0.5, Math.PI/2);
    addCart(g, 2.2, -1.5, -Math.PI/4, 0xb8c2c8);
    addMachine(g, 2.5, 1.5, -Math.PI/2, 0.5, 1.1, 0.45, 0x2a3038);
    const scialy = new THREE.Group();
    scialy.add(cyl(0.04,0.04,1.2,mat(COLORS.steel,{m:0.7}), 0, 2.2, 0));
    scialy.add(cyl(0.5,0.5,0.08,mat(COLORS.white), 0, 2.85, 0));
    scialy.add(cyl(0.35,0.35,0.04,mat(0xffffff,{emissive:0xfffef0,ei:0.9}), 0, 2.8, 0));
    g.add(scialy);
    const lbl = makeLabel('Table d\'opération'); lbl.position.set(0, 1.6, 0); g.add(lbl);
    g.position.set(cx, 0, cz); scene.add(g);
  }

  function buildAnesthesie(cx, cz) {
    const g = buildRoom(7, 6, 3.0, 'left');
    addBed(g, 0, 0.2, 0);
    addVentilator(g, -2.2, -1.5, Math.PI/2);
    addMonitor(g, -1.5, -2.2, Math.PI/2);
    addDefib(g, 2.0, -1.8, -Math.PI/3);
    addCart(g, 2.5, 1.2, -Math.PI/2, 0xc0c8ce);
    const pump = new THREE.Group();
    pump.add(cyl(0.02,0.02,1.3,mat(COLORS.steel,{m:0.6}), 0, 0.65, 0));
    pump.add(box(0.12,0.22,0.08,mat(0x2a3038), 0, 1.1, 0.04));
    pump.position.set(-2.3, 0, 1.2); g.add(pump);
    const lbl = makeLabel('Lit Saikang D8D + Hamilton C6'); lbl.position.set(0, 1.7, 0.2); g.add(lbl);
    g.position.set(cx, 0, cz); scene.add(g);
  }

  function buildUrgences(cx, cz) {
    const g = buildRoom(7, 6, 3.0, 'right');
    // stretcher
    const st = new THREE.Group();
    st.add(box(0.7,0.06,1.9,mat(0xb0b8be,{m:0.5}), 0, 0.75, 0));
    st.add(box(0.65,0.1,1.8,mat(0x1e2429), 0, 0.83, 0));
    [[-0.3,-0.85],[0.3,-0.85],[-0.3,0.85],[0.3,0.85]].forEach(p=>{const w=cyl(0.06,0.06,0.035,mat(0x1a1f24),p[0],0.06,p[1]);w.rotation.z=Math.PI/2;st.add(w);});
    st.position.set(0,0,0); g.add(st);
    addMonitor(g, -2.0, -1.5, Math.PI/3);
    addDefib(g, 2.0, -1.5, -Math.PI/3); // now represents compressor in our terms visually simplified
    addVentilator(g, -2.2, 1.0, Math.PI/2);
    addCart(g, 2.5, 1.2, -Math.PI/2, 0xd0d4d8);
    const lbl = makeLabel('Brancard SKB039F + Compresseur Amoul E6'); lbl.position.set(0, 1.5, 0); g.add(lbl);
    g.position.set(cx, 0, cz); scene.add(g);
  }

  function buildRadiologie(cx, cz) {
    const g = buildRoom(7, 6, 3.0, 'left');
    addMachine(g, 0, -0.5, 0, 1.8, 2.2, 1.2, 0xe8ecef);
    addBed(g, 0, 1.8, Math.PI);
    addMonitor(g, -2.3, -1.5, Math.PI/4);
    addCabinet(g, 2.6, -1.8, -Math.PI/2);
    // lead apron hook
    g.add(box(0.08,1.4,0.4,mat(COLORS.blue,{r:0.7}), -3.2, 1.0, 1.5));
    const lbl = makeLabel('Imagerie médicale'); lbl.position.set(0, 2.4, -0.5); g.add(lbl);
    g.position.set(cx, 0, cz); scene.add(g);
  }

  function buildSterilisation(cx, cz) {
    const g = buildRoom(7, 6, 3.0, 'right');
    addMachine(g, -1.8, -1.5, 0, 1.0, 1.6, 0.8, 0xc8d0d4); // autoclave
    addMachine(g, 0.2, -1.5, 0, 1.0, 1.4, 0.7, 0xd0d8dc); // washer
    addCart(g, 2.2, 0, -Math.PI/2, 0xb0bac0);
    addCart(g, 2.2, 1.5, -Math.PI/2, 0xb0bac0);
    addCabinet(g, -2.8, 1.5, Math.PI/2);
    addTable(g, 0, 1.5, Math.PI/2);
    const lbl = makeLabel('Stérilisation centrale'); lbl.position.set(-0.8, 1.9, -1.5); g.add(lbl);
    g.position.set(cx, 0, cz); scene.add(g);
  }

  function buildMobilier(cx, cz) {
    const g = buildRoom(7, 6, 3.0, 'left');
    addBed(g, -1.4, -0.8, 0);
    addBed(g, 1.4, -0.8, 0);
    addCart(g, 0, 1.8, 0, 0xc0c8ce);
    addCabinet(g, -2.8, 0.8, Math.PI/2);
    addCabinet(g, 2.8, 0.8, -Math.PI/2);
    const lbl = makeLabel('2× Lit Saikang D8D'); lbl.position.set(0, 1.7, -0.8); g.add(lbl);
    g.position.set(cx, 0, cz); scene.add(g);
  }

  function buildEntrance(cx, cz) {
    const g = new THREE.Group();
    // reception area
    g.add(box(8, 0.08, 6, mat(0xb8c4c0, {r:0.75}), 0, -0.04, 0));
    g.add(box(8, 0.06, 6, mat(COLORS.ceil), 0, 3.5, 0));
    g.add(box(8, 3.5, 0.12, mat(COLORS.wall), 0, 1.75, -3));
    g.add(box(0.12, 3.5, 6, mat(COLORS.wall), -4, 1.75, 0));
    g.add(box(0.12, 3.5, 6, mat(COLORS.wall), 4, 1.75, 0));
    // front glass wall
    g.add(box(3, 3.5, 0.08, mat(COLORS.glass,{r:0.05,m:0.1}), -2.5, 1.75, 3));
    g.add(box(3, 3.5, 0.08, mat(COLORS.glass,{r:0.05,m:0.1}), 2.5, 1.75, 3));
    g.add(box(2, 1.3, 0.08, mat(COLORS.glass,{r:0.05}), 0, 2.85, 3));
    // reception desk
    g.add(box(2.4, 1.0, 0.7, mat(0xe8eef0,{r:0.4}), 0, 0.5, -1.2));
    g.add(box(2.5, 0.06, 0.8, mat(COLORS.steel,{m:0.4}), 0, 1.03, -1.2));
    // logo area
    const logo = box(2.0, 0.6, 0.04, mat(0x0b1e30,{r:0.4}), 0, 2.6, -2.93);
    logo.userData = {};
    g.add(logo);
    const lbl = makeLabel('La Maison Africaine du Médecin', '#00c8ee'); lbl.position.set(0, 2.6, -2.5); lbl.scale.set(2.4,0.45,1); g.add(lbl);
    // waiting chairs
    [[-2.8,-0.2],[-2.8,0.8],[2.8,-0.2],[2.8,0.8]].forEach(p=>{
      g.add(box(0.5,0.06,0.5,mat(0x1f5e9c),p[0],0.42,p[1]));
      g.add(box(0.5,0.45,0.06,mat(0x1f5e9c),p[0],0.67,p[1]-0.22));
    });
    g.add(box(3,0.02,0.15,mat(0xffffff,{emissive:0xffffff,ei:0.6}), 0, 3.48, 0));
    g.position.set(cx, 0, cz); scene.add(g);
  }

  // ---- Tour keyframes ----
  // Each keyframe: {t: 0-1 normalized time, pos:[x,y,z], look:[x,y,z], room:{num,name,desc}}
  const keyframes = [
    // Entrance
    { t: 0.00, pos: [0, 1.65, 5.5],  look: [0, 1.4, -1],   room: {num:'ENTRÉE', name:'Hall d\'accueil', desc:'Bienvenue à La Maison Africaine du Médecin'} },
    { t: 0.05, pos: [0, 1.65, 1.5],  look: [0, 1.4, -2.5], room: {num:'ENTRÉE', name:'Hall d\'accueil', desc:'Réception et orientation des patients'} },
    // Corridor start
    { t: 0.09, pos: [0, 1.65, -3.5], look: [0, 1.5, 5],    room: {num:'COULOIR', name:'Circulation principale', desc:'Accès aux différents services de la clinique'} },
    { t: 0.12, pos: [0, 1.65, 1.5],  look: [-3, 1.2, 3],   room: {num:'COULOIR', name:'Vers Bloc Opératoire', desc:'Service 01 — Chirurgie'} },
    // Bloc Opératoire (left, z=3)
    { t: 0.16, pos: [-2.5, 1.7, 3],  look: [-6.5, 1.0, 3], room: {num:'01', name:'Bloc Opératoire', desc:'Table d\'opération, scialytique, anesthésie, instrumentation'} },
    { t: 0.22, pos: [-6.0, 1.6, 4.5],look: [-5.5, 0.9, 2.5],room: {num:'01', name:'Bloc Opératoire', desc:'Équipements installés et prêts pour intervention'} },
    { t: 0.25, pos: [-2.5, 1.65, 3], look: [0, 1.5, 3],    room: {num:'01', name:'Bloc Opératoire', desc:'Retour vers la circulation'} },
    // Corridor to Anesthésie
    { t: 0.28, pos: [0, 1.65, 5.5],  look: [3, 1.3, 7],    room: {num:'COULOIR', name:'Vers Anesthésie-Réanimation', desc:'Service 02'} },
    // Anesthésie-Réa (right, z=7)
    { t: 0.32, pos: [2.5, 1.7, 7],   look: [6.5, 1.0, 7],  room: {num:'02', name:'Anesthésie-Réanimation', desc:'Lit D8D, Hamilton C6, monitorage, défibrillateur'} },
    { t: 0.38, pos: [5.8, 1.55, 8.5],look: [5.5, 0.9, 6.5],room: {num:'02', name:'Anesthésie-Réanimation', desc:'Surveillance continue du patient réanimé'} },
    { t: 0.41, pos: [2.5, 1.65, 7],  look: [0, 1.5, 7],    room: {num:'02', name:'Anesthésie-Réanimation', desc:'Retour vers la circulation'} },
    // Corridor to Urgences
    { t: 0.44, pos: [0, 1.65, 9.5],  look: [-3, 1.3, 11],  room: {num:'COULOIR', name:'Vers Urgences', desc:'Service 03 — Accueil des urgences vitales'} },
    // Urgences (left, z=11)
    { t: 0.48, pos: [-2.5, 1.7, 11], look: [-6.5, 1.0, 11],room: {num:'03', name:'Urgences', desc:'Brancard SKB039F, compresseur Amoul E6, ventilation'} },
    { t: 0.54, pos: [-6.0, 1.5, 12.5],look:[-5.5, 0.85, 10.5],room:{num:'03', name:'Urgences', desc:'Prise en charge rapide des situations critiques'} },
    { t: 0.57, pos: [-2.5, 1.65, 11],look: [0, 1.5, 11],   room: {num:'03', name:'Urgences', desc:'Retour vers la circulation'} },
    // Radiologie
    { t: 0.60, pos: [0, 1.65, 13.5], look: [3, 1.3, 15],   room: {num:'COULOIR', name:'Vers Radiologie', desc:'Service 04 — Imagerie médicale'} },
    { t: 0.64, pos: [2.5, 1.8, 15],  look: [6.5, 1.3, 15], room: {num:'04', name:'Radiologie', desc:'Équipements d\'imagerie et protection radiologique'} },
    { t: 0.69, pos: [5.5, 1.6, 16.5],look: [5.5, 1.2, 14.5],room:{num:'04', name:'Radiologie', desc:'Diagnostic par imagerie'} },
    { t: 0.72, pos: [2.5, 1.65, 15], look: [0, 1.5, 15],   room: {num:'04', name:'Radiologie', desc:'Retour vers la circulation'} },
    // Stérilisation
    { t: 0.75, pos: [0, 1.65, 17.5], look: [-3, 1.3, 19],  room: {num:'COULOIR', name:'Vers Stérilisation', desc:'Service 05 — Traitement des dispositifs médicaux'} },
    { t: 0.79, pos: [-2.5, 1.7, 19], look: [-6.5, 1.1, 19],room: {num:'05', name:'Stérilisation', desc:'Autoclaves, laveurs-désinfecteurs, conditionnement'} },
    { t: 0.84, pos: [-5.5, 1.6, 20.5],look:[-5.5, 1.0, 18.5],room:{num:'05', name:'Stérilisation', desc:'Circuit propre / sale respecté'} },
    { t: 0.87, pos: [-2.5, 1.65, 19],look: [0, 1.5, 19],   room: {num:'05', name:'Stérilisation', desc:'Retour vers la circulation'} },
    // Mobilier Médical
    { t: 0.90, pos: [0, 1.65, 21.5], look: [3, 1.3, 23],   room: {num:'COULOIR', name:'Vers Mobilier Médical', desc:'Service 06 — Équipement des chambres'} },
    { t: 0.93, pos: [2.5, 1.75, 23], look: [6.5, 1.0, 23], room: {num:'06', name:'Mobilier Médical', desc:'2× Lit Saikang D8D, mobilier de chambre'} },
    { t: 0.97, pos: [5.5, 1.6, 24.2],look: [5.5, 0.9, 22.5],room:{num:'06', name:'Mobilier Médical', desc:'Confort et fonctionnalité pour l\'hospitalisation'} },
    // End
    { t: 1.00, pos: [1.5, 1.8, 23],  look: [0, 1.5, 15],   room: {num:'FIN', name:'Visite terminée', desc:'Merci de votre visite — La Maison Africaine du Médecin'} }
  ];

  // Steps for UI
  const steps = [
    {t:0.00, label:'Entrée'},
    {t:0.16, label:'01 Bloc'},
    {t:0.32, label:'02 Réa'},
    {t:0.48, label:'03 Urgences'},
    {t:0.64, label:'04 Radio'},
    {t:0.79, label:'05 Stéril.'},
    {t:0.93, label:'06 Mobilier'}
  ];

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerp3(a, b, t) { return [lerp(a[0],b[0],t), lerp(a[1],b[1],t), lerp(a[2],b[2],t)]; }
  function ease(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

  function samplePath(t) {
    t = Math.max(0, Math.min(1, t));
    let i = 0;
    while (i < keyframes.length - 2 && keyframes[i+1].t < t) i++;
    const a = keyframes[i], b = keyframes[i+1];
    const local = (b.t === a.t) ? 0 : (t - a.t) / (b.t - a.t);
    const e = ease(local);
    return {
      pos: lerp3(a.pos, b.pos, e),
      look: lerp3(a.look, b.look, e),
      room: local < 0.5 ? a.room : b.room
    };
  }

  function fmtTime(s) {
    const m = Math.floor(s/60), sec = Math.floor(s%60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8faab8);
    scene.fog = new THREE.Fog(0x8faab8, 12, 55);

    camera = new THREE.PerspectiveCamera(55, window.innerWidth/window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.65, 5.5);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x8899aa, 0.45));
    const sun = new THREE.DirectionalLight(0xfff8e8, 0.7);
    sun.position.set(8, 15, 5); sun.castShadow = true;
    sun.shadow.mapSize.set(1024,1024);
    sun.shadow.camera.left=-20; sun.shadow.camera.right=20;
    sun.shadow.camera.top=20; sun.shadow.camera.bottom=-20;
    scene.add(sun);

    // Build clinic
    buildCorridor();
    buildEntrance(0, -1);
    // Rooms: left side negative X, right side positive X
    buildBlocOperatoire(-5.1, 3);     // left
    buildAnesthesie(5.1, 7);          // right
    buildUrgences(-5.1, 11);          // left
    buildRadiologie(5.1, 15);         // right
    buildSterilisation(-5.1, 19);     // left
    buildMobilier(5.1, 23);           // right

    // Floor ground plane
    const ground = box(30, 0.1, 60, mat(0x7a8a84,{r:0.95}), 0, -0.1, 15);
    ground.receiveShadow = true;
    scene.add(ground);

    // UI
    steps.forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'tour-step';
      btn.textContent = s.label;
      btn.addEventListener('click', () => { elapsed = s.t * DURATION; playing = true; playPauseBtn.textContent = '❚❚'; });
      stepsEl.appendChild(btn);
      s._btn = btn;
    });

    playPauseBtn.addEventListener('click', () => {
      playing = !playing;
      playPauseBtn.textContent = playing ? '❚❚' : '▶';
    });
    progressEl.addEventListener('click', (e) => {
      const r = progressEl.getBoundingClientRect();
      elapsed = ((e.clientX - r.left) / r.width) * DURATION;
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    clock = new THREE.Clock();
    loading.classList.add('hidden');
    animate();
  }

  let lastRoomName = '';
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (playing) {
      elapsed += dt;
      if (elapsed >= DURATION) { elapsed = DURATION; playing = false; playPauseBtn.textContent = '▶'; }
    }
    const t = elapsed / DURATION;
    const s = samplePath(t);
    camera.position.set(s.pos[0], s.pos[1], s.pos[2]);
    camera.lookAt(s.look[0], s.look[1], s.look[2]);

    progressBar.style.width = (t * 100) + '%';
    timeLabel.textContent = fmtTime(elapsed) + ' / ' + fmtTime(DURATION);

    if (s.room && s.room.name !== lastRoomName) {
      lastRoomName = s.room.name;
      roomNumEl.textContent = s.room.num;
      roomNameEl.textContent = s.room.name;
      roomDescEl.textContent = s.room.desc;
    }
    steps.forEach(st => st._btn && st._btn.classList.toggle('active', Math.abs(t - st.t) < 0.04));

    renderer.render(scene, camera);
  }

  if (window.THREE) init();
  else window.addEventListener('load', init);
})();
