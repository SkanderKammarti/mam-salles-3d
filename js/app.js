/* ============================================================
   app.js — Salle 3D réaliste (équipements installés)
   La Maison Africaine du Médecin — Salles 3D
   ============================================================ */
(function () {
  'use strict';

  const SERVICES = [
    { id: 'bloc',        num: '01', label: 'Bloc Opératoire',        room: 'blocOperatoire', ready: true  },
    { id: 'anesthesie',  num: '02', label: 'Anesthésie-Réanimation', room: 'anesthesieReanimation', ready: true  },
  { id: 'urgences',    num: '03', label: 'Urgences',               room: 'urgences',       ready: true },
  { id: 'radiologie',  num: '04', label: 'Radiologie',             room: 'radiologie',     ready: true },
  { id: 'sterilisation',num:'05', label: 'Stérilisation',          room: 'sterilisation',  ready: true },
  { id: 'mobilier',    num: '06', label: 'Mobilier Médical',       room: 'mobilier',       ready: true }
  ];

  /* ----------------------------------------------------------
     STATE
     ---------------------------------------------------------- */
  let renderer, scene, camera, clock;
  let currentRoom = null, currentService = null;
  let tourIndex = 0, tourPlaying = false, tourTimer = null;
  let camAnim = null, raycaster, mouse, animating = false;

  let orbitTarget = new THREE.Vector3(0, 1.0, 0);
  let orbitTheta = 0.72, orbitPhi = 1.15, orbitRadius = 7.2;
  let isDragging = false, prevMouse = { x: 0, y: 0 };
  let mouseDownPos = { x: 0, y: 0 }, mouseMoved = false;

  const $ = (s) => document.querySelector(s);
  const canvas = $('#c3d');
  const loader = $('.loader');
  const infoPanel = $('#infoPanel');
  const tourDots = $('#tourDots');

  /* ----------------------------------------------------------
     MATERIALS — réalistes
     ---------------------------------------------------------- */
  const MAT = {
    wall:    new THREE.MeshStandardMaterial({ color: 0xD9E2DE, roughness: 0.92, metalness: 0.02 }),
    wallLow: new THREE.MeshStandardMaterial({ color: 0xBECCC8, roughness: 0.72, metalness: 0.04 }),
    ceil:    new THREE.MeshStandardMaterial({ color: 0xE6EBED, roughness: 0.95 }),
    base:    new THREE.MeshStandardMaterial({ color: 0x4E5C64, roughness: 0.55, metalness: 0.45 }),
    white:   new THREE.MeshStandardMaterial({ color: 0xF1F4F5, roughness: 0.42, metalness: 0.06 }),
    light:   new THREE.MeshStandardMaterial({ color: 0xD3DDE1, roughness: 0.38, metalness: 0.2 }),
    steel:   new THREE.MeshStandardMaterial({ color: 0xAEBBC2, roughness: 0.3, metalness: 0.9 }),
    dark:    new THREE.MeshStandardMaterial({ color: 0x22292F, roughness: 0.52, metalness: 0.3 }),
    rubber:  new THREE.MeshStandardMaterial({ color: 0x171C20, roughness: 0.94 }),
    mattress:new THREE.MeshStandardMaterial({ color: 0x2A6376, roughness: 0.88 }),
    mattress2:new THREE.MeshStandardMaterial({ color: 0x357C93, roughness: 0.88 }),
    drape:   new THREE.MeshStandardMaterial({ color: 0x4E8064, roughness: 0.95 }),
    drape2:  new THREE.MeshStandardMaterial({ color: 0x609473, roughness: 0.95 }),
    glass:   new THREE.MeshStandardMaterial({ color: 0xC7DDE6, roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.38 }),
    led:     new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: 0xF6FBFF, emissiveIntensity: 1.05 }),
    red:     new THREE.MeshStandardMaterial({ color: 0xC0392B, roughness: 0.45 }),
    blue:    new THREE.MeshStandardMaterial({ color: 0x27689E, roughness: 0.45 }),
    green:   new THREE.MeshStandardMaterial({ color: 0x2A8552, roughness: 0.45 }),
    yellow:  new THREE.MeshStandardMaterial({ color: 0xD3A02C, roughness: 0.45 }),
    o2:      new THREE.MeshStandardMaterial({ color: 0xEDF2F4, roughness: 0.35, metalness: 0.45 }),
    n2o:     new THREE.MeshStandardMaterial({ color: 0x3878B0, roughness: 0.35, metalness: 0.45 })
  };
  Object.keys(MAT).forEach(function (k) {
    if (MAT[k] && 'envMapIntensity' in MAT[k]) MAT[k].envMapIntensity = 0.6;
  });

  /* ----------------------------------------------------------
     HELPERS
     ---------------------------------------------------------- */
  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  function cyl(rT, rB, h, mat, x, y, z, seg) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, seg || 20), mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  function tube(r, h, mat, x, y, z) {
    return cyl(r, r, h, mat, x, y, z, 10);
  }

  function addCasters(g, hx, hz, y, r) {
    r = r || 0.045;
    [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]].forEach(function (p) {
      const w = cyl(r, r, 0.035, MAT.rubber, p[0], y || 0.045, p[1], 12);
      w.rotation.z = Math.PI / 2;
      g.add(w);
      const fork = box(0.05, 0.05, 0.02, MAT.steel, p[0], (y || 0.045) + 0.05, p[1]);
      g.add(fork);
    });
  }

  function starBase(g, n, radius, poleR) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const arm = box(radius, 0.04, 0.05, MAT.steel, Math.cos(a) * radius / 2, 0.06, Math.sin(a) * radius / 2);
      arm.rotation.y = -a;
      g.add(arm);
      const caster = cyl(0.04, 0.04, 0.03, MAT.rubber, Math.cos(a) * radius, 0.035, Math.sin(a) * radius, 10);
      caster.rotation.z = Math.PI / 2;
      g.add(caster);
    }
    g.add(cyl(poleR || 0.03, poleR || 0.03, 0.06, MAT.steel, 0, 0.08, 0, 12));
  }

  function roundedBox(w, h, d, r, mat, x, y, z) {
    r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    const hw = w / 2 - r, hh = h / 2 - r;
    const s = new THREE.Shape();
    s.moveTo(-hw, -h / 2); s.lineTo(hw, -h / 2);
    s.quadraticCurveTo(w / 2, -h / 2, w / 2, -hh);
    s.lineTo(w / 2, hh); s.quadraticCurveTo(w / 2, h / 2, hw, h / 2);
    s.lineTo(-hw, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, hh);
    s.lineTo(-w / 2, -hh); s.quadraticCurveTo(-w / 2, -h / 2, -hw, -h / 2);
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: Math.max(0.001, d - 2 * r), bevelEnabled: true,
      bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 4
    });
    geo.center();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    m.position.set(x || 0, y || 0, z || 0);
    return m;
  }

  function makeBrandTexture(text, opts) {
    opts = opts || {};
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const x = c.getContext('2d');
    if (opts.bg) { x.fillStyle = opts.bg; x.fillRect(0, 0, 512, 128); }
    if (opts.accent) {
      x.fillStyle = opts.accent;
      x.fillRect(opts.accent === 'left' ? 0 : 0, 0, opts.accentW || 10, 128);
    }
    x.fillStyle = opts.color || '#2A3138';
    x.font = (opts.weight || '700') + ' ' + (opts.size || 56) + 'px "Segoe UI", Arial, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if ('letterSpacing' in x && opts.spacing) x.letterSpacing = opts.spacing + 'px';
    x.fillText(text, 256, 68);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  function brandPlate(g, text, w, h, x, y, z, opts) {
    opts = opts || {};
    const tex = makeBrandTexture(text, opts);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, roughness: 0.5, metalness: 0.02,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    if (opts.rotY) m.rotation.y = opts.rotY;
    if (opts.rotX) m.rotation.x = opts.rotX;
    g.add(m);
    return m;
  }

  let _brushed = null;
  function brushedTexture() {
    if (_brushed) return _brushed;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#C6CDD1'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const g = 185 + Math.floor(Math.random() * 55);
      x.strokeStyle = 'rgba(' + g + ',' + (g + 3) + ',' + (g + 5) + ',' + (0.12 + Math.random() * 0.25) + ')';
      x.lineWidth = 0.6 + Math.random() * 1.4;
      const px = Math.random() * 256;
      x.beginPath(); x.moveTo(px, 0); x.lineTo(px + (Math.random() - 0.5) * 3, 256); x.stroke();
    }
    _brushed = new THREE.CanvasTexture(c);
    _brushed.wrapS = _brushed.wrapT = THREE.RepeatWrapping;
    _brushed.repeat.set(2, 2);
    _brushed.encoding = THREE.sRGBEncoding;
    return _brushed;
  }

  function screenTexture(kind) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 160;
    const x = c.getContext('2d');
    x.fillStyle = '#06141F'; x.fillRect(0, 0, 256, 160);

    // grid
    x.strokeStyle = 'rgba(70,140,170,.16)'; x.lineWidth = 1;
    for (let i = 0; i <= 256; i += 24) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 160); x.stroke(); }
    for (let j = 0; j <= 160; j += 24) { x.beginPath(); x.moveTo(0, j); x.lineTo(256, j); x.stroke(); }

    function wave(color, yBase, amp, period, width) {
      x.strokeStyle = color; x.lineWidth = width || 2;
      x.beginPath();
      for (let i = 0; i < 256; i += 1) {
        const t = i / 256;
        let y = yBase;
        if (i % period < 6) y -= Math.sin((i % period) / 6 * Math.PI) * amp;
        else y += Math.sin(t * 30) * 1.2;
        if (i === 0) x.moveTo(i, y); else x.lineTo(i, y);
      }
      x.stroke();
    }

    if (kind === 'monitor') {
      wave('#4CE39A', 34, 20, 52, 2.2);
      wave('#48C8F0', 74, 10, 64, 2);
      wave('#F0C24A', 108, 8, 80, 2);
      x.fillStyle = '#5EE9C4'; x.font = 'bold 22px Consolas, monospace';
      x.fillText('98', 196, 30);
      x.fillStyle = '#48C8F0'; x.fillText('72', 196, 70);
      x.fillStyle = '#F0C24A'; x.fillText('36', 196, 106);
      x.fillStyle = 'rgba(200,230,240,.55)'; x.font = '10px Segoe UI';
      x.fillText('SpO2   HR   EtCO2', 96, 150);
    } else if (kind === 'vent') {
      x.strokeStyle = '#3FD1A0'; x.lineWidth = 2.4; x.beginPath();
      for (let i = 0; i < 256; i++) {
        const y = 54 - Math.max(0, Math.sin(i / 256 * Math.PI * 6)) * 30;
        if (i === 0) x.moveTo(i, y); else x.lineTo(i, y);
      }
      x.stroke();
      x.strokeStyle = '#4EA8E8'; x.lineWidth = 2; x.beginPath();
      for (let i = 0; i < 256; i++) {
        const y = 112 + Math.sin(i / 256 * Math.PI * 12) * 12;
        if (i === 0) x.moveTo(i, y); else x.lineTo(i, y);
      }
      x.stroke();
      x.fillStyle = '#7BDCF0'; x.font = 'bold 16px Consolas, monospace';
      x.fillText('Vt 480', 14, 150); x.fillText('Paw 18', 110, 150); x.fillText('FiO2 40', 186, 150);
    } else if (kind === 'esu') {
      x.fillStyle = '#0F2A38'; x.fillRect(10, 10, 236, 70);
      x.fillStyle = '#FF8A5C'; x.font = 'bold 26px Consolas, monospace';
      x.fillText('CUT  80W', 24, 46);
      x.fillStyle = '#5EE9C4'; x.font = 'bold 16px Consolas, monospace';
      x.fillText('COAG 40W', 24, 70);
      for (let i = 0; i < 6; i++) {
        x.fillStyle = i < 4 ? '#48C8F0' : '#26404E';
        x.fillRect(16 + i * 38, 100, 30, 30);
      }
    } else if (kind === 'pump') {
      x.fillStyle = 'rgba(20,60,80,.85)'; x.fillRect(8, 8, 240, 64);
      x.fillStyle = '#5EE9C4'; x.font = 'bold 40px Consolas, monospace';
      x.fillText('5.0', 30, 54);
      x.fillStyle = 'rgba(180,220,235,.8)'; x.font = '13px Segoe UI';
      x.fillText('mL/h', 120, 52);
      x.fillStyle = '#48C8F0'; x.font = '12px Segoe UI';
      x.fillText('RUN', 200, 50);
      x.fillStyle = '#48C8F0'; x.fillRect(16, 90, 224, 10);
      x.fillStyle = '#F0C24A'; x.fillRect(16, 110, 120, 8);
      x.fillStyle = '#E05A5A'; x.fillRect(16, 130, 60, 8);
    } else if (kind === 'infusion') {
      x.fillStyle = '#06141F'; x.fillRect(0, 0, 256, 160);
      x.fillStyle = '#5EE9C4'; x.font = 'bold 44px Consolas, monospace';
      x.fillText('120', 24, 58);
      x.fillStyle = 'rgba(180,220,235,.8)'; x.font = '14px Segoe UI';
      x.fillText('mL/h', 130, 56);
      x.fillStyle = '#48C8F0'; x.font = 'bold 13px Segoe UI'; x.fillText('RUN', 208, 54);
      x.fillStyle = '#3FD1A0'; x.fillRect(16, 78, 224, 12);
      x.fillStyle = '#F0C24A'; x.fillRect(16, 100, 150, 10);
      x.fillStyle = 'rgba(200,230,240,.6)'; x.font = '11px Segoe UI';
      x.fillText('VTBI 250 mL', 16, 128); x.fillText('KVO', 200, 128);
    } else if (kind === 'ecg') {
      x.fillStyle = '#FAFCFD'; x.fillRect(0, 0, 256, 160);
      x.fillStyle = '#0F1418'; x.font = 'bold 11px Consolas, monospace';
      x.fillText('I  II  III  aVR aVL aVF', 8, 14);
      x.strokeStyle = '#0F1418'; x.lineWidth = 1.4;
      var baseY = [34, 66, 98];
      for (var row = 0; row < 3; row++) {
        x.beginPath();
        var y0 = baseY[row];
        for (var i = 0; i < 256; i++) {
          var tt = i % 64, y = y0;
          if (tt < 6) y = y0 - Math.sin(tt / 6 * Math.PI) * 16;
          else if (tt >= 6 && tt < 9) y = y0 + 5;
          if (i === 0) x.moveTo(i, y); else x.lineTo(i, y);
        }
        x.stroke();
      }
      x.fillStyle = '#0F1418'; x.font = 'bold 10px Consolas, monospace';
      x.fillText('25 mm/s   10 mm/mV   HR 72', 8, 152);
    } else if (kind === 'defib') {
      x.fillStyle = '#040D16'; x.fillRect(0, 0, 256, 160);
      x.strokeStyle = 'rgba(70,140,170,.18)'; x.lineWidth = 1;
      for (let i = 0; i <= 256; i += 20) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 110); x.stroke(); }
      wave('#4CE39A', 50, 24, 48, 2.4);
      x.fillStyle = '#5EE9C4'; x.font = 'bold 26px Consolas, monospace';
      x.fillText('72', 20, 32);
      x.fillStyle = 'rgba(180,220,235,.75)'; x.font = '12px Segoe UI';
      x.fillText('bpm', 62, 32);
      x.fillStyle = '#48C8F0'; x.font = 'bold 22px Consolas, monospace';
      x.fillText('150 J', 170, 32);
      for (let i = 0; i < 4; i++) {
        x.fillStyle = i < 2 ? '#48C8F0' : '#26404E';
        x.fillRect(14 + i * 60, 118, 52, 30);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  function makeScreenMesh(w, h, kind) {
    const tex = screenTexture(kind);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xFFFFFF, emissiveIntensity: 0.9,
      roughness: 0.25, metalness: 0.05
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  }

  function makeLabel(text) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 80;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(12,26,36,.86)';
    x.beginPath();
    const r = 16, w = 512, h = 80;
    x.moveTo(r, 3); x.lineTo(w - r, 3); x.quadraticCurveTo(w - 3, 3, w - 3, r);
    x.lineTo(w - 3, h - r); x.quadraticCurveTo(w - 3, h - 3, w - r, h - 3);
    x.lineTo(r, h - 3); x.quadraticCurveTo(3, h - 3, 3, h - r);
    x.lineTo(3, r); x.quadraticCurveTo(3, 3, r, 3); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(0,200,238,.6)'; x.lineWidth = 2; x.stroke();
    x.fillStyle = '#EAF6FB'; x.font = '700 34px Segoe UI, Arial';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 256, 44);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    spr.scale.set(0.86, 0.134, 1);
    return spr;
  }

  /* ----------------------------------------------------------
     ROOM
     ---------------------------------------------------------- */
  function tileTexture() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#B9C3C6'; x.fillRect(0, 0, 512, 512);

    const TILE = 256;
    for (let ty = 0; ty < 2; ty++) {
      for (let tx = 0; tx < 2; tx++) {
        const ox = tx * TILE, oy = ty * TILE;
        const base = 158 + Math.floor(Math.random() * 12);
        x.fillStyle = 'rgb(' + base + ',' + (base + 5) + ',' + (base + 7) + ')';
        x.fillRect(ox + 2, oy + 2, TILE - 4, TILE - 4);

        // fine stone speckle
        for (let i = 0; i < 2600; i++) {
          const g = 150 + Math.floor(Math.random() * 80);
          x.fillStyle = 'rgba(' + g + ',' + (g + 4) + ',' + (g + 5) + ',' + (0.05 + Math.random() * 0.12) + ')';
          x.fillRect(ox + 4 + Math.random() * (TILE - 8), oy + 4 + Math.random() * (TILE - 8), 1 + Math.random() * 2, 1 + Math.random() * 2);
        }

        // soft cloud variation
        const grd = x.createLinearGradient(ox, oy, ox + TILE, oy + TILE);
        grd.addColorStop(0, 'rgba(255,255,255,.07)');
        grd.addColorStop(0.5, 'rgba(255,255,255,0)');
        grd.addColorStop(1, 'rgba(70,85,92,.08)');
        x.fillStyle = grd;
        x.fillRect(ox + 2, oy + 2, TILE - 4, TILE - 4);

        // grout + bevel highlight
        x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 2;
        x.strokeRect(ox + 4, oy + 4, TILE - 8, TILE - 8);
        x.strokeStyle = 'rgba(84,96,102,.85)'; x.lineWidth = 4;
        x.strokeRect(ox + 1, oy + 1, TILE - 2, TILE - 2);
      }
    }

    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3.5, 3);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer && renderer.capabilities ? renderer.capabilities.getMaxAnisotropy() : 4;
    return t;
  }

  let contactShadowTex = null;
  function getContactShadowTex() {
    if (contactShadowTex) return contactShadowTex;
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,.62)');
    g.addColorStop(0.45, 'rgba(0,0,0,.34)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    contactShadowTex = new THREE.CanvasTexture(c);
    contactShadowTex.minFilter = THREE.LinearFilter;
    return contactShadowTex;
  }

  function addContactShadow(parent, obj, cx, cz) {
    const bb = new THREE.Box3();
    obj.updateMatrixWorld(true);
    obj.traverse(function (o) {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const box = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      bb.union(box);
    });
    if (bb.isEmpty()) return;
    if (bb.min.y > 0.8) return; // ceiling-mounted equipment
    const sx = (bb.max.x - bb.min.x) + 0.5;
    const sz = (bb.max.z - bb.min.z) + 0.5;
    const mat = new THREE.MeshBasicMaterial({
      map: getContactShadowTex(), transparent: true, opacity: 0.85,
      depthWrite: false, toneMapped: false
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx || 0, 0.008, cz || 0);
    m.renderOrder = 1;
    parent.add(m);
  }

  function addShadowPatch(parent, w, d, x, z, opacity) {
    const mat = new THREE.MeshBasicMaterial({
      map: getContactShadowTex(), transparent: true, opacity: opacity || 0.7,
      depthWrite: false, toneMapped: false
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.007, z);
    m.renderOrder = 1;
    parent.add(m);
  }

  function addFloorCable(parent, pts, radius, mat) {
    const curve = new THREE.CatmullRomCurve3(pts.map(function (p) {
      return new THREE.Vector3(p[0], p[1], p[2]);
    }));
    const geo = new THREE.TubeGeometry(curve, 48, radius || 0.009, 6, false);
    const m = new THREE.Mesh(geo, mat || MAT.rubber);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function makeXrayTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 320;
    const x = c.getContext('2d');
    x.fillStyle = '#EEF6F8'; x.fillRect(0, 0, 256, 320);
    x.fillStyle = '#8E9DA3';
    x.beginPath(); x.ellipse(128, 150, 78, 118, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#B9C6CA';
    x.beginPath(); x.ellipse(88, 150, 36, 92, 0.06, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(168, 150, 36, 92, -0.06, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#6F7E84'; x.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      x.beginPath(); x.arc(128, 150, 108 - i * 6, Math.PI * 0.15, Math.PI * 0.85); x.stroke();
    }
    x.fillStyle = '#5E6C72';
    x.fillRect(118, 52, 20, 190);
    x.fillStyle = '#7B898E';
    x.fillRect(70, 244, 116, 34);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function makeStudioEnvironment() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#D8DFE2');
    g.addColorStop(0.42, '#B4BFC4');
    g.addColorStop(0.55, '#86929A');
    g.addColorStop(1, '#39434A');
    x.fillStyle = g;
    x.fillRect(0, 0, 512, 256);
    x.fillStyle = 'rgba(255,255,255,.85)';
    x.fillRect(96, 8, 130, 16);
    x.fillRect(300, 8, 116, 16);
    x.fillStyle = 'rgba(255,255,255,.4)';
    x.fillRect(0, 108, 512, 10);

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.encoding = THREE.sRGBEncoding;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const env = pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    pmrem.dispose();
    return env;
  }

  function buildRoomShell(w, d, h) {
    const g = new THREE.Group();
    const hw = w / 2, hd = d / 2;

    // floor (tiles)
    const tiles = tileTexture();
    const floorMat = new THREE.MeshStandardMaterial({
      map: tiles, bumpMap: tiles, bumpScale: 0.012,
      roughness: 0.48, metalness: 0.06, envMapIntensity: 0.45
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);

    // walls
    const wb = new THREE.Mesh(new THREE.PlaneGeometry(w, h), MAT.wall);
    wb.position.set(0, h / 2, -hd); wb.receiveShadow = true; g.add(wb);
    const wl = new THREE.Mesh(new THREE.PlaneGeometry(d, h), MAT.wall);
    wl.rotation.y = Math.PI / 2; wl.position.set(-hw, h / 2, 0); wl.receiveShadow = true; g.add(wl);
    const wr = new THREE.Mesh(new THREE.PlaneGeometry(d, h), MAT.wall);
    wr.rotation.y = -Math.PI / 2; wr.position.set(hw, h / 2, 0); wr.receiveShadow = true; g.add(wr);
    const wf = new THREE.Mesh(new THREE.PlaneGeometry(w, h), MAT.wall);
    wf.rotation.y = Math.PI; wf.position.set(0, h / 2, hd); wf.receiveShadow = true; g.add(wf);

    // ceiling
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), MAT.ceil);
    ceil.rotation.x = Math.PI / 2; ceil.position.y = h; g.add(ceil);

    // lower wall protection panels + stainless cap rail
    const bandH = 1.08;
    g.add(box(w - 0.05, bandH, 0.035, MAT.wallLow, 0, bandH / 2, -hd + 0.025));
    g.add(box(w - 0.05, bandH, 0.035, MAT.wallLow, 0, bandH / 2, hd - 0.025));
    g.add(box(0.035, bandH, d - 0.05, MAT.wallLow, -hw + 0.025, bandH / 2, 0));
    g.add(box(0.035, bandH, d - 0.05, MAT.wallLow, hw - 0.025, bandH / 2, 0));
    const railY = bandH + 0.02;
    g.add(box(w - 0.04, 0.035, 0.055, MAT.steel, 0, railY, -hd + 0.032));
    g.add(box(w - 0.04, 0.035, 0.055, MAT.steel, 0, railY, hd - 0.032));
    g.add(box(0.055, 0.035, d - 0.04, MAT.steel, -hw + 0.032, railY, 0));
    g.add(box(0.055, 0.035, d - 0.04, MAT.steel, hw - 0.032, railY, 0));

    // corner protection strips
    [[-hw + 0.03, -hd + 0.03], [hw - 0.03, -hd + 0.03], [-hw + 0.03, hd - 0.03], [hw - 0.03, hd - 0.03]].forEach(function (p) {
      g.add(box(0.06, h - 0.06, 0.06, MAT.steel, p[0], (h - 0.06) / 2, p[1]));
    });

    // baseboards
    g.add(box(w, 0.12, 0.03, MAT.base, 0, 0.06, -hd + 0.015));
    g.add(box(0.03, 0.12, d, MAT.base, -hw + 0.015, 0.06, 0));
    g.add(box(0.03, 0.12, d, MAT.base, hw - 0.015, 0.06, 0));
    g.add(box(w, 0.12, 0.03, MAT.base, 0, 0.06, hd - 0.015));

    // ceiling light panels
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0xFFFDF6, emissive: 0xFFF6E4, emissiveIntensity: 1.0, roughness: 0.35
    });
    [-1.6, 1.6].forEach(function (px) {
      [-0.9, 1.35].forEach(function (pz) {
        g.add(box(1.55, 0.05, 0.95, MAT.light, px, h - 0.035, pz));
        g.add(box(1.48, 0.03, 0.88, panelMat, px, h - 0.055, pz));
      });
    });

    // surgical light ceiling track
    g.add(box(0.09, 0.05, 2.4, MAT.steel, 0, h - 0.028, -0.1));

    // wall gas outlets (back wall)
    const outlets = [
      { c: MAT.green, x: -1.2 },
      { c: MAT.yellow, x: -0.8 },
      { c: MAT.wall, x: -0.4 },
      { c: MAT.blue, x: 0.4 },
      { c: MAT.white, x: 0.8 }
    ];
    outlets.forEach(function (o) {
      g.add(box(0.13, 0.16, 0.02, MAT.light, o.x, 1.25, -hd + 0.012));
      const d2 = cyl(0.028, 0.028, 0.012, o.c, o.x, 1.25, -hd + 0.03, 12);
      d2.rotation.x = Math.PI / 2;
      g.add(d2);
    });

    // electrical sockets
    for (let i = 0; i < 3; i++) {
      g.add(box(0.16, 0.1, 0.02, MAT.light, 1.6 + i * 0.28, 1.05, -hd + 0.052));
      g.add(box(0.05, 0.05, 0.008, MAT.dark, 1.6 + i * 0.28, 1.05, -hd + 0.064));
    }

    // wall clock
    const clockFace = cyl(0.16, 0.16, 0.03, MAT.white, -2.9, 2.3, -hd + 0.02, 24);
    clockFace.rotation.x = Math.PI / 2;
    g.add(clockFace);
    const clockRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 8, 24), MAT.dark);
    clockRing.position.set(-2.9, 2.3, -hd + 0.035);
    g.add(clockRing);

    // door on right wall (frame, vision panel, kick plate)
    const doorZ = 1.9;
    g.add(box(0.05, 2.16, 1.1, MAT.light, hw - 0.028, 1.08, doorZ));
    g.add(box(0.06, 0.28, 1.1, MAT.steel, hw - 0.035, 0.2, doorZ));
    const vision = box(0.02, 0.52, 0.32, MAT.glass, hw - 0.058, 1.55, doorZ);
    g.add(vision);
    g.add(box(0.065, 2.2, 0.05, MAT.base, hw - 0.035, 1.1, doorZ - 0.57));
    g.add(box(0.065, 2.2, 0.05, MAT.base, hw - 0.035, 1.1, doorZ + 0.57));
    g.add(box(0.065, 0.05, 1.19, MAT.base, hw - 0.035, 2.18, doorZ));
    const handle = cyl(0.02, 0.02, 0.16, MAT.steel, hw - 0.085, 1.02, doorZ - 0.34, 10);
    handle.rotation.x = Math.PI / 2;
    g.add(handle);

    return g;
  }

  /* ----------------------------------------------------------
     EQUIPMENT BUILDERS (facing +Z)
     ---------------------------------------------------------- */

  /* 1. Table opératoire (Infimed) — modèle GLB importé + fallback procédural */
  let tableModelProto = null;

  function loadOperatingTableModel(cb) {
    if (!THREE.GLTFLoader) { cb(); return; }
    const loader = new THREE.GLTFLoader();
    loader.load(
      'assets/models/table_operation_infimed.glb',
      function (gltf) {
        tableModelProto = gltf.scene;
        cb();
      },
      undefined,
      function (err) {
        console.warn('Modèle 3D de la table indisponible, fallback procédural.', err);
        cb();
      }
    );
  }

  function buildOperatingTableFromGLB() {
    const g = new THREE.Group();
    // Le GLB est en mètres : longueur 1,99 m sur X, tête côté +X.
    // On le tourne de 90° pour aligner la longueur sur Z avec la tête vers -Z.
    const model = tableModelProto.clone(true);
    model.rotation.y = Math.PI / 2;
    model.traverse(function (o) {
      if (!o.isMesh) return;
      o.userData.sharedModel = true; // ressources partagées avec le prototype
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(function (m) { m.envMapIntensity = 0.7; });
      }
    });
    g.add(model);
    brandPlate(g, 'INFIMED', 0.2, 0.05, 0, 0.46, 0.132, { color: '#E6ECF1', size: 60 });
    const lbl = makeLabel('Table opératoire');
    lbl.position.set(0, 1.18, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  function buildOperatingTable() {
    if (tableModelProto) return buildOperatingTableFromGLB();
    const g = new THREE.Group();

    // --- mat polished stainless steel (Infimed: table top, base & column covers) ---
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xC9CFD3, roughness: 0.34, metalness: 0.9 });
    const steelDark = new THREE.MeshStandardMaterial({ color: 0xA7AEB3, roughness: 0.42, metalness: 0.8 });
    const rubber = MAT.rubber;

    // --- "T" base with 5 antistatic casters (4 rear in 2 pairs + 1 directional front) ---
    // cross bar of the T
    g.add(roundedBox(0.86, 0.055, 0.24, 0.03, steelDark, 0, 0.075, 0.16));
    // longitudinal spine toward the front castor
    g.add(roundedBox(0.2, 0.05, 0.66, 0.025, steelDark, 0, 0.072, -0.12));
    // rear twin casters (2 pairs)
    [[-0.34, 0.18], [0.34, 0.18]].forEach(function (p) {
      g.add(box(0.16, 0.09, 0.09, steelDark, p[0], 0.05, p[1]));
      [-0.05, 0.05].forEach(function (dz) {
        const w = cyl(0.05, 0.05, 0.035, rubber, p[0], 0.05, p[1] + dz, 16);
        w.rotation.z = Math.PI / 2; g.add(w);
      });
    });
    // front directional castor
    const fw = cyl(0.055, 0.055, 0.04, rubber, 0, 0.055, -0.42, 16);
    fw.rotation.z = Math.PI / 2; g.add(fw);
    g.add(box(0.07, 0.14, 0.05, steelDark, 0, 0.13, -0.42));
    // foot-operated central brake pedal (on the base)
    g.add(box(0.16, 0.03, 0.19, steelDark, 0.28, 0.11, 0.24));
    g.add(box(0.02, 0.05, 0.02, MAT.dark, 0.28, 0.14, 0.15));

    // --- column: brushed mat steel + bellows + column cover ---
    g.add(cyl(0.155, 0.2, 0.17, steelMat, 0, 0.16, 0, 24));        // foot flare into base
    g.add(cyl(0.12, 0.12, 0.3, steelMat, 0, 0.4, 0, 24));          // lower column (cover)
    // protective bellows sleeve (5 rings) — visible in the VIVAX photo
    const bellowMat = new THREE.MeshStandardMaterial({ color: 0x8E979C, roughness: 0.8, metalness: 0.08 });
    for (let i = 0; i < 5; i++) g.add(cyl(0.128, 0.128, 0.03, bellowMat, 0, 0.59 + i * 0.046, 0, 20));
    g.add(cyl(0.135, 0.135, 0.1, steelMat, 0, 0.845, 0, 24));      // upper column cover
    // battery / power connector box on the column
    g.add(roundedBox(0.17, 0.14, 0.09, 0.02, steelDark, 0, 0.5, 0.115));
    g.add(box(0.12, 0.02, 0.02, MAT.dark, 0, 0.5, 0.162));         // charger socket
    g.add(box(0.05, 0.05, 0.02, MAT.dark, 0.05, 0.45, 0.162));     // switch / equalization conn.
    // battery state indicator LED
    g.add(cyl(0.008, 0.008, 0.012, new THREE.MeshStandardMaterial({ color: 0x1A1E22, emissive: 0x36D06A, emissiveIntensity: 0.8 }), -0.05, 0.46, 0.162, 8));
    // side control panel on the column (function selection)
    g.add(box(0.09, 0.16, 0.06, MAT.dark, 0.135, 0.66, 0.02));
    for (let r = 0; r < 4; r++) g.add(cyl(0.009, 0.009, 0.012, MAT.steel, 0.135, 0.72 - r * 0.04, 0.052, 8));

    // --- tabletop: stainless steel frame, highly articulated, X-ray translucent ---
    const steelTop = new THREE.MeshStandardMaterial({ color: 0xD2D8DC, roughness: 0.3, metalness: 0.92 });
    const Y = 0.98;
    // sub-frame under the sections (cassette tunnel)
    g.add(box(0.6, 0.08, 1.98, steelTop, 0, Y - 0.055, 0));
    // head section (tiltable)
    const head = box(0.56, 0.06, 0.48, steelTop, 0, Y, -0.72); head.rotation.x = -0.04; g.add(head);
    // torso / back section
    g.add(box(0.56, 0.06, 0.62, steelTop, 0, Y, -0.16));
    // seat section
    g.add(box(0.56, 0.06, 0.3, steelTop, 0, Y, 0.3));
    // leg split plates (abduction)
    [-0.14, 0.14].forEach(function (sx) {
      g.add(box(0.26, 0.06, 0.46, steelTop, sx, Y, 0.68));
    });

    // --- polyurethane antistatic mattresses (50 mm, seamless, grey) ---
    const mattress = new THREE.MeshStandardMaterial({ color: 0x8D9499, roughness: 0.9, metalness: 0.03 });
    g.add(box(0.5, 0.05, 0.46, mattress, 0, Y + 0.055, -0.72));
    g.add(box(0.5, 0.05, 0.6, mattress, 0, Y + 0.055, -0.16));
    g.add(box(0.5, 0.05, 0.28, mattress, 0, Y + 0.055, 0.3));
    [-0.14, 0.14].forEach(function (sx) {
      g.add(box(0.24, 0.05, 0.44, mattress, sx, Y + 0.055, 0.68));
    });
    // head pad (headrest, tiltable)
    const hs = box(0.34, 0.05, 0.14, mattress, 0, Y + 0.075, -1.02); hs.rotation.x = 0.12; g.add(hs);
    g.add(box(0.32, 0.02, 0.02, steelTop, 0, Y + 0.11, -1.05));

    // --- accessory side rails (stainless, both sides) ---
    [-1, 1].forEach(function (s) {
      const rail = cyl(0.02, 0.02, 1.9, steelMat, s * 0.33, Y - 0.01, 0.02, 12);
      rail.rotation.x = Math.PI / 2; g.add(rail);
      g.add(box(0.024, 0.1, 0.024, steelMat, s * 0.33, Y + 0.02, -0.92));
      g.add(box(0.024, 0.1, 0.024, steelMat, s * 0.33, Y + 0.02, 0.78));
    });

    // --- sterile field (green drape) + instrument tray ---
    g.add(box(0.58, 0.012, 0.96, MAT.drape, 0, Y + 0.083, 0.05));
    g.add(box(0.6, 0.16, 0.02, MAT.drape2, 0, Y + 0.0, 0.56));
    [-0.3, 0.3].forEach(function (sx) {
      g.add(box(0.02, 0.17, 0.95, MAT.drape2, sx, Y - 0.01, 0.05));
    });
    g.add(box(0.26, 0.04, 0.14, MAT.drape2, 0, Y + 0.11, -0.3));
    g.add(box(0.34, 0.015, 0.22, steelMat, 0.35, Y + 0.1, 0.28));
    g.add(box(0.3, 0.005, 0.18, MAT.light, 0.35, Y + 0.111, 0.28));
    // remote hand control (wired)
    g.add(roundedBox(0.15, 0.02, 0.2, 0.012, MAT.dark, 0.43, Y + 0.03, -0.12));
    g.add(box(0.11, 0.006, 0.14, MAT.light, 0.43, Y + 0.043, -0.12));
    g.add(tube(0.011, 0.46, MAT.rubber, 0.39, Y - 0.22, -0.06));

    // --- brand plate on the column cover ---
    brandPlate(g, 'INFIMED', 0.2, 0.05, 0, 0.4, 0.126, { color: '#3A4147', size: 60 });

    const lbl = makeLabel('Table opératoire');
    lbl.position.set(0, 1.55, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* 2. Scialytique (Infimed) — tête circulaire blanche + anneau LED bleu */
  function buildScialytique() {
    const g = new THREE.Group();
    const whiteMatte = new THREE.MeshStandardMaterial({ color: 0xF2F4F2, roughness: 0.5, metalness: 0.05 });
    const whiteGloss = new THREE.MeshStandardMaterial({ color: 0xFAFBFA, roughness: 0.28, metalness: 0.1 });
    const armMat = new THREE.MeshStandardMaterial({ color: 0xEDF0EE, roughness: 0.4, metalness: 0.15 });
    const hx = -1.15, hz = -1.2;          // lamp head centre
    const faceY = 2.5;

    // ceiling mount plate + joint
    g.add(cyl(0.14, 0.15, 0.045, whiteGloss, 0, 2.975, 0.9, 24));
    g.add(cyl(0.055, 0.055, 0.12, MAT.steel, 0, 2.92, 0.9, 16));

    // first arm: from ceiling down-forward
    const a1 = box(0.07, 0.07, 0.72, armMat, 0, 2.9, 0.58);
    g.add(a1);
    const j1 = cyl(0.06, 0.06, 0.14, MAT.steel, 0, 2.9, 0.24, 16);
    j1.rotation.x = Math.PI / 2; g.add(j1);
    // second arm: swings left towards the head
    const a2 = box(0.62, 0.062, 0.062, armMat, hx + 0.36, 2.82, 0.2);
    g.add(a2);
    const j2 = cyl(0.055, 0.055, 0.13, MAT.steel, hx + 0.66, 2.82, 0.2, 16);
    j2.rotation.z = Math.PI / 2; g.add(j2);
    // third arm: down to the head yoke
    const a3 = box(0.058, 0.5, 0.058, armMat, hx, 2.66, 0.05);
    g.add(a3);
    // yoke / suspension fork
    g.add(cyl(0.045, 0.045, 0.1, MAT.steel, hx, 2.44, 0.05, 16));

    // --- lamp head: shallow dome, front face plate, blue LED ring ---
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x2C6FD6, roughness: 0.35, metalness: 0.3 });
    const headGeo = new THREE.CylinderGeometry(0.38, 0.42, 0.13, 36);
    const head = new THREE.Mesh(headGeo, whiteGloss);
    head.position.set(hx, faceY + 0.09, hz);
    head.castShadow = true; g.add(head);
    // rear rim
    g.add(cyl(0.42, 0.42, 0.03, whiteMatte, hx, faceY + 0.02, hz, 36));
    // angled front face plate
    const faceMat = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF, emissive: 0xEAF4FF, emissiveIntensity: 0.35,
      roughness: 0.3, metalness: 0.05
    });
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.02, 36), faceMat);
    face.position.set(hx, faceY, hz); g.add(face);
    // blue LED halo ring (visible in photo on the rim)
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.02, 10, 40), ringMat);
    halo.rotation.x = Math.PI / 2; halo.position.set(hx, faceY + 0.015, hz); g.add(halo);
    const haloGlow = new THREE.PointLight(0x3D7FE6, 0.25, 1.6, 2);
    haloGlow.position.set(hx, faceY, hz); g.add(haloGlow);
    // optical engine: central hub + concentric LED clusters
    const ledMill = new THREE.MeshStandardMaterial({ color: 0xFFFDF4, emissive: 0xFFF6E0, emissiveIntensity: 1.2 });
    g.add(cyl(0.07, 0.07, 0.03, whiteMatte, hx, faceY - 0.015, hz, 20));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.add(cyl(0.02, 0.02, 0.012, ledMill, hx + Math.cos(a) * 0.22, faceY - 0.012, hz + Math.sin(a) * 0.22, 10));
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      g.add(cyl(0.018, 0.018, 0.012, ledMill, hx + Math.cos(a) * 0.11, faceY - 0.012, hz + Math.sin(a) * 0.11, 10));
    }
    // sterile central handle
    g.add(cyl(0.016, 0.016, 0.26, MAT.steel, hx, faceY - 0.2, hz, 12));
    g.add(cyl(0.028, 0.028, 0.03, MAT.steel, hx, faceY - 0.06, hz, 14));

    // light beam + warm glow
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xFFF2D6, transparent: true, opacity: 0.055, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending
    });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.5, 32, 1, true), beamMat);
    beam.position.set(hx, faceY - 0.78, hz); g.add(beam);
    const glow = new THREE.PointLight(0xFFF3DC, 0.4, 3, 1.4);
    glow.position.set(hx, faceY - 0.25, hz); g.add(glow);

    // brand plate on the head rim
    brandPlate(g, 'INFIMED', 0.24, 0.06, hx, faceY + 0.04, hz + 0.425, { color: '#2A3138', size: 62 });

    const lbl = makeLabel('Scialytique');
    lbl.position.set(hx, 3.0, hz);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* 3. Machine d'anesthésie (Superstar S6200A) — modèle OBJ importé + fallback procédural */
  let anesthesiaModelProto = null;
  let _objScreenMatVent = null;
  let _objScreenMatMon = null;

  function objMaterialFor(name, objName) {
    const M = THREE.MeshStandardMaterial;
    switch (name) {
      case 'plastique_blanc': return new M({ color: 0xEDF0F2, roughness: 0.42, metalness: 0.06 });
      case 'noir_mat':        return new M({ color: 0x232A30, roughness: 0.55, metalness: 0.15 });
      case 'inox':            return new M({ color: 0xB7C2C9, roughness: 0.3, metalness: 0.88 });
      case 'plateau_gris':    return new M({ color: 0xC2CBD1, roughness: 0.38, metalness: 0.35 });
      case 'ecran': {
        const kind = objName === 'moniteur_ecran' ? 'monitor' : 'vent';
        if (kind === 'monitor' && _objScreenMatMon) return _objScreenMatMon;
        if (kind === 'vent' && _objScreenMatVent) return _objScreenMatVent;
        const tex = screenTexture(kind);
        const mat = new M({
          map: tex, emissiveMap: tex, emissive: 0xFFFFFF, emissiveIntensity: 0.9,
          roughness: 0.25, metalness: 0.05
        });
        if (kind === 'monitor') _objScreenMatMon = mat; else _objScreenMatVent = mat;
        return mat;
      }
      case 'vaporisateur_isoflurane': return new M({ color: 0x6D5FC0, roughness: 0.4, metalness: 0.2 });
      case 'vaporisateur_halothane':  return new M({ color: 0xD9A63A, roughness: 0.4, metalness: 0.2 });
      case 'plastique_transparent':   return new M({ color: 0xC7DDE6, roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.48 });
      case 'absorbeur':               return new M({ color: 0xDCE4E8, roughness: 0.6, metalness: 0.05 });
      case 'tuyau_blanc':             return new M({ color: 0xC9D3D9, roughness: 0.85, metalness: 0.03 });
      case 'ballon_bleu':             return new M({ color: 0x4E86C4, roughness: 0.8, metalness: 0.03 });
      default:                        return new M({ color: 0xDDD8D2, roughness: 0.55, metalness: 0.1 });
    }
  }

  function loadAnesthesiaModel(cb) {
    if (!THREE.OBJLoader) { cb(); return; }
    const loader = new THREE.OBJLoader();
    loader.load(
      'assets/models/S6200A.obj',
      function (obj) {
        const matCache = {};
        obj.traverse(function (o) {
          if (!o.isMesh) return;
          if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
          const pick = function (m) {
            const nm = (m && m.name) || 'default';
            const key = nm + '|' + o.name;
            if (!matCache[key]) {
              const mat = objMaterialFor(nm, o.name);
              mat.name = nm;
              matCache[key] = mat;
            }
            return matCache[key];
          };
          o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material);
          o.castShadow = true;
          o.receiveShadow = true;
          o.userData.sharedModel = true;
        });
        anesthesiaModelProto = obj;
        cb();
      },
      undefined,
      function (err) {
        console.warn("Modèle 3D de la machine d'anesthésie indisponible, fallback procédural.", err);
        cb();
      }
    );
  }

  let lastAnesInfo = null;

  function buildAnesthesiaMachineFromOBJ() {
    const g = new THREE.Group();
    // OBJ en mètres (0,66 × 1,62 × 0,67 m), avant tourné vers +Z — identique aux builders.
    const model = anesthesiaModelProto.clone(true);
    let meshCount = 0; const matNames = {};
    model.traverse(function (o) {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.userData.sharedModel = true;
        meshCount++;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(function (m) { if (m && m.name) matNames[m.name] = (matNames[m.name] || 0) + 1; });
      }
    });
    lastAnesInfo = { meshes: meshCount, materials: Object.keys(matNames).length };
    g.add(model);
    brandPlate(g, 'SUPERSTAR S6200A', 0.26, 0.035, 0, 0.665, 0.276, { color: '#3A4147', size: 40 });
    const lbl = makeLabel("Machine d'anesthésie");
    lbl.position.set(0, 1.78, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  function buildAnesthesiaMachine() {
    if (anesthesiaModelProto) return buildAnesthesiaMachineFromOBJ();
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xEEF1F4, roughness: 0.42, metalness: 0.08 });
    const bodyDark = new THREE.MeshStandardMaterial({ color: 0x5A6672, roughness: 0.5, metalness: 0.2 });
    const drawerMat = new THREE.MeshStandardMaterial({ color: 0xE2E6EA, roughness: 0.5, metalness: 0.06 });

    // --- base chassis on casters (Ø125 mm) ---
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x39424C, roughness: 0.5, metalness: 0.35 });
    g.add(roundedBox(0.66, 0.09, 0.56, 0.03, baseMat, 0, 0.075, 0));
    addCasters(g, 0.27, 0.22, 0.062, 0.062);

    // --- main body (lower cabinet with 3 drawers) ---
    g.add(roundedBox(0.6, 0.62, 0.5, 0.03, bodyMat, 0, 0.46, 0));
    // drawers (front = +z)
    for (let i = 0; i < 3; i++) {
      const y = 0.24 + i * 0.18;
      g.add(roundedBox(0.5, 0.15, 0.03, 0.015, drawerMat, 0, y, 0.255));
      g.add(box(0.16, 0.018, 0.02, MAT.steel, 0, y + 0.05, 0.275));
    }
    // top deck-forming shelf
    g.add(roundedBox(0.64, 0.05, 0.54, 0.02, MAT.light, 0, 0.79, 0));
    // drawer rail + accessory rail
    g.add(box(0.6, 0.04, 0.02, MAT.steel, 0, 0.82, 0.27));
    // push handle
    g.add(box(0.5, 0.035, 0.035, MAT.steel, 0, 0.86, -0.28));
    g.add(box(0.035, 0.14, 0.035, MAT.steel, -0.24, 0.8, -0.28));
    g.add(box(0.035, 0.14, 0.035, MAT.steel, 0.24, 0.8, -0.28));

    // --- 12.1" monitor on articulated arm (upper right) ---
    const armMat = MAT.steel;
    g.add(cyl(0.024, 0.024, 0.34, armMat, 0.2, 1.02, -0.06, 12));
    g.add(cyl(0.024, 0.024, 0.22, armMat, 0.24, 1.16, -0.02, 12));
    const monGrp = new THREE.Group();
    monGrp.position.set(0.17, 1.28, 0.03);
    g.add(monGrp);
    // 12.1" ≈ 0.30 m wide body
    monGrp.add(roundedBox(0.34, 0.27, 0.05, 0.02, bodyDark, 0, 0, 0));
    const scr = makeScreenMesh(0.3, 0.23, 'monitor');
    scr.position.set(0, 0, 0.028); monGrp.add(scr);
    monGrp.add(box(0.34, 0.02, 0.052, MAT.light, 0, 0.135, 0.002));
    // press-and-turn style knob under the screen
    monGrp.add(cyl(0.018, 0.018, 0.02, MAT.dark, 0.12, -0.115, 0.03, 14));

    // --- LED top light (Superstar "LED top light") ---
    g.add(cyl(0.05, 0.05, 0.02, MAT.light, 0.1, 1.66, 0.0, 16));
    g.add(cyl(0.045, 0.045, 0.01, new THREE.MeshStandardMaterial({ color: 0xF4F7E8, emissive: 0xF6FFE0, emissiveIntensity: 0.6 }), 0.1, 1.65, 0.0, 16));

    // --- flowmeter block (upper left) ---
    g.add(roundedBox(0.24, 0.3, 0.14, 0.02, MAT.light, -0.17, 1.05, 0.02));
    // two back-lit glass tubes (O2 + N2O), tilted forward slightly
    [[-0.22, 0x9FD4F0], [-0.1, 0x9FD4F0]].forEach(function (t, i) {
      const gm = new THREE.MeshStandardMaterial({
        color: t[1], transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.05,
        emissive: 0x2C6FA0, emissiveIntensity: 0.25
      });
      const tubeG = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 14), gm);
      tubeG.position.set(t[0], 1.1, 0.065); tubeG.rotation.x = 0.12; g.add(tubeG);
      // float
      g.add(cyl(0.013, 0.013, 0.02, MAT.dark, t[0], 1.06, 0.07, 10));
      // knob
      g.add(cyl(0.022, 0.022, 0.03, MAT.dark, t[0], 1.23, 0.05, 14));
    });
    // pressure gauges
    [-0.22, -0.1].forEach(function (dx) {
      const gg = cyl(0.032, 0.032, 0.014, MAT.white, dx, 0.94, 0.075, 18);
      gg.rotation.x = Math.PI / 2; g.add(gg);
    });

    // --- vaporizers (front, three agents) ---
    [MAT.yellow, MAT.red, MAT.blue].forEach(function (m, i) {
      const dx = -0.16 + i * 0.16;
      g.add(roundedBox(0.12, 0.14, 0.13, 0.02, m, dx, 0.88, 0.36));
      g.add(cyl(0.045, 0.045, 0.02, MAT.dark, dx, 0.96, 0.36, 16));   // dial
      g.add(box(0.02, 0.06, 0.01, MAT.dark, dx + 0.05, 0.96, 0.365));  // dial pointer
    });

    // --- absorber canister + breathing circuit (right side) ---
    const canMat = new THREE.MeshStandardMaterial({
      color: 0xCFE0E8, transparent: true, opacity: 0.6, roughness: 0.15
    });
    g.add(cyl(0.075, 0.075, 0.2, canMat, 0.26, 1.0, 0.18, 18));
    g.add(cyl(0.08, 0.08, 0.03, MAT.light, 0.26, 1.11, 0.18, 18));
    g.add(cyl(0.08, 0.08, 0.03, MAT.light, 0.26, 0.89, 0.18, 18));
    // integrated bellows (0–1500 mL) — vertical accordion canister
    const bellowsMat = new THREE.MeshStandardMaterial({ color: 0xD9E2E8, roughness: 0.6, transparent: true, opacity: 0.85 });
    const bellows = new THREE.Group();
    bellows.position.set(-0.16, 1.05, 0.14);
    g.add(bellows);
    bellows.add(cyl(0.075, 0.075, 0.02, MAT.light, 0, 0.19, 0, 18));
    for (let i = 0; i < 5; i++) bellows.add(cyl(0.072 - i * 0.004, 0.072 - i * 0.004, 0.028, bellowsMat, 0, 0.15 - i * 0.032, 0, 18));
    bellows.add(cyl(0.06, 0.06, 0.02, MAT.dark, 0, -0.02, 0, 18));
    // breathing tubes sweeping to the left toward the patient
    const t1 = holoTube(0.028, 0.6, MAT.glass, 0.3, 1.32, 0.36); g.add(t1);
    g.add(tube(0.024, 0.5, MAT.glass, 0.14, 1.36, 0.4));
    // blue reservoir bag (very visible in the photo)
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x2E6FC4, roughness: 0.35, metalness: 0.05, transparent: true, opacity: 0.9 });
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 16), bagMat);
    bag.scale.set(1, 1.25, 1); bag.position.set(-0.05, 0.94, 0.34); g.add(bag);
    g.add(cyl(0.03, 0.03, 0.05, MAT.light, -0.05, 1.07, 0.34, 12));
    g.add(cyl(0.03, 0.03, 0.05, MAT.light, -0.05, 0.81, 0.34, 12));

    // --- gas cylinders behind the chassis ---
    const o2Mat = new THREE.MeshStandardMaterial({ color: 0xEDF2F4, roughness: 0.35, metalness: 0.4 });
    const n2Mat = new THREE.MeshStandardMaterial({ color: 0x3878B0, roughness: 0.35, metalness: 0.4 });
    g.add(cyl(0.09, 0.09, 0.82, o2Mat, -0.2, 0.45, -0.34, 18));
    g.add(cyl(0.035, 0.035, 0.1, MAT.steel, -0.2, 0.91, -0.34, 12));
    g.add(cyl(0.09, 0.09, 0.82, n2Mat, 0.1, 0.45, -0.36, 18));
    g.add(cyl(0.035, 0.035, 0.1, MAT.steel, 0.1, 0.91, -0.36, 12));
    g.add(box(0.1, 0.06, 0.005, MAT.green, -0.2, 0.72, -0.255));

    // brand plate on the drawer front
    brandPlate(g, 'SUPERSTAR', 0.34, 0.05, 0, 0.62, 0.272, { color: '#3A4A56', size: 56 });

    const lbl = makeLabel("Machine d'anesthésie");
    lbl.position.set(0, 1.62, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  function holoTube(r, h, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), mat);
    m.position.set(x, y, z);
    m.rotation.z = 0.5;
    m.castShadow = true;
    return m;
  }

  /* 4. Moniteur EDAN Elite V12 sur pied à roulettes */
  /* 4b. Moniteur EDAN série V — modèle OBJ importé sur pied roulant */
  let edanMonitorProto = null;
  let lastEdanInfo = null;

  function edanMaterialFor(name) {
    const M = THREE.MeshStandardMaterial;
    switch (name) {
      case 'boitier_blanc':       return new M({ color: 0xF1F4F6, roughness: 0.4, metalness: 0.05 });
      case 'module_gris':         return new M({ color: 0xB9C2C8, roughness: 0.42, metalness: 0.25 });
      case 'cadre_ecran':         return new M({ color: 0x272D33, roughness: 0.5, metalness: 0.15 });
      case 'inox':                return new M({ color: 0xB7C2C9, roughness: 0.3, metalness: 0.85 });
      case 'verrou_vert':         return new M({ color: 0x2E9E63, roughness: 0.45, metalness: 0.15 });
      case 'vert':                return new M({ color: 0x2E9E63, roughness: 0.45, metalness: 0.15 });
      case 'jaune':               return new M({ color: 0xD9A63A, roughness: 0.45, metalness: 0.15 });
      case 'orange':              return new M({ color: 0xE08A2E, roughness: 0.45, metalness: 0.15 });
      case 'gris_fonce':          return new M({ color: 0x5A6672, roughness: 0.5, metalness: 0.2 });
      case 'lampe_alarme_rouge':  return new M({ color: 0x7A1E18, roughness: 0.5, emissive: 0xC8241A, emissiveIntensity: 0.85 });
      case 'lampe_alarme_jaune':  return new M({ color: 0x7A5A14, roughness: 0.5, emissive: 0xD39A22, emissiveIntensity: 0.8 });
      case 'noir':                return new M({ color: 0x1C2228, roughness: 0.55, metalness: 0.1 });
      case 'caoutchouc':          return new M({ color: 0x1A1E22, roughness: 0.95, metalness: 0.02 });
      case 'bleu':                return new M({ color: 0x2C5C8F, roughness: 0.45, metalness: 0.2 });
      case 'rouge':               return new M({ color: 0xB33A2E, roughness: 0.45, metalness: 0.15 });
      case 'violet':              return new M({ color: 0x6D5FC0, roughness: 0.45, metalness: 0.15 });
      default:                    return new M({ color: 0xDDD8D2, roughness: 0.55, metalness: 0.1 });
    }
  }

  function loadEdanMonitorModel(cb) {
    if (!THREE.OBJLoader) { cb(); return; }
    new THREE.OBJLoader().load(
      'assets/models/edan-elite-v12.obj',
      function (obj) {
        const matCache = {};
        obj.traverse(function (o) {
          if (!o.isMesh) return;
          if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
          const pick = function (m) {
            const nm = (m && m.name) || 'default';
            if (!matCache[nm]) { const mat = edanMaterialFor(nm); mat.name = nm; matCache[nm] = mat; }
            return matCache[nm];
          };
          o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material);
          o.castShadow = true; o.receiveShadow = true;
          o.userData.sharedModel = true;
          if (o.name === 'ecran_affichage') o.visible = false; // remplacé par un écran texturé
        });
        edanMonitorProto = obj;
        cb();
      },
      undefined,
      function (err) {
        console.warn('Modèle 3D du moniteur EDAN indisponible, fallback procédural.', err);
        cb();
      }
    );
  }

  function buildMonitorFromOBJ() {
    const g = new THREE.Group();
    const bezelMat = new THREE.MeshStandardMaterial({ color: 0x2A3036, roughness: 0.5, metalness: 0.15 });
    // pied roulant EDAN (5 branches)
    starBase(g, 5, 0.42, 0.032);
    addCasters(g, 0.4, 0.4, 0.05, 0.05);
    g.add(cyl(0.032, 0.032, 1.34, MAT.steel, 0, 0.72, -0.06, 16));
    g.add(cyl(0.05, 0.05, 0.09, bezelMat, 0, 1.38, -0.06, 16));
    g.add(box(0.07, 0.07, 0.16, bezelMat, 0, 1.42, -0.02));

    const head = edanMonitorProto.clone(true);
    let meshCount = 0; const matNames = {}; let screenMesh = null;
    head.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.userData.sharedModel = true;
      meshCount++;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function (m) { if (m && m.name) matNames[m.name] = 1; });
      if (o.name === 'ecran_affichage') screenMesh = o;
    });

    // écran texturé (l'OBJ n'a pas d'UV exploitables)
    if (screenMesh) {
      screenMesh.geometry.computeBoundingBox();
      const bb = screenMesh.geometry.boundingBox;
      const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y;
      const cx = (bb.max.x + bb.min.x) / 2, cy = (bb.max.y + bb.min.y) / 2;
      const scr = makeScreenMesh(w * 0.97, h * 0.97, 'monitor');
      scr.position.set(cx, cy, bb.max.z + 0.0015);
      head.add(scr);
    }

    head.position.set(0, 1.34, 0.025); // bas du boîtier à 1,34 m ; écran vers 1,58 m
    g.add(head);
    lastEdanInfo = { meshes: meshCount, materials: Object.keys(matNames).length };

    const lbl = makeLabel('Moniteur');
    lbl.position.set(0, 1.95, 0.05);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  function buildMonitor() {
    if (edanMonitorProto) return buildMonitorFromOBJ();
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xF3F5F6, roughness: 0.4, metalness: 0.06 });
    const bezelMat = new THREE.MeshStandardMaterial({ color: 0x2A3036, roughness: 0.5, metalness: 0.15 });
    // star base + casters (EDAN rolling stand, 5 legs)
    starBase(g, 5, 0.42, 0.032);
    addCasters(g, 0.4, 0.4, 0.05, 0.05);
    g.add(cyl(0.032, 0.032, 1.28, MAT.steel, 0, 0.7, 0, 16));
    // height collar + pivot
    g.add(cyl(0.05, 0.05, 0.09, bezelMat, 0, 1.34, 0, 16));
    g.add(box(0.06, 0.06, 0.2, bezelMat, 0, 1.48, -0.04));
    // monitor body (elite V12: 17" 1280×1024 → ~0.4 wide) — white housing
    const body = roundedBox(0.46, 0.34, 0.08, 0.02, bodyMat, 0, 1.62, 0.12);
    g.add(body);
    g.add(box(0.42, 0.29, 0.015, bezelMat, 0, 1.62, 0.165));
    const scr = makeScreenMesh(0.39, 0.26, 'monitor');
    scr.position.set(0, 1.62, 0.178);
    g.add(scr);
    // (XM/V) plug-in module rack on the right flank
    g.add(box(0.06, 0.26, 0.19, bodyMat, 0.25, 1.6, 0.1));
    g.add(box(0.07, 0.1, 0.13, bezelMat, 0.255, 1.7, 0.11));
    g.add(box(0.07, 0.1, 0.13, bezelMat, 0.255, 1.58, 0.11));
    g.add(box(0.07, 0.1, 0.13, bezelMat, 0.255, 1.46, 0.11));
    // soft-key row under screen
    for (let i = 0; i < 5; i++) {
      g.add(box(0.028, 0.02, 0.014, bezelMat, 0.16 - i * 0.05, 1.44, 0.17));
    }
    // integrated top handle
    g.add(box(0.22, 0.025, 0.03, bezelMat, 0, 1.81, 0.1));
    // parameter cables
    g.add(tube(0.008, 0.5, MAT.rubber, -0.16, 1.35, 0.14));
    g.add(tube(0.008, 0.45, MAT.rubber, -0.09, 1.35, 0.14));
    g.add(tube(0.008, 0.4, MAT.rubber, -0.02, 1.35, 0.14));
    brandPlate(g, 'EDAN', 0.1, 0.03, 0, 1.44, 0.185, { color: '#5A6670', size: 54 });
    const lbl = makeLabel('Moniteur');
    lbl.position.set(0, 2.02, 0.05);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* 5. Pousse-seringues HawkMed HK-400 sur pied à perfusion */
  function buildSyringePump() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xF2F4F5, roughness: 0.42, metalness: 0.06 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x2F6FB0, roughness: 0.45, metalness: 0.2 });
    starBase(g, 5, 0.4, 0.028);
    addCasters(g, 0.38, 0.38, 0.05, 0.05);
    g.add(cyl(0.028, 0.028, 1.72, MAT.steel, 0, 0.88, 0, 16));
    // top crossbar + hooks + IV bags
    g.add(box(0.6, 0.03, 0.03, MAT.steel, 0, 1.76, 0));
    [-0.26, 0.26].forEach(function (dx) {
      g.add(box(0.018, 0.07, 0.018, MAT.steel, dx, 1.72, 0));
      g.add(box(0.17, 0.25, 0.05, MAT.glass, dx, 1.56, 0.02));
      g.add(tube(0.008, 0.42, MAT.glass, dx, 1.22, 0.05));
    });
    // two rack-mounted pumps (HK-400 : 4.5" screens, ±2%) — white housing, blue accent
    [1.26, 0.96].forEach(function (py) {
      g.add(roundedBox(0.3, 0.2, 0.15, 0.015, bodyMat, 0.02, py, 0.03));
      const s = makeScreenMesh(0.17, 0.09, 'pump');
      s.position.set(0.02, py + 0.04, 0.108);
      g.add(s);
      g.add(box(0.3, 0.02, 0.152, accentMat, 0.02, py - 0.04, 0.031));
      g.add(box(0.2, 0.03, 0.03, MAT.light, 0.02, py - 0.09, 0.07));
      const syr = cyl(0.015, 0.015, 0.13, MAT.glass, 0.02, py - 0.09, 0.07, 10);
      syr.rotation.z = Math.PI / 2; g.add(syr);
      for (let i = 0; i < 3; i++) {
        g.add(box(0.012, 0.012, 0.008, accentMat, 0.09 - i * 0.03, py - 0.12, 0.1));
      }
      g.add(box(0.05, 0.05, 0.05, MAT.dark, 0.02, py, -0.04));
    });
    // IV pole clamp
    g.add(box(0.08, 0.09, 0.08, accentMat, 0.02, 1.44, -0.01));
    brandPlate(g, 'HawkMed', 0.14, 0.026, 0.02, 1.16, 0.108, { color: '#2F6FB0', size: 44 });
    const lbl = makeLabel('Pousse-seringues');
    lbl.position.set(0, 2.0, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* 5b. Pousse-seringues Medrena (Unifusion SP50) sur pied à perfusion */
  function buildMedrenaSyringePump() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xF2F4F5, roughness: 0.42, metalness: 0.06 });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x1E8A4C, roughness: 0.4, metalness: 0.08 });
    // compact pole stand (Medrena mount)
    starBase(g, 5, 0.36, 0.026);
    addCasters(g, 0.34, 0.34, 0.05, 0.048);
    g.add(cyl(0.026, 0.026, 1.7, MAT.steel, 0, 0.86, 0, 14));
    // IV bag hook + bag + line
    g.add(box(0.16, 0.02, 0.02, MAT.steel, 0, 1.74, 0));
    g.add(box(0.16, 0.24, 0.05, MAT.glass, 0, 1.58, 0.02));
    g.add(tube(0.007, 0.44, MAT.glass, 0, 1.24, 0.05));
    // single syringe pump (SP50) — white housing, green LCD display
    const py = 1.22;
    g.add(roundedBox(0.3, 0.2, 0.16, 0.016, bodyMat, 0.02, py, 0.03));
    g.add(box(0.18, 0.1, 0.012, greenMat, 0.0, py + 0.035, 0.112));
    const s = makeScreenMesh(0.15, 0.075, 'pump');
    s.position.set(0.0, py + 0.035, 0.12);
    g.add(s);
    // control buttons (red / green / white) on the side
    g.add(cyl(0.011, 0.011, 0.012, MAT.red, 0.12, py + 0.05, 0.112, 12));
    g.add(cyl(0.011, 0.011, 0.012, greenMat, 0.12, py, 0.112, 12));
    g.add(cyl(0.011, 0.011, 0.012, MAT.white, 0.12, py - 0.05, 0.112, 12));
    // syringe cradle (horizontal) + plunger drive
    g.add(box(0.22, 0.03, 0.03, MAT.light, 0.0, py - 0.085, 0.075));
    const syr = cyl(0.014, 0.014, 0.14, MAT.glass, 0.0, py - 0.085, 0.075, 10);
    syr.rotation.z = Math.PI / 2; g.add(syr);
    g.add(box(0.03, 0.05, 0.04, MAT.dark, -0.11, py - 0.085, 0.075));
    g.add(tube(0.006, 0.34, MAT.glass, 0.1, py - 0.24, 0.09));
    // clamp
    g.add(box(0.08, 0.09, 0.08, bodyMat, 0.02, py + 0.14, -0.01));
    brandPlate(g, 'MedRena', 0.15, 0.026, 0.0, py - 0.11, 0.12, { color: '#1E8A4C', size: 40 });
    const lbl = makeLabel('Pousse-seringues');
    lbl.position.set(0, 1.98, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* 6. Ventilateur Hamilton C1 sur chariot — modèle OBJ importé + fallback procédural */
  let hamiltonProto = null;
  let lastHamiltonInfo = null;

  function hamiltonMaterialFor(name) {
    const M = THREE.MeshStandardMaterial;
    switch (name) {
      case 'gris_alu':             return new M({ color: 0xA9B2B8, roughness: 0.34, metalness: 0.62 });
      case 'gris_fonce':           return new M({ color: 0x4C565E, roughness: 0.5, metalness: 0.35 });
      case 'noir':                 return new M({ color: 0x1E2429, roughness: 0.6, metalness: 0.15 });
      case 'inox':                 return new M({ color: 0xB7C2C9, roughness: 0.3, metalness: 0.85 });
      case 'bleu_hamilton':        return new M({ color: 0x2E5C8A, roughness: 0.42, metalness: 0.25 });
      case 'plateau_noir':         return new M({ color: 0x23292E, roughness: 0.52, metalness: 0.2 });
      case 'plastique_blanc':      return new M({ color: 0xEFF2F4, roughness: 0.4, metalness: 0.06 });
      case 'ecran_humidificateur': return new M({ color: 0x0D1A24, roughness: 0.28, metalness: 0.05, emissive: 0x123C52, emissiveIntensity: 0.75 });
      case 'ecran_ventilateur':    return new M({ color: 0x0B1016, roughness: 0.25, metalness: 0.05 });
      case 'tuyau_bleu':           return new M({ color: 0x3E7CB0, roughness: 0.55, metalness: 0.04 });
      case 'tuyau_transparent':    return new M({ color: 0xCFE3EC, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.42 });
      case 'vert':                 return new M({ color: 0x2E9E63, roughness: 0.42, metalness: 0.15 });
      case 'ballon_gris':          return new M({ color: 0x8E979D, roughness: 0.85, metalness: 0.04 });
      default:                     return new M({ color: 0xDDD8D2, roughness: 0.55, metalness: 0.1 });
    }
  }

  function loadHamiltonModel(cb) {
    if (!THREE.OBJLoader) { cb(); return; }
    new THREE.OBJLoader().load(
      'assets/models/hamilton-c1.obj',
      function (obj) {
        const matCache = {};
        obj.traverse(function (o) {
          if (!o.isMesh) return;
          if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
          const pick = function (m) {
            const nm = (m && m.name) || 'default';
            if (!matCache[nm]) { const mat = hamiltonMaterialFor(nm); mat.name = nm; matCache[nm] = mat; }
            return matCache[nm];
          };
          o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material);
          o.castShadow = true; o.receiveShadow = true;
          o.userData.sharedModel = true;
          if (o.name === 'ventilateur_ecran') o.visible = false; // remplacé par un écran texturé
        });
        hamiltonProto = obj;
        cb();
      },
      undefined,
      function (err) {
        console.warn('Modèle 3D du ventilateur Hamilton C1 indisponible, fallback procédural.', err);
        cb();
      }
    );
  }

  function buildVentilatorFromOBJ() {
    const g = new THREE.Group();
    // OBJ déjà en mètres (0,88 × 1,60 × 0,60 m), chariot centré en 0, avant vers +Z.
    const model = hamiltonProto.clone(true);
    let meshCount = 0; const matNames = {}; let screenMesh = null;
    model.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.userData.sharedModel = true;
      meshCount++;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function (m) { if (m && m.name) matNames[m.name] = 1; });
      if (o.name === 'ventilateur_ecran') screenMesh = o;
    });

    // écran tactile texturé (l'OBJ n'a pas d'UV exploitables)
    if (screenMesh) {
      screenMesh.geometry.computeBoundingBox();
      const bb = screenMesh.geometry.boundingBox;
      const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y;
      const cx = (bb.max.x + bb.min.x) / 2, cy = (bb.max.y + bb.min.y) / 2;
      const scr = makeScreenMesh(w * 0.97, h * 0.97, 'vent');
      scr.position.set(cx, cy, bb.max.z + 0.0015);
      model.add(scr);
    }

    g.add(model);
    lastHamiltonInfo = { meshes: meshCount, materials: Object.keys(matNames).length };

    const lbl = makeLabel('Ventilateur');
    lbl.position.set(0, 1.72, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  function buildVentilator() {
    if (hamiltonProto) return buildVentilatorFromOBJ();
    const g = new THREE.Group();
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xF1F3F4, roughness: 0.4, metalness: 0.06 });
    // Hamilton trolley frame is blue-grey
    const trolleyMat = new THREE.MeshStandardMaterial({ color: 0x35506B, roughness: 0.5, metalness: 0.3 });
    // trolley base 630×630 mm
    g.add(roundedBox(0.54, 0.07, 0.54, 0.03, trolleyMat, 0, 0.06, 0));
    addCasters(g, 0.26, 0.26, 0.055, 0.055);
    // vertical column (blue) + top mount
    g.add(box(0.08, 1.2, 0.08, trolleyMat, 0, 0.72, -0.19));
    g.add(box(0.14, 0.04, 0.14, trolleyMat, 0, 1.32, -0.19));
    // lower basket shelf
    g.add(box(0.44, 0.025, 0.36, trolleyMat, 0, 0.34, -0.16));
    g.add(box(0.46, 0.02, 0.02, trolleyMat, 0, 0.16, -0.16));
    // main unit 310×210×245 mm — white ventilation unit
    const body = roundedBox(0.31, 0.27, 0.23, 0.025, whiteMat, 0, 1.12, -0.05);
    g.add(body);
    // 8.4" touchscreen (640×480) on the front
    g.add(box(0.24, 0.19, 0.02, MAT.dark, 0, 1.15, 0.062));
    const scr = makeScreenMesh(0.21, 0.16, 'vent');
    scr.position.set(0, 1.15, 0.075);
    g.add(scr);
    // alarm lamp strip above screen
    g.add(box(0.24, 0.02, 0.02, MAT.dark, 0, 1.28, 0.06));
    // control keys under the screen + P&T knob
    g.add(cyl(0.02, 0.02, 0.02, MAT.dark, 0.1, 1.02, 0.07, 14));
    for (let i = 0; i < 4; i++) g.add(box(0.025, 0.018, 0.012, MAT.light, -0.04 - i * 0.03, 1.02, 0.07));
    // front breathing ports + turbine air inlet
    g.add(cyl(0.024, 0.024, 0.05, MAT.light, 0.1, 1.0, 0.06, 12));
    g.add(cyl(0.03, 0.03, 0.02, MAT.dark, -0.09, 1.0, 0.075, 16));
    // humidifier chamber (H900) on a bracket, lower front
    g.add(cyl(0.07, 0.07, 0.14, MAT.glass, 0.15, 0.92, 0.12, 16));
    g.add(cyl(0.075, 0.075, 0.025, MAT.light, 0.15, 1.0, 0.12, 16));
    g.add(box(0.16, 0.02, 0.16, trolleyMat, 0.15, 0.84, 0.12));
    // breathing tubes
    g.add(tube(0.024, 0.5, MAT.glass, 0.13, 1.03, 0.3));
    g.add(tube(0.024, 0.46, MAT.glass, 0.01, 0.98, 0.32));
    // support arm + handle
    g.add(box(0.035, 0.035, 0.24, MAT.dark, 0.19, 1.12, -0.19));
    g.add(box(0.16, 0.025, 0.03, MAT.dark, 0, 1.34, -0.05));
    brandPlate(g, 'HAMILTON', 0.14, 0.03, 0, 0.92, 0.082, { color: '#3A4A56', size: 44 });
    const lbl = makeLabel('Ventilateur');
    lbl.position.set(0, 1.58, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* 6b. Ventilateur Hamilton C6 — modèle volumique complet (cotes constructeur)
     Chariot 640 × 560 × 1400 mm · unité de ventilation 360 × 250 × 394 mm
     Moniteur 17" 1920 × 1200, 423 × 250 × 415 mm avec support · 46 kg au total.
     L'écran utilise la photo réelle du C6 (assets/models/hamilton-c6-screen.jpg). */
  let lastC6Info = null;
  let c6ScreenTex = null;

  function c6ScreenTexture() {
    if (!c6ScreenTex) {
      c6ScreenTex = new THREE.TextureLoader().load('assets/models/hamilton-c6-screen.jpg');
      c6ScreenTex.encoding = THREE.sRGBEncoding;
      c6ScreenTex.anisotropy = 4;
    }
    return c6ScreenTex;
  }

  function buildVentilatorC6() {
    const g = new THREE.Group();
    const shellMat  = new THREE.MeshStandardMaterial({ color: 0x333A42, roughness: 0.46, metalness: 0.30 });
    const shell2Mat = new THREE.MeshStandardMaterial({ color: 0x232930, roughness: 0.52, metalness: 0.24 });
    const silverMat = new THREE.MeshStandardMaterial({ color: 0xB9C2C8, roughness: 0.34, metalness: 0.70 });
    const blueMat   = new THREE.MeshStandardMaterial({ color: 0x1F5E9C, roughness: 0.40, metalness: 0.28 });
    const rubberMat = new THREE.MeshStandardMaterial({ color: 0x14181C, roughness: 0.95, metalness: 0.02 });
    const matNames = ['coque', 'coque_foncee', 'aluminium', 'bleu', 'caoutchouc'];

    // ---- chariot : base 5 branches Ø 0,64 m, roulettes Ø 125 mm ----
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const arm = box(0.30, 0.045, 0.075, silverMat, Math.cos(a) * 0.15, 0.155, Math.sin(a) * 0.15);
      arm.rotation.y = -a;
      g.add(arm);
      // roulette Ø 125 mm (axe horizontal, fourche + pivot)
      const cw = new THREE.Group();
      cw.position.set(Math.cos(a) * 0.285, 0.0625, Math.sin(a) * 0.285);
      const wheel = cyl(0.0625, 0.0625, 0.032, rubberMat, 0, 0, 0, 18);
      wheel.rotation.z = Math.PI / 2;
      cw.add(wheel);
      const hub = cyl(0.024, 0.024, 0.036, silverMat, 0, 0, 0, 14);
      hub.rotation.z = Math.PI / 2;
      cw.add(hub);
      cw.add(box(0.03, 0.085, 0.045, silverMat, 0, 0.075, 0));
      cw.add(cyl(0.03, 0.03, 0.014, silverMat, 0, 0.122, 0, 14));
      g.add(cw);
    }
    g.add(cyl(0.075, 0.09, 0.10, silverMat, 0, 0.245, 0, 20));

    // ---- colonne + panier + tablette porte-unité ----
    g.add(box(0.095, 0.37, 0.095, shellMat, 0, 0.465, -0.135));   // 0,28 → 0,65 m
    g.add(box(0.10, 0.012, 0.10, blueMat, 0, 0.60, -0.135));       // liseré bleu
    // panier métallique (fond + 4 parois)
    g.add(roundedBox(0.40, 0.014, 0.30, 0.01, silverMat, 0, 0.315, -0.015));
    g.add(box(0.40, 0.11, 0.012, silverMat, 0, 0.372, 0.132));
    g.add(box(0.40, 0.11, 0.012, silverMat, 0, 0.372, -0.162));
    g.add(box(0.012, 0.11, 0.30, silverMat, -0.194, 0.372, -0.015));
    g.add(box(0.012, 0.11, 0.30, silverMat, 0.194, 0.372, -0.015));
    g.add(box(0.40, 0.014, 0.30, blueMat, 0, 0.428, -0.015));      // bord bleu du panier
    // tablette sous l'unité
    g.add(roundedBox(0.46, 0.028, 0.34, 0.01, silverMat, 0, 0.646, -0.01));

    // ---- unité de ventilation : 0,36 × 0,25 × 0,394 m, de 0,66 à 1,054 m ----
    const UW = 0.36, UD = 0.25, UH = 0.394;
    const uY = 0.66 + UH / 2;
    const uZ = 0.0;
    g.add(roundedBox(UW, UH, UD, 0.025, shellMat, 0, uY, uZ));
    // façade légèrement en retrait
    g.add(box(UW - 0.025, UH - 0.03, 0.012, shell2Mat, 0, uY, uZ + UD / 2 - 0.004));
    // liseré bleu supérieur
    g.add(box(UW - 0.03, 0.013, 0.008, blueMat, 0, 0.66 + UH - 0.035, uZ + UD / 2 + 0.002));
    // prises gaz (O₂ + Air) en bas à gauche
    const pO2 = cyl(0.022, 0.022, 0.035, silverMat, -0.105, 0.735, uZ + UD / 2 + 0.007, 16);
    pO2.rotation.x = Math.PI / 2; g.add(pO2);
    const pAir = cyl(0.018, 0.018, 0.035, shell2Mat, -0.055, 0.735, uZ + UD / 2 + 0.007, 16);
    pAir.rotation.x = Math.PI / 2; g.add(pAir);
    // valve expiratoire (blanche) + port inspiratoire (bleu)
    const pExp = cyl(0.034, 0.034, 0.05, MAT.light, 0.085, 0.895, uZ + UD / 2 + 0.012, 20);
    pExp.rotation.x = Math.PI / 2; g.add(pExp);
    const pIns = cyl(0.026, 0.026, 0.045, blueMat, 0.085, 0.795, uZ + UD / 2 + 0.012, 16);
    pIns.rotation.x = Math.PI / 2; g.add(pIns);
    // petit écran de contrôle secondaire
    g.add(box(0.105, 0.058, 0.008, MAT.dark, -0.10, 0.955, uZ + UD / 2 + 0.006));
    g.add(box(0.096, 0.049, 0.002, MAT.led, -0.10, 0.955, uZ + UD / 2 + 0.011));
    // molette + bouton d'alarme
    g.add(cyl(0.021, 0.021, 0.024, silverMat, 0.115, 0.995, uZ + UD / 2 + 0.011, 16));
    g.add(cyl(0.026, 0.026, 0.014, MAT.red, 0.115, 0.955, uZ + UD / 2 + 0.009, 16));
    // logo constructeur sur la façade
    brandPlate(g, 'HAMILTON MEDICAL', 0.165, 0.024, -0.005, 0.705, uZ + UD / 2 + 0.012, { color: '#D5DDE3', size: 44 });

    // ---- tablette support moniteur, posée sur l'unité ----
    g.add(roundedBox(0.44, 0.022, 0.27, 0.008, silverMat, 0, 1.065, 0.005));

    // ---- moniteur 17" : 0,423 × 0,278 × 0,052 m, incliné de 6° vers l'arrière ----
    const mon = new THREE.Group();
    mon.position.set(0, 1.076, 0.05);
    mon.rotation.x = -0.10;
    const MW = 0.423, MH = 0.278, MD = 0.052;
    mon.add(roundedBox(MW, MH, MD, 0.022, silverMat, 0, MH / 2, -0.006));           // coque arrière
    mon.add(box(MW - 0.008, MH - 0.008, 0.014, shell2Mat, 0, MH / 2, MD / 2 - 0.004)); // façade noire
    // dalle 17" 16:10 (366 × 229 mm)
    const scrMat = new THREE.MeshStandardMaterial({
      map: c6ScreenTexture(), roughness: 0.16, metalness: 0.04,
      emissive: 0xFFFFFF, emissiveMap: c6ScreenTexture(), emissiveIntensity: 0.28
    });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.366, 0.229), scrMat);
    scr.position.set(0, MH / 2 + 0.005, MD / 2 + 0.0035);
    mon.add(scr);
    // logo sous l'écran
    brandPlate(mon, 'HAMILTON MEDICAL', 0.145, 0.017, 0, 0.028, MD / 2 + 0.004, { color: '#AEB8C0', size: 40 });
    // poignée de transport
    mon.add(box(0.20, 0.024, 0.028, shell2Mat, 0, MH + 0.036, -0.022));
    mon.add(box(0.024, 0.048, 0.028, shell2Mat, -0.088, MH + 0.012, -0.022));
    mon.add(box(0.024, 0.048, 0.028, shell2Mat, 0.088, MH + 0.012, -0.022));
    g.add(mon);

    // ---- circuit respiratoire patient (tuyaux annelés bleus + pièce en Y) ----
    function hose(points, r) {
      const curve = new THREE.CatmullRomCurve3(points.map(function (p) {
        return new THREE.Vector3(p[0], p[1], p[2]);
      }));
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 26, r, 8, false), blueMat);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    }
    g.add(hose([[0.085, 0.80, 0.135], [0.20, 0.73, 0.26], [0.31, 0.80, 0.30], [0.27, 0.925, 0.25]], 0.019));
    g.add(hose([[0.085, 0.90, 0.135], [0.20, 0.98, 0.26], [0.31, 0.98, 0.30], [0.27, 0.925, 0.25]], 0.019));
    const yPiece = cyl(0.026, 0.026, 0.055, silverMat, 0.27, 0.905, 0.25, 14);
    yPiece.rotation.z = Math.PI / 2; g.add(yPiece);
    // ballon test / poumon de démonstration
    const lung = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), MAT.light);
    lung.scale.set(1, 1.25, 1);
    lung.position.set(0.27, 0.79, 0.25);
    lung.castShadow = true; g.add(lung);

    let meshes = 0;
    g.traverse(function (o) { if (o.isMesh) meshes++; });
    lastC6Info = { meshes: meshes, materials: matNames.length, volumetric: true };
    if (window.MAM3D) window.MAM3D.c6 = lastC6Info;

    const lbl = makeLabel('Ventilateur C6');
    lbl.position.set(0, 1.57, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* 6c. Ventilateur de secours Amoul T5 (transport/urgence, corps sombre + grand écran + accents vert/bleu) */
  function buildAmoulT5() {
    const g = new THREE.Group();
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1E2329, roughness: 0.42, metalness: 0.28 });
    const greyMat = new THREE.MeshStandardMaterial({ color: 0x8C979E, roughness: 0.42, metalness: 0.45 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x2C5C8F, roughness: 0.5, metalness: 0.25 });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x2E9E63, roughness: 0.45, metalness: 0.2 });
    // 5-branch roll base (transport trolley)
    starBase(g, 5, 0.3, 0.045);
    // vertical column
    g.add(box(0.085, 1.12, 0.085, darkMat, 0, 0.68, -0.18));
    g.add(box(0.14, 0.04, 0.14, greyMat, 0, 1.24, -0.18));
    // lower basket
    g.add(box(0.42, 0.025, 0.34, greyMat, 0, 0.32, -0.15));
    g.add(box(0.44, 0.02, 0.02, greyMat, 0, 0.15, -0.15));
    // main unit — wide dark housing (T5)
    g.add(roundedBox(0.42, 0.33, 0.29, 0.03, darkMat, 0, 1.14, -0.03));
    // large colour touchscreen with thin bezel
    g.add(box(0.37, 0.255, 0.015, MAT.dark, 0, 1.15, 0.116));
    const scr = makeScreenMesh(0.35, 0.235, 'vent');
    scr.position.set(0, 1.15, 0.125);
    g.add(scr);
    // green status LED bar + blue accent band at the base of the unit
    g.add(box(0.36, 0.014, 0.016, greenMat, 0, 1.295, 0.118));
    g.add(box(0.42, 0.035, 0.295, blueMat, 0, 0.965, -0.03));
    // control knob + 4 soft keys
    g.add(cyl(0.026, 0.026, 0.024, greyMat, 0.15, 1.0, 0.12, 16));
    for (let i = 0; i < 4; i++) g.add(box(0.028, 0.02, 0.012, MAT.light, -0.09 + i * 0.04, 1.0, 0.12));
    // breathing circuit ports (blue) + expiratory valve
    g.add(cyl(0.028, 0.028, 0.06, blueMat, 0.13, 0.98, 0.11, 14));
    g.add(cyl(0.022, 0.022, 0.05, MAT.light, -0.03, 0.98, 0.13, 12));
    // humidifier chamber on bracket
    g.add(cyl(0.07, 0.07, 0.14, MAT.glass, 0.17, 0.88, 0.13, 16));
    g.add(box(0.17, 0.02, 0.17, blueMat, 0.17, 0.8, 0.13));
    // breathing tubes (blue corrugated)
    g.add(tube(0.024, 0.5, blueMat, 0.15, 0.98, 0.31));
    g.add(tube(0.024, 0.46, blueMat, 0.02, 0.94, 0.33));
    // carry handle + O2 cylinder bracket
    g.add(box(0.22, 0.03, 0.035, greyMat, 0, 1.33, -0.03));
    g.add(box(0.03, 0.5, 0.03, greyMat, -0.22, 0.34, -0.15));
    g.add(cyl(0.055, 0.055, 0.42, MAT.o2, -0.22, 0.34, -0.15, 14));
    brandPlate(g, 'AMOUL T5', 0.2, 0.03, 0, 0.995, 0.122, { color: '#E6EEF4', size: 40 });
    const lbl = makeLabel('Ventilateur T5');
    lbl.position.set(0, 1.56, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* 7. Bistouri électrique sur chariot */
  function buildESU() {
    const g = new THREE.Group();
    // trolley (505×410 mm footprint)
    const legs = [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]];
    legs.forEach(function (p) {
      g.add(box(0.03, 0.72, 0.03, MAT.steel, p[0], 0.4, p[1]));
    });
    g.add(box(0.56, 0.03, 0.44, MAT.light, 0, 0.76, 0));
    g.add(box(0.52, 0.025, 0.4, MAT.light, 0, 0.3, 0));
    addCasters(g, 0.25, 0.2, 0.05, 0.045);
    // ESU unit (455×360×160 mm) — white housing with dark front panel & large screen
    g.add(box(0.46, 0.29, 0.36, MAT.white, 0, 0.93, 0));
    g.add(box(0.46, 0.02, 0.36, MAT.light, 0, 1.08, 0));
    g.add(box(0.42, 0.26, 0.01, MAT.dark, 0, 0.93, 0.181));
    // 7" touchscreen (large, as on the product photo)
    const scr = makeScreenMesh(0.3, 0.19, 'esu');
    scr.rotation.x = -0.15;
    scr.position.set(0, 1.0, 0.19);
    g.add(scr);
    // front output sockets (3 mono + bipolar)
    g.add(box(0.02, 0.06, 0.02, MAT.light, 0.16, 0.88, 0.19));
    g.add(box(0.02, 0.06, 0.02, MAT.light, 0.08, 0.88, 0.19));
    g.add(box(0.02, 0.06, 0.02, MAT.light, 0.0, 0.88, 0.19));
    g.add(box(0.02, 0.06, 0.02, MAT.light, -0.09, 0.88, 0.19));
    // power-knob dial
    g.add(cyl(0.022, 0.022, 0.02, MAT.light, 0.18, 0.85, 0.19, 14));
    // cable hangers on side
    g.add(box(0.03, 0.16, 0.05, MAT.dark, 0.245, 0.94, 0.06));
    const pencil = cyl(0.009, 0.009, 0.2, MAT.white, 0.245, 1.02, 0.06, 8);
    pencil.rotation.z = 0.3; g.add(pencil);
    g.add(tube(0.005, 0.5, MAT.rubber, 0.3, 0.72, 0.03));
    g.add(tube(0.005, 0.48, MAT.rubber, 0.3, 0.7, -0.04));
    // double foot pedal
    g.add(box(0.17, 0.04, 0.13, MAT.dark, -0.18, 0.025, 0.44));
    g.add(box(0.075, 0.02, 0.11, MAT.rubber, -0.22, 0.05, 0.44));
    g.add(box(0.075, 0.02, 0.11, MAT.rubber, -0.13, 0.05, 0.44));
    g.add(tube(0.005, 0.4, MAT.rubber, -0.12, 0.12, 0.36));
    const lbl = makeLabel('Bistouri électrique');
    lbl.position.set(0, 1.35, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* 8. Chariot d'anesthésie Saikang SKR-ET625 — modèle OBJ importé + fallback procédural */
  let saikangCartProto = null;
  let lastSaikangInfo = null;

  function saikangMaterialFor(name) {
    const M = THREE.MeshStandardMaterial;
    switch (name) {
      case 'abs_blanc':        return new M({ color: 0xEDF0F2, roughness: 0.4, metalness: 0.06 });
      case 'gris_roulette':    return new M({ color: 0x9AA4AC, roughness: 0.4, metalness: 0.5 });
      case 'noir':             return new M({ color: 0x1E2429, roughness: 0.62, metalness: 0.12 });
      case 'gris_clair':       return new M({ color: 0xC3CBD1, roughness: 0.45, metalness: 0.2 });
      case 'bleu_ciel':        return new M({ color: 0x3C8AC8, roughness: 0.42, metalness: 0.12 });
      case 'inox':             return new M({ color: 0xB7C2C9, roughness: 0.3, metalness: 0.85 });
      case 'jaune_bac':        return new M({ color: 0xE0B23C, roughness: 0.5, metalness: 0.05 });
      case 'couvercle_orange': return new M({ color: 0xE08030, roughness: 0.5, metalness: 0.05 });
      case 'panier_translucide': return new M({ color: 0xDCE8EE, roughness: 0.2, metalness: 0.04, transparent: true, opacity: 0.4 });
      default:                 return new M({ color: 0xDDD8D2, roughness: 0.55, metalness: 0.1 });
    }
  }

  function loadSaikangCartModel(cb) {
    if (!THREE.OBJLoader) { cb(); return; }
    new THREE.OBJLoader().load(
      'assets/models/saikang-skr-et625.obj',
      function (obj) {
        const matCache = {};
        obj.traverse(function (o) {
          if (!o.isMesh) return;
          if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
          const pick = function (m) {
            const nm = (m && m.name) || 'default';
            if (!matCache[nm]) { const mat = saikangMaterialFor(nm); mat.name = nm; matCache[nm] = mat; }
            return matCache[nm];
          };
          o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material);
          o.castShadow = true; o.receiveShadow = true;
          o.userData.sharedModel = true;
        });
        saikangCartProto = obj;
        cb();
      },
      undefined,
      function (err) {
        console.warn('Modèle 3D du chariot Saikang SKR-ET625 indisponible, fallback procédural.', err);
        cb();
      }
    );
  }

  function buildAnesthesiaTrolleyFromOBJ() {
    const g = new THREE.Group();
    // OBJ déjà en mètres (1,05 × 1,53 × 0,54 m), corps centré en 0, avant vers +Z.
    const model = saikangCartProto.clone(true);
    let meshCount = 0; const matNames = {};
    model.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.userData.sharedModel = true;
      meshCount++;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function (m) { if (m && m.name) matNames[m.name] = 1; });
    });
    g.add(model);
    lastSaikangInfo = { meshes: meshCount, materials: Object.keys(matNames).length };

    const lbl = makeLabel("Chariot d'anesthésie");
    lbl.position.set(0, 1.66, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  function buildAnesthesiaTrolley() {
    if (saikangCartProto) return buildAnesthesiaTrolleyFromOBJ();
    const g = new THREE.Group();
    // Saikang SKR-ET625 : blue ABS drawer cabinet with white worktop
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x2C5FA8, roughness: 0.5, metalness: 0.12 });
    const blueDark = new THREE.MeshStandardMaterial({ color: 0x224C89, roughness: 0.55, metalness: 0.12 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xEDEFF1, roughness: 0.42, metalness: 0.06 });
    // 4 posts (light grey)
    const legs = [[-0.3, -0.23], [0.3, -0.23], [-0.3, 0.23], [0.3, 0.23]];
    legs.forEach(function (p) { g.add(box(0.03, 0.86, 0.03, MAT.light, p[0], 0.47, p[1])); });
    // top work surface (white) + rails
    g.add(box(0.62, 0.035, 0.48, whiteMat, 0, 0.9, 0));
    g.add(box(0.62, 0.05, 0.02, MAT.steel, 0, 0.91, 0.24));
    g.add(box(0.62, 0.05, 0.02, MAT.steel, 0, 0.91, -0.24));
    // side rails
    g.add(box(0.02, 0.05, 0.48, MAT.steel, 0.31, 0.91, 0));
    g.add(box(0.02, 0.05, 0.48, MAT.steel, -0.31, 0.91, 0));
    // 5-drawer blue cabinet body
    g.add(box(0.5, 0.5, 0.4, blueMat, 0, 0.62, 0));
    for (let i = 0; i < 5; i++) {
      const dy = 0.85 - i * 0.1;
      g.add(box(0.47, 0.086, 0.01, blueDark, 0, dy - 0.028, 0.203));
      g.add(box(0.14, 0.016, 0.016, MAT.steel, 0, dy - 0.022, 0.212));
    }
    // lower shelf
    g.add(box(0.56, 0.025, 0.44, whiteMat, 0, 0.32, 0));
    // push handle
    g.add(box(0.5, 0.03, 0.03, MAT.steel, 0, 1.0, -0.26));
    g.add(box(0.03, 0.11, 0.03, MAT.steel, -0.24, 0.94, -0.26));
    g.add(box(0.03, 0.11, 0.03, MAT.steel, 0.24, 0.94, -0.26));
    // 4" casters
    addCasters(g, 0.3, 0.23, 0.05, 0.05);
    // supplies on top
    g.add(box(0.14, 0.09, 0.11, blueMat, 0.18, 0.965, 0.06));
    g.add(cyl(0.04, 0.04, 0.13, MAT.glass, -0.2, 0.98, 0.06, 12));
    g.add(box(0.1, 0.1, 0.08, whiteMat, 0.02, 0.6, 0.12));
    brandPlate(g, 'Saikang', 0.2, 0.03, 0, 0.55, 0.203, { color: '#EDEFF1', size: 48 });
    const lbl = makeLabel("Chariot d'anesthésie");
    lbl.position.set(0, 1.28, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* 9. Chariot d'instruments stérile (plateau chirurgical inox) — modèle OBJ + fallback */
  let inoxTrolleyProto = null;
  let lastInoxInfo = null;

  function inoxMaterialFor(name) {
    const M = THREE.MeshStandardMaterial;
    switch (name) {
      case 'inox_poli':            return new M({ color: 0xC5CED4, roughness: 0.18, metalness: 0.9 });
      case 'inox_brosse':          return new M({ color: 0xB3BDC4, roughness: 0.36, metalness: 0.85 });
      case 'capuchon_noir':        return new M({ color: 0x1E2429, roughness: 0.6, metalness: 0.1 });
      case 'plastique_blanc_casse':return new M({ color: 0xDCD5C9, roughness: 0.5, metalness: 0.06 });
      case 'caoutchouc_noir':      return new M({ color: 0x1A1E22, roughness: 0.95, metalness: 0.02 });
      case 'gris_roulette':        return new M({ color: 0x9AA4AC, roughness: 0.4, metalness: 0.45 });
      default:                     return new M({ color: 0xDDD8D2, roughness: 0.55, metalness: 0.1 });
    }
  }

  function loadInstrumentTrolleyModel(cb) {
    if (!THREE.OBJLoader) { cb(); return; }
    new THREE.OBJLoader().load(
      'assets/models/chariot-inox-2-plateaux.obj',
      function (obj) {
        const matCache = {};
        obj.traverse(function (o) {
          if (!o.isMesh) return;
          if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
          const pick = function (m) {
            const nm = (m && m.name) || 'default';
            if (!matCache[nm]) { const mat = inoxMaterialFor(nm); mat.name = nm; matCache[nm] = mat; }
            return matCache[nm];
          };
          o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material);
          o.castShadow = true; o.receiveShadow = true;
          o.userData.sharedModel = true;
        });
        inoxTrolleyProto = obj;
        cb();
      },
      undefined,
      function (err) {
        console.warn('Modèle 3D du plateau chirurgical indisponible, fallback procédural.', err);
        cb();
      }
    );
  }

  function buildInstrumentTrolleyFromOBJ() {
    const g = new THREE.Group();
    // OBJ déjà en mètres (0,78 × 0,91 × 0,50 m), centré en 0, plateau haut à 0,74 m.
    const model = inoxTrolleyProto.clone(true);
    let meshCount = 0; const matNames = {};
    model.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.userData.sharedModel = true;
      meshCount++;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function (m) { if (m && m.name) matNames[m.name] = 1; });
    });
    g.add(model);
    lastInoxInfo = { meshes: meshCount, materials: Object.keys(matNames).length };

    const lbl = makeLabel("Chariot d'instruments");
    lbl.position.set(0, 1.08, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  function buildInstrumentTrolley() {
    if (inoxTrolleyProto) return buildInstrumentTrolleyFromOBJ();
    const g = new THREE.Group();
    const legs = [[-0.3, -0.24], [0.3, -0.24], [-0.3, 0.24], [0.3, 0.24]];
    legs.forEach(function (p) { g.add(box(0.025, 0.84, 0.025, MAT.steel, p[0], 0.45, p[1])); });
    // top stainless tray with lip
    g.add(box(0.68, 0.03, 0.52, MAT.steel, 0, 0.87, 0));
    g.add(box(0.68, 0.05, 0.02, MAT.steel, 0, 0.89, 0.25));
    g.add(box(0.68, 0.05, 0.02, MAT.steel, 0, 0.89, -0.25));
    g.add(box(0.02, 0.05, 0.52, MAT.steel, 0.33, 0.89, 0));
    g.add(box(0.02, 0.05, 0.52, MAT.steel, -0.33, 0.89, 0));
    // lower shelf
    g.add(box(0.58, 0.025, 0.44, MAT.light, 0, 0.34, 0));
    // sterile drape + instrument tray
    g.add(box(0.56, 0.01, 0.44, MAT.green, 0, 0.885, 0));
    g.add(box(0.44, 0.02, 0.34, MAT.light, 0, 0.897, 0));
    const inst = [[-0.12, 0.02, 0.24], [-0.05, 0.01, 0.2], [0.02, 0.015, 0.22], [0.09, 0.012, 0.18], [0.15, 0.02, 0.16]];
    inst.forEach(function (p) {
      g.add(box(p[1], 0.008, p[2], MAT.steel, p[0], 0.91, 0));
    });
    // clamp + basin
    g.add(cyl(0.05, 0.045, 0.04, MAT.steel, 0.22, 0.915, -0.14, 14));
    addCasters(g, 0.3, 0.24, 0.05, 0.045);
    const lbl = makeLabel("Chariot d'instruments");
    lbl.position.set(0, 1.2, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* 10. Table de connexion / transfert Saikang SKB041 — modèle OBJ + correction roues + fallback */
  let connTableProto = null;
  let lastConnInfo = null;

  function connMaterialFor(name) {
    const M = THREE.MeshStandardMaterial;
    switch (name) {
      case 'abs_blanc':          return new M({ color: 0xEEF1F3, roughness: 0.42, metalness: 0.06 });
      case 'logo_saikang':       return new M({ color: 0x2C5C8F, roughness: 0.4, metalness: 0.2 });
      case 'rouge_urgence':      return new M({ color: 0x7A1E18, roughness: 0.5, emissive: 0xC8241A, emissiveIntensity: 0.85 });
      case 'pneu_gris':          return new M({ color: 0x5C646A, roughness: 0.98, metalness: 0.02 });
      case 'gris_butoir':        return new M({ color: 0x8E979D, roughness: 0.45, metalness: 0.35 });
      case 'noir_caoutchouc':    return new M({ color: 0x1A1E22, roughness: 0.95, metalness: 0.02 });
      case 'plateau_gris':       return new M({ color: 0xB9C2C8, roughness: 0.48, metalness: 0.18 });
      case 'matelas_bleu_marine':return new M({ color: 0x264C7A, roughness: 0.88, metalness: 0.03 });
      case 'lisse_bronze':       return new M({ color: 0xB9A07D, roughness: 0.52, metalness: 0.38 });
      case 'inox':               return new M({ color: 0xB7C2C9, roughness: 0.32, metalness: 0.84 });
      case 'bleu_clair_potence': return new M({ color: 0x3E7CB0, roughness: 0.42, metalness: 0.22 });
      default:                   return new M({ color: 0xDDD8D2, roughness: 0.55, metalness: 0.1 });
    }
  }

  // Les 4 roues de ce fichier sont exportées couchées (disque dans le plan XZ, 4 cm d'épaisseur
  // en Y) : on les redresse de 90° autour de leur propre centre pour qu'elles touchent le sol.
  function fixCasterGeometry(geo) {
    if (!geo || !geo.attributes || !geo.attributes.position) return;
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    geo.translate(-c.x, -c.y, -c.z);
    geo.rotateX(Math.PI / 2);
    geo.translate(c.x, c.y, c.z);
    geo.computeVertexNormals();
  }

  function loadConnectionTableModel(cb) {
    if (!THREE.OBJLoader) { cb(); return; }
    new THREE.OBJLoader().load(
      'assets/models/saikang-skb041.obj',
      function (obj) {
        const matCache = {};
        obj.traverse(function (o) {
          if (!o.isMesh) return;
          if (o.name && /^roue_[0-9]+_(pneu|jante|capuchon)$/.test(o.name)) fixCasterGeometry(o.geometry);
          if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
          const pick = function (m) {
            const nm = (m && m.name) || 'default';
            if (!matCache[nm]) { const mat = connMaterialFor(nm); mat.name = nm; matCache[nm] = mat; }
            return matCache[nm];
          };
          o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material);
          o.castShadow = true; o.receiveShadow = true;
          o.userData.sharedModel = true;
        });
        connTableProto = obj;
        cb();
      },
      undefined,
      function (err) {
        console.warn('Modèle 3D de la table de connexion indisponible, fallback procédural.', err);
        cb();
      }
    );
  }

  function buildConnectionTableFromOBJ() {
    const g = new THREE.Group();
    // OBJ déjà en mètres (2,22 × 1,84 × 0,75 m), centré en 0, matelas à 0,775 m, avant vers +Z.
    const model = connTableProto.clone(true);
    let meshCount = 0; const matNames = {};
    model.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.userData.sharedModel = true;
      meshCount++;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function (m) { if (m && m.name) matNames[m.name] = 1; });
    });
    g.add(model);
    lastConnInfo = { meshes: meshCount, materials: Object.keys(matNames).length };

    const lbl = makeLabel('Table de connexion');
    lbl.position.set(0, 2.02, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  function buildConnectionTable() {
    if (connTableProto) return buildConnectionTableFromOBJ();
    const g = new THREE.Group();
    // mattress top (1910×640 mm, height 650–960)
    g.add(box(0.66, 0.1, 1.85, MAT.mattress, 0, 0.88, 0));
    g.add(box(0.72, 0.06, 1.9, MAT.light, 0, 0.8, 0));
    // side rails
    [-1, 1].forEach(function (s) {
      const rail = cyl(0.02, 0.02, 1.68, MAT.steel, s * 0.37, 0.94, 0, 10);
      rail.rotation.x = Math.PI / 2; g.add(rail);
    });
    // frame
    g.add(box(0.6, 0.06, 1.66, MAT.light, 0, 0.46, 0));
    // scissor lift arms
    [[-0.24, 0.62], [0.24, 0.62], [-0.24, -0.62], [0.24, -0.62]].forEach(function (p) {
      const arm = box(0.04, 0.4, 0.04, MAT.steel, p[0], 0.62, p[1] * 0.5);
      arm.rotation.x = p[1] > 0 ? 0.3 : -0.3; g.add(arm);
    });
    // hydraulic column + pump pedal
    g.add(cyl(0.07, 0.07, 0.4, MAT.steel, 0, 0.62, 0, 14));
    g.add(box(0.1, 0.04, 0.14, MAT.dark, 0.0, 0.1, 0.85));
    // base with 8" casters
    g.add(box(0.5, 0.07, 1.4, MAT.dark, 0, 0.09, 0));
    addCasters(g, 0.22, 0.62, 0.06, 0.06);
    const lbl = makeLabel('Table de connexion');
    lbl.position.set(0, 1.25, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  function legsAt(g, hx, hz, h) {
    [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]].forEach(function (p) {
      g.add(box(0.035, h, 0.035, MAT.steel, p[0], h / 2, p[1]));
    });
  }

  /* 11. Aspirateur de mucosités (2 bocaux) — modèle OBJ importé + fallback procédural */
  let suctionProto = null;
  let lastSuctionInfo = null;
  let _gaugeTex = null;

  function gaugeTexture() {
    if (_gaugeTex) return _gaugeTex;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#F4F7F8';
    x.beginPath(); x.arc(128, 128, 126, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#2E3A42'; x.lineWidth = 3;
    x.beginPath(); x.arc(128, 128, 112, 0, Math.PI * 2); x.stroke();
    // graduations -100..0 kPa sur 240°
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI * 0.75 + (i / 20) * Math.PI * 1.5;
      const long = i % 5 === 0;
      x.strokeStyle = '#22303A';
      x.lineWidth = long ? 5 : 2.5;
      x.beginPath();
      x.moveTo(128 + Math.cos(a) * (long ? 74 : 88), 128 + Math.sin(a) * (long ? 74 : 88));
      x.lineTo(128 + Math.cos(a) * 104, 128 + Math.sin(a) * 104);
      x.stroke();
    }
    // aiguille vers -60 kPa
    const ang = Math.PI * 0.75 + (12 / 20) * Math.PI * 1.5;
    x.strokeStyle = '#C0392B'; x.lineWidth = 6;
    x.beginPath(); x.moveTo(128, 128);
    x.lineTo(128 + Math.cos(ang) * 92, 128 + Math.sin(ang) * 92); x.stroke();
    x.fillStyle = '#22303A';
    x.beginPath(); x.arc(128, 128, 9, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#4A5A64'; x.font = 'bold 22px Segoe UI, Arial'; x.textAlign = 'center';
    x.fillText('kPa', 128, 196);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    _gaugeTex = tex;
    return tex;
  }

  function suctionMaterialFor(name) {
    const M = THREE.MeshStandardMaterial;
    switch (name) {
      case 'abs_blanc_gris':   return new M({ color: 0xDDE2E5, roughness: 0.45, metalness: 0.08 });
      case 'bandeau_bleu':     return new M({ color: 0x2E6FB0, roughness: 0.42, metalness: 0.15 });
      case 'noir':             return new M({ color: 0x1C2228, roughness: 0.6, metalness: 0.12 });
      case 'panneau_avant':    return new M({ color: 0x47525A, roughness: 0.5, metalness: 0.2 });
      case 'inox':             return new M({ color: 0xB7C2C9, roughness: 0.3, metalness: 0.85 });
      case 'cadran_manometre': return new M({ color: 0xFFFFFF, roughness: 0.35, metalness: 0.05, map: gaugeTexture() });
      case 'bouton_gris':      return new M({ color: 0x5A646C, roughness: 0.45, metalness: 0.3 });
      case 'interrupteur_vert':return new M({ color: 0x2E9E63, roughness: 0.4, emissive: 0x14603A, emissiveIntensity: 0.5 });
      case 'montant_gris':     return new M({ color: 0x8E979D, roughness: 0.45, metalness: 0.35 });
      case 'support_blanc':    return new M({ color: 0xEDF0F2, roughness: 0.42, metalness: 0.06 });
      case 'verre_bocal':      return new M({ color: 0xD3E6EE, roughness: 0.1, metalness: 0.04, transparent: true, opacity: 0.32 });
      case 'graduation_blanche': return new M({ color: 0xF6F8F9, roughness: 0.5, metalness: 0.02 });
      case 'couvercle_alu':    return new M({ color: 0xAEB8BF, roughness: 0.35, metalness: 0.7 });
      case 'tuyau_transparent':return new M({ color: 0xCFE3EC, roughness: 0.18, metalness: 0.04, transparent: true, opacity: 0.5 });
      default:                 return new M({ color: 0xDDD8D2, roughness: 0.55, metalness: 0.1 });
    }
  }

  function loadSuctionModel(cb) {
    if (!THREE.OBJLoader) { cb(); return; }
    new THREE.OBJLoader().load(
      'assets/models/aspirateur-mucosites.obj',
      function (obj) {
        const matCache = {};
        obj.traverse(function (o) {
          if (!o.isMesh) return;
          if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
          const pick = function (m) {
            const nm = (m && m.name) || 'default';
            if (!matCache[nm]) { const mat = suctionMaterialFor(nm); mat.name = nm; matCache[nm] = mat; }
            return matCache[nm];
          };
          o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material);
          o.castShadow = true; o.receiveShadow = true;
          o.userData.sharedModel = true;
        });
        suctionProto = obj;
        cb();
      },
      undefined,
      function (err) {
        console.warn('Modèle 3D de l\'aspirateur indisponible, fallback procédural.', err);
        cb();
      }
    );
  }

  function buildSuctionFromOBJ() {
    const g = new THREE.Group();
    // OBJ déjà en mètres (0,34 × 0,76 × 0,32 m), posé au sol, avant (+ panneau/manomètre) vers +Z.
    const model = suctionProto.clone(true);
    let meshCount = 0; const matNames = {};
    model.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.userData.sharedModel = true;
      meshCount++;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function (m) { if (m && m.name) matNames[m.name] = 1; });
    });
    g.add(model);
    lastSuctionInfo = { meshes: meshCount, materials: Object.keys(matNames).length };

    const lbl = makeLabel('Aspirateur');
    lbl.position.set(0, 0.92, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  function buildSuction() {
    if (suctionProto) return buildSuctionFromOBJ();
    const g = new THREE.Group();
    // 5-caster trolley (470×580 mm)
    starBase(g, 5, 0.32, 0.03);
    addCasters(g, 0.3, 0.3, 0.05, 0.05);
    g.add(cyl(0.03, 0.03, 1.02, MAT.steel, 0, 0.54, 0, 14));
    // pump/regulator housing on top
    const body = roundedBox(0.34, 0.2, 0.26, 0.025, MAT.white, 0, 1.12, 0);
    g.add(body);
    // vacuum gauge
    g.add(cyl(0.035, 0.035, 0.02, MAT.light, -0.1, 1.18, 0.135, 16));
    g.add(cyl(0.028, 0.028, 0.015, MAT.dark, -0.1, 1.19, 0.145, 16));
    // regulator knob + switch
    g.add(cyl(0.022, 0.022, 0.03, MAT.dark, 0.1, 1.16, 0.135, 14));
    g.add(box(0.02, 0.02, 0.015, MAT.red, 0.13, 1.06, 0.135));
    // jar holder basket
    g.add(box(0.36, 0.02, 0.26, MAT.steel, 0, 0.86, 0.02));
    // two 2 L jars with lids
    [-0.11, 0.11].forEach(function (dx) {
      g.add(cyl(0.085, 0.085, 0.26, MAT.glass, dx, 0.99, 0.02, 18));
      g.add(cyl(0.09, 0.09, 0.035, MAT.white, dx, 1.13, 0.02, 18));
      g.add(cyl(0.09, 0.09, 0.03, MAT.white, dx, 0.85, 0.02, 18));
      // overflow valve + connector
      g.add(cyl(0.02, 0.02, 0.03, MAT.light, dx, 1.16, 0.02, 10));
    });
    // connecting tubing 8×14 mm
    g.add(tube(0.012, 0.42, MAT.glass, -0.11, 1.28, 0.06));
    g.add(tube(0.012, 0.4, MAT.glass, 0.0, 1.28, 0.08));
    g.add(tube(0.012, 0.3, MAT.rubber, 0.12, 1.24, 0.02));
    // foot switch
    g.add(box(0.13, 0.035, 0.1, MAT.dark, 0.22, 0.02, 0.22));
    const lbl = makeLabel('Aspirateur');
    lbl.position.set(0, 1.5, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* ----------------------------------------------------------
     EQUIPMENT PLACEMENT + FICHES
     ---------------------------------------------------------- */
  const ITEMS = [
    {
      id: 'table', build: buildOperatingTable, pos: [0, 0, 0], rot: 0,
      cam: [2.0, 1.7, 2.5], look: [0, 0.85, 0],
      wp: {
        title: 'Table opératoire', model: 'Infimed Vivax Max',
        desc: "Table opératoire multipositions pour tous types d'interventions chirurgicales. Plateforme stable, positionnement précis et accès optimal au patient.",
        specs: ['Positions : trendelenburg, reverse, jackknife', 'Charge utile jusqu\'à 250 kg', 'Plateau radiotransparent', 'Commande à distance + pédale', '4 rails d\'accessoires latéraux', 'Hauteur : 700–1100 mm', 'Plateau : 2000 × 520 mm', 'Batterie rechargeable 22 V']
      }
    },
    {
      id: 'scialy', build: buildScialytique, pos: [0, 0, 0], rot: 0,
      cam: [1.8, 1.8, 2.2], look: [0, 2.15, -1.2],
      wp: {
        title: 'Scialytique', model: 'Infimed — lampe chirurgicale',
        desc: "Éclairage opératoire haute intensité, sans ombre, température de couleur naturelle. Bras articulé pour un accès optimal au champ.",
        specs: ['Intensité > 160 000 lux (à 1 m)', 'Température de couleur 4 300 K', 'IRC > 95', 'Télémègre > 1 400 mm', 'Champ éclairé 180–300 mm', 'Bras articulé multipoints', 'Commande tactile intégrée', 'LED > 50 000 h']
      }
    },
    {
      id: 'anesth', build: buildAnesthesiaMachine, pos: [-2.35, 0, -0.55], rot: Math.PI / 2,
      cam: [-0.55, 1.6, 0.75], look: [-2.35, 1.0, -0.55],
      wp: {
        title: "Machine d'anesthésie", model: 'Superstar S6200A',
        desc: "Station d'anesthésie complète : ventilation, vaporisation et monitorage intégré. Distribue précisément les gaz tout en ventilant le patient.",
        specs: ['Ventilation volume + pression', '3 vaporisateurs (sévo/des/iso)', 'Écran tactile 10,4"', 'Circuit clos + ouvert', 'Débit gaz frais 0,5–15 L/min', 'Pmax 70 cmH₂O', 'Sécurité anti-hypoxie FiO₂ > 25%', 'Monitoring ECG, SpO₂, NIBP, EtCO₂']
      }
    },
    {
      id: 'monitor', build: buildMonitor, pos: [-2.35, 0, -1.55], rot: Math.PI / 2,
      cam: [-0.8, 1.65, -1.5], look: [-2.35, 1.4, -1.45],
      wp: {
        title: 'Moniteur multiparamétrique', model: 'EDAN Elite V',
        desc: "Surveillance en temps réel des constantes vitales sous anesthésie. Alarmes intelligentes et courbes haute résolution.",
        specs: ['ECG 12 dérivations', 'SpO₂ Nellcor / Masimo', 'NIBP 30–270 mmHg', 'EtCO₂ main-stream / sidestream', '2 sondes de température', 'Écran 12,1" TFT couleur', 'Mémoire > 240 h', 'Wi-Fi, Ethernet, USB']
      }
    },
    {
      id: 'pumps', build: buildSyringePump, pos: [-2.05, 0, 0.55], rot: Math.PI / 2,
      cam: [-0.85, 1.6, 0.95], look: [-2.05, 1.15, 0.55],
      wp: {
        title: 'Pousse-seringues', model: 'HawkMed HK-400 III · Medrena',
        desc: "Injection volumétrique précise des médicaments anesthésiques et analgésiques, sur pied à perfusion avec poche IV.",
        specs: ['Débit 0,1–1 200 mL/h', 'Modes volume, poids, µg/kg/min', 'Seringues 20/30/50/60 mL', 'Batterie > 6 h', 'Anti-occlusion + purge air', 'Écran LCD rétroéclairé', 'Alarmes multi-niveaux', 'CE · ISO 60601-1']
      }
    },
    {
      id: 'vent', build: buildVentilator, pos: [-2.75, 0, -2.2], rot: Math.PI / 2,
      cam: [-0.9, 1.7, -1.8], look: [-2.75, 1.1, -2.2],
      wp: {
        title: 'Ventilateur de réanimation', model: 'Hamilton C1',
        desc: "Ventilateur polyvalent soins intensifs et transport. Modes invasifs et non invasifs, adulte, pédiatrie, néonatologie.",
        specs: ['Turbine sans air comprimé', 'Modes VCV, PCV, PSV, SIMV, NIV, CPAP', 'Volume courant 2–2 500 mL', 'Fréquence 1–150 bpm', 'FiO₂ 21–100%', 'Écran tactile 12"', 'Monitoring Paw, Vt, débit, EtCO₂', 'Batterie > 5 h · EN 1789']
      }
    },
    {
      id: 'esu', build: buildESU, pos: [2.05, 0, -0.6], rot: -Math.PI / 2,
      cam: [0.85, 1.45, 0.55], look: [2.05, 0.95, -0.6],
      wp: {
        title: 'Bistouri électrique', model: "Générateur d'électrochirurgie",
        desc: "Générateur d'électrochirurgie pour coupe, coagulation et dissection. Modes monopolaire et bipolaire, sécurité patient intégrée.",
        specs: ['Modes coupe / coagulation / blend', 'Monopolaire 1–250 W', 'Bipolaire 1–120 W', 'Détection automatique d\'impédance', 'REM (contrôle électrode retour)', 'Smart electrode auto-détection', 'Écran LCD 5,7"', 'CE · IEC 60601-2-2']
      }
    },
    {
      id: 'anestTrol', build: buildAnesthesiaTrolley, pos: [-2.95, 0, 1.75], rot: Math.PI / 2,
      cam: [-1.15, 1.62, 2.95], look: [-2.96, 0.82, 1.85],
      wp: {
        title: "Chariot d'anesthésie", model: 'Saikang SKR-ET625',
        desc: "Chariot multiposte pour l'anesthésiste : médicaments, matériel de voie aérienne et accessoires. Structure inox stable.",
        specs: ['3 étagères inox 304', 'Dimensions 680 × 500 × 900 mm', 'Tiroir central sécurisé', 'Poignée ergonomique', '4 roulettes 360° + freins', 'Charge utile 80 kg', 'Inox soudé haute résistance', 'CE · ISO 13485']
      }
    },
    {
      id: 'instrTrol', build: buildInstrumentTrolley, pos: [1.75, 0, 0.85], rot: -Math.PI / 3,
      cam: [0.7, 1.5, 2.2], look: [1.75, 0.6, 0.85],
      wp: {
        title: "Chariot d'instruments", model: 'Saikang — plateau chirurgical',
        desc: "Présentation stérile des instruments au champ opératoire. Hauteur réglable, plateau inox, roulettes à frein.",
        specs: ['Plateau inox 304 anti-bactérien', 'Plateau 500 × 400 mm', 'Hauteur 800–1000 mm', 'Roulettes 360° silencieuses', 'Étagère inférieure', 'Charge utile 50 kg', 'Compatible autoclave', 'CE · ISO 13485']
      }
    },
    {
      id: 'connTable', build: buildConnectionTable, pos: [0, 0, 2.3], rot: 0,
      cam: [1.95, 1.62, 0.85], look: [0, 0.8, 2.3],
      wp: {
        title: 'Table de connexion', model: 'Saikang SKB041',
        desc: "Table de transfert pour le passage sécurisé du patient entre brancard et table opératoire. Hauteur ajustable, base stable.",
        specs: ['Plateau matelassé antidérapant', 'Dimensions 1950 × 600 mm', 'Hauteur 700–950 mm', '4 roulettes avec freins', 'Compatible table standard', 'Charge utile 200 kg', 'Structure acier inox', 'CE · ISO 13485']
      }
    },
    {
      id: 'suction', build: buildSuction, pos: [1.0, 0, -1.8], rot: -Math.PI / 4,
      cam: [1.85, 1.1, -1.2], look: [1.0, 0.42, -1.8],
      wp: {
        title: 'Aspirateur à mucosités', model: 'Aspiration chirurgicale',
        desc: "Aspiration des liquides, mucosités et fumées pendant l'intervention. Régulation du vide, pot collecteur stérilisable.",
        specs: ['Débit > 40 L/min', 'Vide 0–0,8 bar réglable', 'Pot collecteur 1–2 L', 'Filtre antibactérien', 'Compatible fumée électrochirurgicale', 'Bruit < 52 dB(A)', 'Alimentation 220–240 V', 'CE · ISO 10079-1']
      }
    }
  ];

  /* ==========================================================
     SALLE 2 — ANESTHÉSIE-RÉANIMATION (builders)
     ========================================================== */

  /* Lit médicalisé électrique Saikang D8D — modèle OBJ importé + repli procédural */
  let bedD8DProto = null;
  let lastBedD8DInfo = null;

  function bedD8DMaterialFor(name) {
    const M = THREE.MeshStandardMaterial;
    switch (name) {
      case 'abs_blanc':     return new M({ color: 0xEDF0F2, roughness: 0.42, metalness: 0.08 });
      case 'logo_saikang':  return new M({ color: 0x2C5C8F, roughness: 0.4, metalness: 0.2 });
      case 'pneu_gris':     return new M({ color: 0x5C646A, roughness: 0.95, metalness: 0.02 });
      case 'pedale_rouge':  return new M({ color: 0xB8352A, roughness: 0.5, metalness: 0.08 });
      case 'pedale_verte':  return new M({ color: 0x2E9E63, roughness: 0.5, metalness: 0.08 });
      case 'moteur_gris':   return new M({ color: 0x4A545C, roughness: 0.5, metalness: 0.35 });
      case 'gris_fonce':    return new M({ color: 0x2E363C, roughness: 0.55, metalness: 0.3 });
      case 'sommier_blanc': return new M({ color: 0xDCE1E4, roughness: 0.5, metalness: 0.15 });
      case 'bleu_panneau':  return new M({ color: 0x2E6FB0, roughness: 0.45, metalness: 0.12 });
      case 'cable_gris':    return new M({ color: 0x9AA3AA, roughness: 0.7, metalness: 0.05 });
      case 'telecommande':  return new M({ color: 0x30383E, roughness: 0.5, metalness: 0.2 });
      default:              return new M({ color: 0xDDD8D2, roughness: 0.55, metalness: 0.1 });
    }
  }

  function loadBedD8DModel(cb) {
    if (!THREE.OBJLoader) { cb(); return; }
    new THREE.OBJLoader().load(
      'assets/models/lit-saikang-d8d.obj',
      function (obj) {
        const matCache = {};
        obj.traverse(function (o) {
          if (!o.isMesh) return;
          if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
          const pick = function (m) {
            const nm = (m && m.name) || 'default';
            if (!matCache[nm]) { const mat = bedD8DMaterialFor(nm); mat.name = nm; matCache[nm] = mat; }
            return matCache[nm];
          };
          o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material);
          o.castShadow = true; o.receiveShadow = true;
          o.userData.sharedModel = true;
        });
        bedD8DProto = obj;
        cb();
      },
      undefined,
      function (err) {
        console.warn('Modèle 3D du lit D8D indisponible, fallback procédural.', err);
        cb();
      }
    );
  }

  function buildHospitalBedFromOBJ() {
    const g = new THREE.Group();
    // OBJ en mètres (2,13 × 0,98 × 0,99 m), roulettes au sol, grand axe sur X, tête en -X.
    // Rotation -90° : la tête passe en -Z et la longueur sur Z (même sens que les autres lits).
    const model = bedD8DProto.clone(true);
    model.rotation.y = -Math.PI / 2;
    let meshCount = 0; const matNames = {};
    model.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.userData.sharedModel = true;
      meshCount++;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function (m) { if (m && m.name) matNames[m.name] = 1; });
    });
    g.add(model);
    // Le fichier ne contient que le sommier à lattes : on ajoute le matelas (4 sections)
    // posé sur les lattes (dessus du sommier à 0,527 m).
    const matMat = new THREE.MeshStandardMaterial({ color: 0x2E5C86, roughness: 0.92, metalness: 0.02 });
    [[-0.60, 0.66], [-0.10, 0.27], [0.22, 0.31], [0.69, 0.56]].forEach(function (s) {
      g.add(roundedBox(0.80, 0.10, s[1] - 0.02, 0.045, matMat, 0, 0.578, -s[0]));
    });
    lastBedD8DInfo = { meshes: meshCount, materials: Object.keys(matNames).length };
    if (window.MAM3D) window.MAM3D.bedD8D = lastBedD8DInfo;

    const lbl = makeLabel("Lit d'hôpital électrique");
    lbl.position.set(0, 1.32, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  function buildHospitalBed() {
    if (bedD8DProto) return buildHospitalBedFromOBJ();
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xE9ECEE, roughness: 0.42, metalness: 0.12 });
    const beddingMat = new THREE.MeshStandardMaterial({ color: 0x2E5C86, roughness: 0.9 });
    const bedding2 = new THREE.MeshStandardMaterial({ color: 0x3D72A3, roughness: 0.9 });
    // base frame
    g.add(box(1.0, 0.12, 2.0, frameMat, 0, 0.5, 0));
    // corner posts
    const posts = [[-0.47, -0.96], [0.47, -0.96], [-0.47, 0.96], [0.47, 0.96]];
    posts.forEach(function (p) { g.add(box(0.06, 0.34, 0.06, frameMat, p[0], 0.28, p[1])); });
    // mattress platform + mattress (4 segments)
    g.add(box(0.92, 0.04, 1.94, frameMat, 0, 0.56, 0));
    g.add(roundedBox(0.88, 0.14, 1.9, 0.05, beddingMat, 0, 0.65, 0));
    // head section raised slightly
    const headr = roundedBox(0.88, 0.13, 0.62, 0.05, bedding2, 0, 0.78, -0.66);
    headr.rotation.x = -0.18; g.add(headr);
    // pillow
    g.add(roundedBox(0.6, 0.11, 0.34, 0.05, MAT.white, 0, 0.87, -0.62));
    // head & foot boards (white ABS)
    g.add(box(0.96, 0.5, 0.05, frameMat, 0, 0.85, -1.02));
    g.add(box(0.96, 0.44, 0.05, frameMat, 0, 0.82, 1.02));
    // side rails (raised, white slatted)
    [-1, 1].forEach(function (sx) {
      const rail = new THREE.Group();
      rail.position.set(sx * 0.5, 0, 0);
      rail.add(box(0.05, 0.03, 1.1, frameMat, 0, 1.02, 0));
      rail.add(box(0.05, 0.03, 1.1, frameMat, 0, 0.74, 0));
      rail.add(box(0.05, 0.32, 0.04, frameMat, 0, 0.88, -0.53));
      rail.add(box(0.05, 0.32, 0.04, frameMat, 0, 0.88, 0));
      rail.add(box(0.05, 0.32, 0.04, frameMat, 0, 0.88, 0.53));
      g.add(rail);
    });
    // hydraulic column + pedal brake
    g.add(cyl(0.09, 0.11, 0.36, frameMat, 0, 0.3, 0, 16));
    g.add(cyl(0.07, 0.07, 0.1, MAT.dark, 0, 0.12, 0, 14));
    // 4 casters Ø125
    addCasters(g, 0.42, 0.9, 0.06, 0.055);
    // hand remote on the rail
    g.add(box(0.1, 0.16, 0.04, MAT.dark, 0.52, 0.9, 0.4));
    brandPlate(g, 'Saikang', 0.2, 0.03, 0, 1.05, -1.05, { color: '#C9D2D8', size: 46, rotY: Math.PI });
    const lbl = makeLabel("Lit d'hôpital électrique");
    lbl.position.set(0, 1.4, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Compresseur thoracique Amoul E6 — modèle OBJ importé + repli procédural */
  let amoulE6Proto = null;
  let lastAmoulE6Info = null;

  function amoulE6MaterialFor(name) {
    const M = THREE.MeshStandardMaterial;
    switch (name) {
      case 'blanc':        return new M({ color: 0xF1F4F6, roughness: 0.42, metalness: 0.08 });
      case 'bleu_nuit':    return new M({ color: 0x1F4F8C, roughness: 0.38, metalness: 0.18 });
      case 'logo_disque':  return new M({ color: 0x2E6FB0, roughness: 0.4, metalness: 0.16 });
      case 'capteur_gris': return new M({ color: 0x6F787F, roughness: 0.5, metalness: 0.25 });
      case 'soufflet_noir':return new M({ color: 0x1A1F24, roughness: 0.9, metalness: 0.02 });
      case 'ventouse_blanche': return new M({ color: 0xE7ECEF, roughness: 0.48, metalness: 0.06 });
      default:             return new M({ color: 0xDDD8D2, roughness: 0.55, metalness: 0.1 });
    }
  }

  function loadAmoulE6Model(cb) {
    if (!THREE.OBJLoader) { cb(); return; }
    new THREE.OBJLoader().load(
      'assets/models/compresseur-thoracique-amoul-e6.obj',
      function (obj) {
        const matCache = {};
        obj.traverse(function (o) {
          if (!o.isMesh) return;
          if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
          const pick = function (m) {
            const nm = (m && m.name) || 'default';
            if (!matCache[nm]) { const mat = amoulE6MaterialFor(nm); mat.name = nm; matCache[nm] = mat; }
            return matCache[nm];
          };
          o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material);
          o.castShadow = true; o.receiveShadow = true;
          o.userData.sharedModel = true;
        });
        amoulE6Proto = obj;
        cb();
      },
      undefined,
      function (err) {
        console.warn("Modèle 3D du compresseur thoracique Amoul E6 indisponible, fallback procédural.", err);
        cb();
      }
    );
  }

  function buildAmoulE6FromOBJ() {
    const g = new THREE.Group();
    // OBJ: ~0.465 x 0.533 x 0.154 m, base near y~0
    const model = amoulE6Proto.clone(true);
    // Redresser et centrer
    model.rotation.y = Math.PI;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    model.position.x -= (box.min.x + box.max.x) / 2;
    model.position.z -= (box.min.z + box.max.z) / 2;
    model.position.y -= box.min.y;
    let meshCount = 0; const matNames = {};
    model.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.userData.sharedModel = true;
      meshCount++;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function (m) { if (m && m.name) matNames[m.name] = 1; });
    });
    g.add(model);
    lastAmoulE6Info = { meshes: meshCount, materials: Object.keys(matNames).length };
    if (window.MAM3D) window.MAM3D.amoulE6 = lastAmoulE6Info;

    const lbl = makeLabel('Compresseur thoracique');
    lbl.position.set(0, 0.72, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Défibrillateur / moniteur - Amoul CPR E6 (ACLS, grand écran, touches rouges) */
  function buildDefibrillator() {
    if (amoulE6Proto) return buildAmoulE6FromOBJ();
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2A3038, roughness: 0.45, metalness: 0.22 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xD23B2E, roughness: 0.45, metalness: 0.15 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x2C5C8F, roughness: 0.5, metalness: 0.2 });
    // small wheeled trolley
    const legs = [[-0.22, -0.18], [0.22, -0.18], [-0.22, 0.18], [0.22, 0.18]];
    legs.forEach(function (p) { g.add(box(0.025, 0.6, 0.025, MAT.steel, p[0], 0.34, p[1])); });
    g.add(box(0.5, 0.03, 0.4, blueMat, 0, 0.64, 0));
    g.add(box(0.46, 0.025, 0.36, blueMat, 0, 0.26, 0));
    addCasters(g, 0.22, 0.18, 0.045, 0.045);
    // unit body — dark ACLS housing, wider than tall
    g.add(roundedBox(0.48, 0.3, 0.3, 0.03, bodyMat, 0, 0.9, 0));
    // blue top edge + carry handle
    g.add(box(0.48, 0.04, 0.302, blueMat, 0, 1.03, 0));
    g.add(box(0.26, 0.025, 0.04, MAT.dark, 0, 1.07, 0));
    // large screen (left) with ECG + joules
    g.add(box(0.32, 0.24, 0.02, MAT.dark, -0.06, 0.92, 0.152));
    const scr = makeScreenMesh(0.29, 0.2, 'defib');
    scr.position.set(-0.06, 0.92, 0.164);
    g.add(scr);
    // red shock control panel (right)
    g.add(box(0.1, 0.24, 0.012, accentMat, 0.17, 0.92, 0.152));
    g.add(cyl(0.028, 0.028, 0.02, MAT.light, 0.17, 1.0, 0.162, 14));
    g.add(cyl(0.022, 0.022, 0.02, MAT.light, 0.17, 0.88, 0.162, 14));
    g.add(box(0.06, 0.02, 0.01, MAT.light, 0.17, 0.82, 0.16));
    // paddles/electrodes holstered on the side
    g.add(box(0.05, 0.16, 0.12, MAT.dark, 0.26, 0.96, 0.02));
    g.add(box(0.1, 0.06, 0.1, MAT.dark, 0.26, 0.88, -0.06));
    g.add(box(0.1, 0.06, 0.1, MAT.dark, 0.26, 0.88, -0.16));
    // thermal printer slot + thermal paper
    g.add(box(0.18, 0.012, 0.12, MAT.light, -0.08, 0.76, 0.15));
    brandPlate(g, 'AMOUL CPR E6', 0.2, 0.03, -0.02, 1.045, 0.151, { color: '#EAF2F6', size: 34 });
    const lbl = makeLabel('Défibrillateur');
    lbl.position.set(0, 1.35, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Pompe à perfusion volumétrique sur pied (infusion pump) */
  function buildInfusionPump() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xF2F4F5, roughness: 0.42, metalness: 0.06 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x2F6FB0, roughness: 0.45, metalness: 0.2 });
    starBase(g, 5, 0.36, 0.026);
    addCasters(g, 0.34, 0.34, 0.05, 0.048);
    g.add(cyl(0.026, 0.026, 1.7, MAT.steel, 0, 0.86, 0, 14));
    // IV bag hook + bag + drip line
    g.add(box(0.16, 0.02, 0.02, MAT.steel, 0.0, 1.74, 0));
    g.add(box(0.16, 0.24, 0.05, MAT.glass, 0.0, 1.58, 0.02));
    g.add(tube(0.007, 0.46, MAT.glass, 0.0, 1.22, 0.05));
    // single volumetric pump head
    const py = 1.2;
    g.add(roundedBox(0.28, 0.19, 0.14, 0.014, bodyMat, 0.02, py, 0.03));
    const s = makeScreenMesh(0.16, 0.09, 'infusion');
    s.position.set(0.02, py + 0.04, 0.102);
    g.add(s);
    g.add(box(0.28, 0.02, 0.142, accentMat, 0.02, py - 0.04, 0.031));
    // peristaltic door + tubing set
    g.add(box(0.14, 0.09, 0.05, MAT.light, 0.02, py - 0.08, 0.06));
    g.add(tube(0.008, 0.34, MAT.glass, 0.02, py - 0.28, 0.07));
    // clamp + pole buttons
    g.add(box(0.08, 0.09, 0.08, accentMat, 0.02, py + 0.14, -0.01));
    brandPlate(g, 'Perfuseur', 0.16, 0.026, 0.02, 1.1, 0.102, { color: '#2F6FB0', size: 40 });
    const lbl = makeLabel('Pompe à perfusion');
    lbl.position.set(0, 1.98, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Respirateur manuel / ballon auto-remplisseur (Ambu) */
  function buildAmbuBag() {
    const g = new THREE.Group();
    // wall-mounted bracket + bag
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x3A6E8F, roughness: 0.55 });
    const bagMat2 = new THREE.MeshStandardMaterial({ color: 0x2C5A78, roughness: 0.55 });
    // bag self-inflating (accordion) — dark blue silicone oval
    const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.24, 18), bagMat);
    bag.rotation.z = Math.PI / 2; bag.position.set(0, 1.25, 0);
    g.add(bag);
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.092, 0.006, 6, 18), bagMat2);
      ring.rotation.y = Math.PI / 2; ring.position.set(-0.09 + i * 0.06, 1.25, 0);
      g.add(ring);
    }
    // valve + mask connector (right)
    g.add(box(0.06, 0.06, 0.06, MAT.white, 0.16, 1.25, 0));
    g.add(cyl(0.022, 0.022, 0.05, MAT.white, 0.22, 1.25, 0, 12));
    // mask (transparent) + reservoir bag
    g.add(cyl(0.05, 0.06, 0.05, MAT.glass, 0.27, 1.25, 0, 14));
    g.add(cyl(0.045, 0.045, 0.11, MAT.glass, -0.14, 1.25, 0, 14));
    // inlet reservoir + O2 tubing
    g.add(tube(0.008, 0.4, MAT.glass, -0.16, 1.05, 0.05));
    // mounting rail/bracket on the wall
    g.add(box(0.02, 0.1, 0.24, MAT.steel, -0.2, 1.3, 0));
    const lbl = makeLabel('Ballon auto-remplisseur');
    lbl.position.set(0.05, 1.58, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Table de chevet / overbed table roulante */
  function buildOverbedTable() {
    const g = new THREE.Group();
    const topMat = new THREE.MeshStandardMaterial({ color: 0xEDEFF1, roughness: 0.4, metalness: 0.08 });
    // C-shaped base (goes under the bed)
    g.add(box(0.5, 0.04, 0.5, MAT.light, 0, 0.06, 0));
    g.add(box(0.4, 0.06, 0.4, MAT.light, -0.32, 0.06, 0));
    // vertical column
    g.add(cyl(0.028, 0.028, 0.8, MAT.steel, -0.32, 0.5, 0, 14));
    // tabletop (tilting)
    g.add(roundedBox(0.66, 0.035, 0.42, 0.02, topMat, -0.32, 0.92, -0.22));
    g.add(box(0.6, 0.02, 0.36, MAT.light, -0.32, 0.94, -0.22));
    // height-adjust knob
    g.add(cyl(0.02, 0.02, 0.03, MAT.dark, -0.32, 0.72, 0.03, 12));
    // casters
    addCasters(g, 0.3, 0.28, 0.045, 0.045);
    addShadowPatch(g, 1.1, 0.9, -0.32, 0.2, 0.4);
    const lbl = makeLabel('Table de chevet');
    lbl.position.set(-0.32, 1.15, -0.22);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Brancard Saikang SKB041-10 (bleu, hauteur variable) */
  function buildStretcher() {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xC9D2D8, roughness: 0.35, metalness: 0.7 });
    const padMat = new THREE.MeshStandardMaterial({ color: 0x2C6FB0, roughness: 0.85 });
    const padMat2 = new THREE.MeshStandardMaterial({ color: 0x3B82C4, roughness: 0.85 });
    // mattress (blue)
    g.add(roundedBox(0.7, 0.12, 1.9, 0.05, padMat, 0, 0.86, 0));
    // head section slightly raised
    const head = roundedBox(0.7, 0.11, 0.5, 0.05, padMat2, 0, 0.95, -0.7);
    head.rotation.x = -0.16; g.add(head);
    g.add(roundedBox(0.44, 0.09, 0.28, 0.04, MAT.white, 0, 1.0, -0.62));
    // side rails (blue, folding)
    [-1, 1].forEach(function (sx) {
      const rail = new THREE.Group();
      rail.position.set(sx * 0.4, 0, 0);
      rail.add(box(0.04, 0.02, 0.9, frameMat, 0, 1.06, 0));
      rail.add(box(0.04, 0.02, 0.9, frameMat, 0, 0.82, 0));
      rail.add(box(0.04, 0.24, 0.035, frameMat, 0, 0.94, -0.43));
      rail.add(box(0.04, 0.24, 0.035, frameMat, 0, 0.94, 0));
      rail.add(box(0.04, 0.24, 0.035, frameMat, 0, 0.94, 0.43));
      g.add(rail);
    });
    // frame rails + cross bars
    g.add(box(0.72, 0.04, 0.05, frameMat, 0, 0.79, -0.94));
    g.add(box(0.72, 0.04, 0.05, frameMat, 0, 0.79, 0.94));
    [-0.9, 0.9].forEach(function (cz) { g.add(box(0.05, 0.04, 0.72, frameMat, 0, 0.79, cz * 0.5)); });
    // central column + hydraulic
    g.add(cyl(0.06, 0.06, 0.5, frameMat, 0, 0.5, 0, 16));
    // IV pole + oxygen bracket at head
    g.add(cyl(0.018, 0.018, 0.5, MAT.steel, -0.3, 1.15, -0.95, 10));
    const lbl = makeLabel('Brancard');
    lbl.position.set(0, 0.86, 0);
    g.add(lbl); g.userData.label = lbl;
    // 4 casters Ø150
    addCasters(g, 0.36, 0.9, 0.075, 0.075);
    return g;
  }

  /* ==========================================================
     MODULES GÉNÉRIQUES (salles 03 → 06)
     ========================================================== */

  /* Moniteur patient paramétrable (Amoul orange, Contec blanc, EDAN blanc) */
  function makePatientMonitor(opts) {
    opts = opts || {};
    return function () {
      const g = new THREE.Group();
      const caseMat = new THREE.MeshStandardMaterial({ color: opts.case || 0xE8EBED, roughness: 0.42, metalness: 0.08 });
      const accentMat = new THREE.MeshStandardMaterial({ color: opts.accent || 0x2F6FB0, roughness: 0.45, metalness: 0.15 });
      starBase(g, 5, 0.38, 0.03);
      addCasters(g, 0.36, 0.36, 0.05, 0.05);
      g.add(cyl(0.03, 0.03, 1.28, MAT.steel, 0, 0.7, 0, 16));
      g.add(cyl(0.048, 0.048, 0.09, caseMat, 0, 1.32, 0, 16));
      g.add(box(0.05, 0.05, 0.18, caseMat, 0, 1.44, -0.03));
      // monitor body (landscape ~4:3)
      const body = roundedBox(0.46, 0.36, 0.08, 0.025, caseMat, 0, 1.58, 0.11);
      g.add(body);
      g.add(box(0.4, 0.29, 0.015, MAT.dark, 0, 1.58, 0.156));
      const scr = makeScreenMesh(0.37, 0.26, 'monitor');
      scr.position.set(0, 1.58, 0.168);
      g.add(scr);
      // accent band + soft keys + knob
      g.add(box(0.46, 0.03, 0.082, accentMat, 0, 1.4, 0.11));
      for (let i = 0; i < 5; i++) g.add(box(0.03, 0.02, 0.012, caseMat, 0.16 - i * 0.05, 1.38, 0.16));
      g.add(cyl(0.02, 0.02, 0.02, caseMat, -0.17, 1.38, 0.16, 12));
      // side module rack
      g.add(box(0.05, 0.22, 0.16, caseMat, 0.25, 1.58, 0.1));
      g.add(box(0.06, 0.09, 0.12, MAT.dark, 0.255, 1.66, 0.11));
      g.add(box(0.06, 0.09, 0.12, MAT.dark, 0.255, 1.54, 0.11));
      // top handle + cables
      g.add(box(0.24, 0.025, 0.03, caseMat, 0, 1.78, 0.09));
      g.add(tube(0.007, 0.46, MAT.rubber, -0.15, 1.32, 0.13));
      g.add(tube(0.007, 0.42, MAT.rubber, -0.08, 1.32, 0.13));
      if (opts.brand) brandPlate(g, opts.brand, 0.15, 0.026, 0, 1.72, 0.152, { color: opts.brandColor || '#5A6670', size: 42 });
      const lbl = makeLabel(opts.label || 'Moniteur');
      lbl.position.set(0, 1.98, 0.05);
      g.add(lbl); g.userData.label = lbl;
      return g;
    };
  }
  const buildAmoulI5 = makePatientMonitor({ case: 0xE8901E, accent: 0x3A3F44, brand: 'Amoul i5', label: 'Moniteur Amoul i5' });
  const buildAmoulI6 = makePatientMonitor({ case: 0xEDEFF1, accent: 0x2F6FB0, brand: 'Amoul i6', label: 'Moniteur Amoul i6' });
  const buildContec9200 = makePatientMonitor({ case: 0xE9EBED, accent: 0x1E8A4C, brand: 'CONTEC 9200', label: 'Moniteur Contec 9200' });
  const buildEdanX12 = makePatientMonitor({ case: 0xF0F2F3, accent: 0x27689E, brand: 'EDAN X12', label: 'Moniteur EDAN X12' });

  /* ECG 12 dérivations Contec ECG1200G (sur chariot) */
  function buildECG() {
    const g = new THREE.Group();
    const caseMat = new THREE.MeshStandardMaterial({ color: 0xE9EBED, roughness: 0.42, metalness: 0.08 });
    // small cart
    const legs = [[-0.24, -0.18], [0.24, -0.18], [-0.24, 0.18], [0.24, 0.18]];
    legs.forEach(function (p) { g.add(box(0.03, 0.66, 0.03, MAT.steel, p[0], 0.37, p[1])); });
    g.add(box(0.56, 0.03, 0.42, caseMat, 0, 0.7, 0));
    g.add(box(0.52, 0.025, 0.38, caseMat, 0, 0.3, 0));
    addCasters(g, 0.24, 0.18, 0.045, 0.045);
    // ECG unit
    g.add(roundedBox(0.44, 0.22, 0.3, 0.02, caseMat, 0, 0.85, 0));
    // printer + paper
    g.add(box(0.4, 0.02, 0.05, MAT.light, 0, 0.97, 0.06));
    // large screen area
    g.add(box(0.34, 0.16, 0.015, MAT.dark, 0, 0.87, 0.152));
    const scr = makeScreenMesh(0.31, 0.13, 'ecg');
    scr.position.set(0, 0.87, 0.162);
    g.add(scr);
    // keypad
    for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) g.add(box(0.02, 0.012, 0.008, MAT.light, -0.14 + c * 0.04, 0.75 - r * 0.03, 0.152));
    // lead wires bundle
    g.add(tube(0.006, 0.5, MAT.rubber, 0.24, 0.6, 0.02));
    brandPlate(g, 'CONTEC ECG1200G', 0.28, 0.026, 0, 0.72, 0.152, { color: '#1E8A4C', size: 34 });
    const lbl = makeLabel('ECG 12 dérivations');
    lbl.position.set(0, 1.12, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Brancard d'ambulance Saikang SKB039F — modèle OBJ importé + repli procédural */
  let stretcher039Proto = null;
  let lastStretcher039Info = null;

  function stretcher039MaterialFor(name) {
    const M = THREE.MeshStandardMaterial;
    switch (name) {
      case 'aluminium':         return new M({ color: 0xC2CBD2, roughness: 0.32, metalness: 0.85 });
      case 'aluminium_mat':     return new M({ color: 0xADB7BE, roughness: 0.55, metalness: 0.55 });
      case 'rouge_pieds':       return new M({ color: 0xA8281E, roughness: 0.5, metalness: 0.12 });
      case 'matelas_vinyle_noir': return new M({ color: 0x1E2429, roughness: 0.88, metalness: 0.03 });
      case 'sangle_noire':      return new M({ color: 0x14181C, roughness: 0.92, metalness: 0.02 });
      case 'noir_acier':        return new M({ color: 0x262C31, roughness: 0.4, metalness: 0.6 });
      case 'platine_argent':    return new M({ color: 0x9BA5AC, roughness: 0.38, metalness: 0.7 });
      case 'caoutchouc_noir':   return new M({ color: 0x191D21, roughness: 0.96, metalness: 0.02 });
      case 'moyeu_gris':        return new M({ color: 0x7E878E, roughness: 0.4, metalness: 0.65 });
      case 'bande_reflechissante': return new M({ color: 0xD8B62E, roughness: 0.35, metalness: 0.25, emissive: 0x3A2E00, emissiveIntensity: 0.35 });
      default:                  return new M({ color: 0xDDD8D2, roughness: 0.55, metalness: 0.1 });
    }
  }

  function loadAmbulanceStretcherModel(cb) {
    if (!THREE.OBJLoader) { cb(); return; }
    new THREE.OBJLoader().load(
      'assets/models/brancard-skb039f.obj',
      function (obj) {
        const matCache = {};
        obj.traverse(function (o) {
          if (!o.isMesh) return;
          if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
          const pick = function (m) {
            const nm = (m && m.name) || 'default';
            if (!matCache[nm]) { const mat = stretcher039MaterialFor(nm); mat.name = nm; matCache[nm] = mat; }
            return matCache[nm];
          };
          o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material);
          o.castShadow = true; o.receiveShadow = true;
          o.userData.sharedModel = true;
        });
        stretcher039Proto = obj;
        cb();
      },
      undefined,
      function (err) {
        console.warn("Modèle 3D du brancard SKB039F indisponible, fallback procédural.", err);
        cb();
      }
    );
  }

  function buildAmbulanceStretcherFromOBJ() {
    const g = new THREE.Group();
    // OBJ en mètres (2,29 × 1,02 × 0,64 m), roues au sol, grand axe sur X, tête en +X.
    // Rotation +90° : la tête passe en -Z et la longueur sur Z.
    const model = stretcher039Proto.clone(true);
    model.rotation.y = Math.PI / 2;
    let meshCount = 0; const matNames = {};
    model.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.userData.sharedModel = true;
      meshCount++;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function (m) { if (m && m.name) matNames[m.name] = 1; });
    });
    g.add(model);
    lastStretcher039Info = { meshes: meshCount, materials: Object.keys(matNames).length };
    if (window.MAM3D) window.MAM3D.stretcher039 = lastStretcher039Info;

    const lbl = makeLabel('Brancard d\'ambulance');
    lbl.position.set(0, 1.3, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Brancard d'ambulance (repli procédural) */
  function buildAmbulanceStretcher() {
    if (stretcher039Proto) return buildAmbulanceStretcherFromOBJ();
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xC9D2D8, roughness: 0.35, metalness: 0.7 });
    const padMat = new THREE.MeshStandardMaterial({ color: 0x1F3F7A, roughness: 0.85 });
    g.add(roundedBox(0.7, 0.12, 2.0, 0.05, padMat, 0, 0.9, 0));
    // folding side rails
    [-1, 1].forEach(function (sx) {
      const rail = new THREE.Group();
      rail.position.set(sx * 0.4, 0, 0);
      rail.add(box(0.04, 0.02, 1.0, frameMat, 0, 1.1, 0));
      rail.add(box(0.04, 0.22, 0.035, frameMat, 0, 0.99, -0.48));
      rail.add(box(0.04, 0.22, 0.035, frameMat, 0, 0.99, 0));
      rail.add(box(0.04, 0.22, 0.035, frameMat, 0, 0.99, 0.48));
      g.add(rail);
    });
    // frame + rails
    g.add(box(0.72, 0.05, 0.05, frameMat, 0, 0.83, -0.98));
    g.add(box(0.72, 0.05, 0.05, frameMat, 0, 0.83, 0.98));
    g.add(box(0.05, 0.05, 0.9, frameMat, 0, 0.83, -0.5));
    g.add(box(0.05, 0.05, 0.9, frameMat, 0, 0.83, 0.5));
    // IV pole + O2 bracket at head
    g.add(cyl(0.018, 0.018, 0.55, MAT.steel, -0.32, 1.2, -1.0, 10));
    g.add(box(0.1, 0.12, 0.05, MAT.dark, 0.32, 1.0, -1.0));
    brandPlate(g, 'Saikang SKB039F', 0.2, 0.03, 0, 0.86, 1.02, { color: '#C9D2D8', size: 42, rotY: Math.PI });
    const lbl = makeLabel("Brancard d'ambulance");
    lbl.position.set(0, 1.2, 0);
    g.add(lbl); g.userData.label = lbl;
    // 4 casters Ø150
    addCasters(g, 0.36, 0.94, 0.08, 0.08);
    return g;
  }

  /* Table d'examen Saikang SKB041-2 (dossier inclinable, mousse bleue) */
  function buildExamTable() {
    const g = new THREE.Group();
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xEDEFF1, roughness: 0.42, metalness: 0.1 });
    const padMat = new THREE.MeshStandardMaterial({ color: 0x2C6FB0, roughness: 0.85 });
    // base column + foot
    g.add(roundedBox(0.5, 0.1, 0.5, 0.03, baseMat, 0, 0.06, 0));
    g.add(cyl(0.09, 0.11, 0.5, baseMat, 0, 0.35, 0, 16));
    // flat section + inclined backrest
    g.add(box(0.62, 0.06, 1.0, baseMat, 0, 0.66, 0.3));
    g.add(roundedBox(0.6, 0.1, 0.96, 0.04, padMat, 0, 0.73, 0.3));
    const back = roundedBox(0.6, 0.1, 0.66, 0.04, padMat, 0, 0.85, -0.42);
    back.rotation.x = -0.42; g.add(back);
    // grab handles at head
    g.add(box(0.5, 0.03, 0.03, baseMat, 0, 0.98, -0.76));
    // paper roll holder + step
    g.add(cyl(0.03, 0.03, 0.6, MAT.light, 0, 0.9, 0.78, 12));
    // stirrups / accessory rails
    g.add(box(0.05, 0.05, 0.06, MAT.steel, -0.32, 0.7, 0.4));
    g.add(box(0.05, 0.05, 0.06, MAT.steel, 0.32, 0.7, 0.4));
    brandPlate(g, 'Saikang SKB041-2', 0.24, 0.028, 0, 0.6, 0.8, { color: '#5A6670', size: 40 });
    const lbl = makeLabel("Table d'examen");
    lbl.position.set(0, 1.15, 0);
    g.add(lbl); g.userData.label = lbl;
    addCasters(g, 0.22, 0.24, 0.045, 0.045);
    return g;
  }

  /* Table d'examen radiotransparente (radiologie) */
  function buildRadTable() {
    const g = new THREE.Group();
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xE4E8EA, roughness: 0.4, metalness: 0.15 });
    const padMat = new THREE.MeshStandardMaterial({ color: 0x4A6B84, roughness: 0.85 });
    // pedestal base
    g.add(roundedBox(0.72, 0.09, 0.5, 0.03, baseMat, 0, 0.06, 0));
    g.add(cyl(0.1, 0.13, 0.62, baseMat, 0, 0.42, -0.2, 18));
    // tabletop (radiotransparent floating)
    g.add(box(0.7, 0.06, 2.0, baseMat, 0, 0.76, 0));
    g.add(box(0.66, 0.04, 1.96, padMat, 0, 0.8, 0));
    // arm connecting pedestal to top
    g.add(box(0.16, 0.1, 0.5, baseMat, 0, 0.72, -0.2));
    // patient handles
    g.add(box(0.5, 0.03, 0.03, baseMat, 0, 0.92, -0.9));
    // caster lock lever
    g.add(box(0.35, 0.03, 0.1, MAT.dark, 0, 0.2, 0.2));
    addCasters(g, 0.3, 0.2, 0.05, 0.05);
    const lbl = makeLabel('Table de radiologie');
    lbl.position.set(0, 1.05, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Nébuliseur / concentrateur O2 / bouteilles gaz (générique) — bouteille */
  function buildGasBottles() {
    const g = new THREE.Group();
    const bottle = new THREE.MeshStandardMaterial({ color: 0x2E6F3E, roughness: 0.4, metalness: 0.5 });
    const bottle2 = new THREE.MeshStandardMaterial({ color: 0xEDF2F4, roughness: 0.35, metalness: 0.55 });
    function cyl6(r, h, mat, x, z, col) {
      const c = cyl(r, r, h, mat, x, h / 2 + 0.04, z, 20);
      g.add(c);
      g.add(cyl(r * 0.35, r * 0.35, 0.1, MAT.steel, x, h + 0.1, z, 12));
      g.add(cyl(0.02, 0.02, 0.1, MAT.steel, x, h + 0.2, z, 10));
    }
    cyl6(0.1, 1.1, bottle, -0.14, 0);
    cyl6(0.1, 1.1, bottle2, 0.14, 0);
    // regulator gauges
    g.add(cyl(0.05, 0.05, 0.02, MAT.light, -0.14, 1.28, 0.1, 16));
    g.add(cyl(0.05, 0.05, 0.02, MAT.light, 0.14, 1.28, 0.1, 16));
    // carts
    g.add(box(0.42, 0.04, 0.4, MAT.light, 0, 0.06, 0));
    addCasters(g, 0.16, 0.14, 0.05, 0.045);
    const lbl = makeLabel('Bouteilles de gaz médicaux');
    lbl.position.set(0, 1.55, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Stérilisateur / autoclave de table (générique) */
  function buildAutoclave() {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xC9D2D8, roughness: 0.28, metalness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3A4248, roughness: 0.45, metalness: 0.4 });
    // cabinet
    g.add(box(0.9, 1.5, 0.7, steel, 0, 0.85, 0));
    g.add(box(0.94, 0.05, 0.74, dark, 0, 1.62, 0));
    // big circular door with handle
    const face = new THREE.MeshStandardMaterial({ color: 0xB4BDC3, roughness: 0.3, metalness: 0.85 });
    g.add(cyl(0.28, 0.28, 0.03, face, 0, 1.0, 0.36, 32));
    g.add(cyl(0.24, 0.24, 0.02, dark, 0, 1.0, 0.38, 32));
    g.add(box(0.5, 0.03, 0.03, dark, 0.02, 1.0, 0.4));
    g.add(cyl(0.03, 0.03, 0.04, dark, 0.26, 1.0, 0.4, 12));
    // controls panel (top)
    g.add(box(0.5, 0.14, 0.03, dark, 0, 1.42, 0.36));
    const scr = makeScreenMesh(0.16, 0.1, 'infusion');
    scr.position.set(-0.12, 1.42, 0.38);
    g.add(scr);
    g.add(cyl(0.02, 0.02, 0.03, MAT.red, 0.16, 1.42, 0.38, 12));
    // pressure gauge
    g.add(cyl(0.05, 0.05, 0.02, MAT.light, 0.34, 1.2, 0.3, 16));
    // vent / steam pipe
    g.add(tube(0.02, 0.3, steel, 0.4, 1.7, 0));
    brandPlate(g, 'AUTOCLAVE', 0.24, 0.03, 0, 1.34, 0.362, { color: '#2A5B8F', size: 42 });
    const lbl = makeLabel('Stérilisateur (autoclave)');
    lbl.position.set(0, 1.9, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Bac de stérilisation inox sur support */
  function buildSteriTray() {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xC4CDD3, roughness: 0.3, metalness: 0.85 });
    // stand
    const legs = [[-0.35, -0.22], [0.35, -0.22], [-0.35, 0.22], [0.35, 0.22]];
    legs.forEach(function (p) { g.add(box(0.03, 0.72, 0.03, steel, p[0], 0.4, p[1])); });
    addCasters(g, 0.35, 0.22, 0.05, 0.048);
    // trays
    g.add(box(0.8, 0.03, 0.5, steel, 0, 0.76, 0));
    g.add(box(0.8, 0.12, 0.02, steel, 0, 0.82, -0.25));
    g.add(box(0.8, 0.12, 0.02, steel, 0, 0.82, 0.25));
    g.add(box(0.02, 0.12, 0.5, steel, -0.4, 0.82, 0));
    g.add(box(0.02, 0.12, 0.5, steel, 0.4, 0.82, 0));
    // second tier tray
    g.add(box(0.7, 0.02, 0.42, steel, 0.0, 0.45, 0));
    // instruments inside
    for (let i = 0; i < 5; i++) g.add(box(0.06, 0.02, 0.14, MAT.steel, -0.24 + i * 0.12, 0.83, 0.05));
    const lbl = makeLabel('Bac de stérilisation');
    lbl.position.set(0, 1.15, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Négatoscope mural 2 volets (radiologie) */
  function buildNegatoscope() {
    const g = new THREE.Group();
    const frame = new THREE.MeshStandardMaterial({ color: 0xD7DEE2, roughness: 0.35, metalness: 0.5 });
    const panel = new THREE.MeshStandardMaterial({ color: 0xEAF4FF, emissive: 0xBFDCFF, emissiveIntensity: 0.9, roughness: 0.3 });
    g.add(box(0.9, 0.6, 0.05, frame, 0, 1.5, 0));
    g.add(box(0.4, 0.5, 0.02, panel, -0.22, 1.5, 0.03));
    g.add(box(0.4, 0.5, 0.02, panel, 0.22, 1.5, 0.03));
    g.add(box(0.44, 0.54, 0.025, MAT.dark, -0.22, 1.5, 0.028));
    g.add(box(0.44, 0.54, 0.025, MAT.dark, 0.22, 1.5, 0.028));
    // leg / wall mount struts
    g.add(box(0.05, 1.2, 0.05, frame, -0.38, 0.65, 0));
    g.add(box(0.05, 1.2, 0.05, frame, 0.38, 0.65, 0));
    g.add(box(0.9, 0.05, 0.05, frame, 0, 0.06, 0));
    const lbl = makeLabel('Négatoscope / lecteur de plaques');
    lbl.position.set(0, 1.95, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Porte-tabliers plombés (radiologie) */
  function buildLeadApron() {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xB9C3C9, roughness: 0.32, metalness: 0.85 });
    const apron = new THREE.MeshStandardMaterial({ color: 0x384A63, roughness: 0.85 });
    g.add(roundedBox(0.6, 0.08, 0.5, 0.03, MAT.base, 0, 0.06, 0));
    g.add(cyl(0.03, 0.03, 1.7, steel, 0, 0.9, 0, 14));
    g.add(box(0.7, 0.05, 0.05, steel, 0, 1.7, 0));
    // hanging aprons (stopped at slight angles)
    [-0.22, 0, 0.22].forEach(function (x) {
      g.add(box(0.16, 0.7, 0.05, apron, x, 1.3, 0));
      g.add(box(0.16, 0.05, 0.06, steel, x, 1.68, 0));
    });
    addCasters(g, 0.3, 0.24, 0.05, 0.05);
    const lbl = makeLabel('Protection plombée');
    lbl.position.set(0, 1.95, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Évier inox de pré-désinfection (stérilisation) */
  function buildSteriSink() {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xC4CDD3, roughness: 0.3, metalness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x7C868C, roughness: 0.4, metalness: 0.6 });
    // cabinet under
    g.add(box(1.6, 0.8, 0.6, steel, 0, 0.42, 0));
    g.add(box(1.62, 0.05, 0.62, dark, 0, 0.84, 0));
    // twin basins
    g.add(box(1.5, 0.05, 0.55, steel, 0, 0.86, 0));
    g.add(box(0.65, 0.2, 0.45, dark, -0.38, 0.76, 0));
    g.add(box(0.65, 0.2, 0.45, dark, 0.38, 0.76, 0));
    // faucet + shower
    g.add(cyl(0.02, 0.02, 0.34, steel, 0, 1.04, 0, 12));
    g.add(box(0.02, 0.02, 0.2, steel, 0, 1.2, -0.1));
    g.add(tube(0.015, 0.5, steel, 0.0, 1.05, 0.18));
    // backsplash
    g.add(box(1.6, 0.3, 0.03, steel, 0, 1.0, -0.29));
    const lbl = makeLabel('Poste de pré-désinfection');
    lbl.position.set(0, 1.6, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Armoire vitrée à linge/instruments stériles */
  function buildSteriCabinet() {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xC9D2D8, roughness: 0.3, metalness: 0.8 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xC7E0EA, roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.34 });
    g.add(box(1.1, 1.9, 0.55, steel, 0, 1.0, 0));
    // glass doors
    g.add(box(0.5, 1.3, 0.02, glass, -0.27, 1.15, 0.285));
    g.add(box(0.5, 1.3, 0.02, glass, 0.27, 1.15, 0.285));
    g.add(box(0.03, 1.34, 0.03, steel, 0, 1.15, 0.29));
    g.add(box(0.08, 0.03, 0.03, steel, 0.06, 1.15, 0.31));
    // shelves + LED strip
    for (let i = 0; i < 4; i++) g.add(box(1.0, 0.02, 0.45, steel, 0, 0.7 + i * 0.35, 0));
    g.add(box(0.9, 0.02, 0.04, MAT.led, 0, 1.8, 0.26));
    // socle + casters
    g.add(box(1.06, 0.06, 0.5, MAT.base, 0, 0.06, 0));
    addCasters(g, 0.48, 0.22, 0.05, 0.055);
    const lbl = makeLabel('Armoire à linge stérile');
    lbl.position.set(0, 2.1, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Lit d'hôpital manuel Saikang A048 (manivelles, matelas bleu) */
  function buildHospitalBedA048() {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xE9EBED, roughness: 0.4, metalness: 0.15 });
    const padMat = new THREE.MeshStandardMaterial({ color: 0x2C6FB0, roughness: 0.88 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xB9C3C9, roughness: 0.32, metalness: 0.7 });
    // 4-section mattress
    g.add(box(0.9, 0.14, 2.0, padMat, 0, 0.66, 0));
    g.add(box(0.92, 0.04, 2.04, frameMat, 0, 0.58, 0));
    // head/foot boards
    g.add(box(0.94, 0.34, 0.06, frameMat, 0, 0.82, -1.0));
    g.add(box(0.94, 0.3, 0.06, frameMat, 0, 0.8, 1.0));
    // 4 side rails
    [-1, 1].forEach(function (sx) {
      [0.55, -0.55].forEach(function (sz) {
        g.add(box(0.04, 0.28, 0.5, frameMat, sx * 0.46, 0.86, sz));
      });
    });
    // legs + frame
    [[-0.44, -0.9], [0.44, -0.9], [-0.44, 0.9], [0.44, 0.9]].forEach(function (p) {
      g.add(box(0.05, 0.56, 0.05, steel, p[0], 0.3, p[1]));
    });
    g.add(box(0.9, 0.05, 0.05, steel, 0, 0.06, -0.9));
    g.add(box(0.9, 0.05, 0.05, steel, 0, 0.06, 0.9));
    // manual cranks
    [[-0.5, -0.4], [0.5, 0.4]].forEach(function (p) {
      const crank = cyl(0.02, 0.02, 0.22, steel, p[0] * 1.05, 0.45, p[1], 10);
      g.add(crank);
      g.add(box(0.1, 0.02, 0.02, MAT.red, p[0] * 1.12, 0.45, p[1]));
    });
    addCasters(g, 0.44, 0.9, 0.08, 0.075);
    const lbl = makeLabel("Lit d'hôpital A048");
    lbl.position.set(0, 1.15, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Table de chevet Saikang SKB2A10 */
  function buildBedsideCabinet() {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0xEAEDEF, roughness: 0.4, metalness: 0.1 });
    const top = new THREE.MeshStandardMaterial({ color: 0xD3DDE1, roughness: 0.35, metalness: 0.2 });
    g.add(roundedBox(0.5, 0.68, 0.44, 0.03, body, 0, 0.42, 0));
    g.add(box(0.54, 0.04, 0.48, top, 0, 0.78, 0));
    // drawer
    g.add(box(0.44, 0.14, 0.02, top, 0, 0.66, 0.23));
    g.add(box(0.16, 0.02, 0.03, MAT.steel, 0, 0.66, 0.25));
    // door with handle
    g.add(box(0.42, 0.36, 0.02, body, 0, 0.32, 0.23));
    g.add(box(0.03, 0.12, 0.03, MAT.steel, 0.16, 0.32, 0.25));
    // foldable meal tray
    const tray = box(0.5, 0.03, 0.34, top, 0.45, 0.86, 0);
    g.add(tray);
    g.add(box(0.04, 0.04, 0.3, MAT.steel, 0.55, 0.83, 0));
    addCasters(g, 0.2, 0.17, 0.05, 0.045);
    const lbl = makeLabel('Table de chevet SKB2A10');
    lbl.position.set(0, 1.05, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Banc de soins Saikang SKB039D (dossier rouge) */
  function buildChairSKB039D() {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xDDD5CE, roughness: 0.45, metalness: 0.2 });
    const padMat = new THREE.MeshStandardMaterial({ color: 0x9E2B22, roughness: 0.85 });
    // seat
    g.add(roundedBox(0.56, 0.12, 0.66, 0.04, padMat, 0, 0.55, 0.1));
    g.add(box(0.58, 0.05, 0.7, frameMat, 0, 0.47, 0.1));
    // backrest reclined
    const back = roundedBox(0.54, 0.12, 0.7, 0.04, padMat, 0, 0.8, -0.4);
    back.rotation.x = -0.55; g.add(back);
    // frame legs
    [[-0.24, 0.35], [0.24, 0.35], [-0.24, -0.2], [0.24, -0.2]].forEach(function (p) {
      g.add(box(0.04, 0.45, 0.04, frameMat, p[0], 0.24, p[1]));
    });
    // side guard rails
    g.add(box(0.05, 0.05, 0.6, frameMat, -0.3, 0.62, 0.1));
    g.add(box(0.05, 0.05, 0.6, frameMat, 0.3, 0.62, 0.1));
    g.add(box(0.05, 0.2, 0.05, frameMat, -0.3, 0.72, -0.2));
    g.add(box(0.05, 0.2, 0.05, frameMat, 0.3, 0.72, -0.2));
    addCasters(g, 0.24, 0.3, 0.05, 0.05);
    const lbl = makeLabel('Banc de soins SKB039D');
    lbl.position.set(0, 1.1, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Paravent / séparation Saikang SKB041 (3 panneaux bleus) */
  function buildScreenSKB041() {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xC9D2D8, roughness: 0.35, metalness: 0.6 });
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x2C6FB0, roughness: 0.9 });
    const a = 0.9;
    for (let i = 0; i < 3; i++) {
      const px = new THREE.Group();
      const ang = (i - 1) * 0.55;
      px.rotation.y = ang;
      px.add(box(a, 1.2, 0.05, panelMat, 0, 1.0, 0));
      px.add(box(a, 0.06, 0.07, frameMat, 0, 1.62, 0));
      px.add(box(0.05, 1.2, 0.05, frameMat, -a / 2, 1.0, 0));
      px.add(box(0.05, 1.2, 0.05, frameMat, a / 2, 1.0, 0));
      addCasters(px, (a / 2 - 0.1), 0.0, 0.05, 0.04);
      g.add(px);
    }
    const lbl = makeLabel('Paravent de séparation');
    lbl.position.set(0, 1.85, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Tabouret de soins à 5 roulettes */
  function buildExamStool() {
    const g = new THREE.Group();
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x2C6FB0, roughness: 0.85 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xB9C3C9, roughness: 0.32, metalness: 0.8 });
    starBase(g, 5, 0.24, 0.025);
    addCasters(g, 0.22, 0.22, 0.05, 0.04);
    g.add(cyl(0.028, 0.028, 0.42, steel, 0, 0.28, 0, 14));
    g.add(cyl(0.035, 0.035, 0.08, steel, 0, 0.5, 0, 14));
    g.add(roundedBox(0.34, 0.08, 0.34, 0.04, seatMat, 0, 0.56, 0));
    // ring footrest
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.015, 8, 24), steel);
    ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.28, 0); g.add(ring);
    const lbl = makeLabel('Tabouret de soins');
    lbl.position.set(0, 0.85, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Chariot d'urgence / de réanimation (crash cart) — 5 tiroirs */
  function buildCrashCart() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xE9EBED, roughness: 0.4, metalness: 0.1 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xD23B2E, roughness: 0.45, metalness: 0.12 });
    // 4 posts
    const legs = [[-0.32, -0.24], [0.32, -0.24], [-0.32, 0.24], [0.32, 0.24]];
    legs.forEach(function (p) { g.add(box(0.03, 0.9, 0.03, MAT.steel, p[0], 0.5, p[1])); });
    // top work surface with rail
    g.add(box(0.7, 0.04, 0.52, bodyMat, 0, 0.96, 0));
    g.add(box(0.7, 0.05, 0.025, MAT.steel, 0, 0.97, 0.26));
    g.add(box(0.7, 0.05, 0.025, MAT.steel, 0, 0.97, -0.26));
    // 5-drawer body
    g.add(box(0.56, 0.56, 0.44, bodyMat, 0, 0.62, 0));
    for (let i = 0; i < 5; i++) {
      const dy = 0.86 - i * 0.11;
      g.add(box(0.53, 0.096, 0.01, accentMat, 0, dy - 0.03, 0.223));
      g.add(box(0.16, 0.018, 0.018, MAT.steel, 0, dy - 0.022, 0.232));
      g.add(box(0.05, 0.02, 0.005, MAT.light, 0.2, dy - 0.03, 0.229));
    }
    // defib/monitor shelf on top
    g.add(box(0.3, 0.18, 0.02, MAT.dark, -0.05, 1.12, 0));
    g.add(box(0.16, 0.12, 0.14, bodyMat, 0.22, 1.07, 0.02));
    // push handle + basket on side
    g.add(box(0.6, 0.03, 0.03, MAT.steel, 0, 1.06, -0.28));
    g.add(box(0.03, 0.12, 0.03, MAT.steel, -0.28, 1.0, -0.28));
    g.add(box(0.03, 0.12, 0.03, MAT.steel, 0.28, 1.0, -0.28));
    g.add(box(0.06, 0.24, 0.4, MAT.light, 0.35, 0.55, 0));
    // casters
    addCasters(g, 0.32, 0.24, 0.05, 0.05);
    const lbl = makeLabel("Chariot d'urgence");
    lbl.position.set(0, 1.35, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* Colonne murale de gaz médicaux (O2 / Air / Vide) + prises */
  function buildGasPanel() {
    const g = new THREE.Group();
    // recessed wall panel
    g.add(box(0.7, 0.42, 0.14, MAT.light, 0, 1.5, 0));
    g.add(box(0.72, 0.03, 0.16, MAT.steel, 0, 1.72, 0));
    // three gas outlets color-coded (O2 white, Air black/white, Vacuum yellow)
    const colors = [0xF1F4F5, 0x2B3238, 0xD3A02C];
    [-0.22, 0, 0.22].forEach(function (dx, i) {
      const mat = new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.4, metalness: 0.3 });
      g.add(cyl(0.045, 0.045, 0.05, mat, dx, 1.52, 0.09, 16));
      g.add(cyl(0.028, 0.028, 0.06, MAT.steel, dx, 1.52, 0.1, 14));
      // label plate
      const names = ['O₂', 'AIR', 'VIDE'];
      const lmat = new THREE.MeshStandardMaterial({ color: colors[i] === 0x2B3238 ? 0xE9EBED : 0x2B3238, roughness: 0.5 });
      g.add(box(0.12, 0.06, 0.005, lmat, dx, 1.62, 0.075));
    });
    // pressure gauges row
    [-0.24, 0, 0.24].forEach(function (dx) {
      g.add(cyl(0.03, 0.03, 0.02, MAT.light, dx, 1.4, 0.075, 16));
      g.add(cyl(0.024, 0.024, 0.005, MAT.dark, dx, 1.4, 0.086, 16));
    });
    // flexible hoses hanging down
    g.add(tube(0.007, 0.5, MAT.green, -0.22, 1.15, 0.12));
    g.add(tube(0.007, 0.5, MAT.light, 0, 1.15, 0.12));
    g.add(tube(0.007, 0.5, MAT.yellow, 0.22, 1.15, 0.12));
    const lbl = makeLabel('Colonne gaz médicaux');
    lbl.position.set(0, 1.95, 0);
    g.add(lbl); g.userData.label = lbl;
    return g;
  }

  /* ----------------------------------------------------------
     ROOM PROPS
     ---------------------------------------------------------- */
  function buildRoomProps() {
    const g = new THREE.Group();
    const hw = 3.5, hd = 3;

    // X-ray viewer (negatoscope) on left wall
    const vw = new THREE.Group();
    vw.position.set(-hw + 0.06, 1.62, -0.95);
    vw.add(box(0.06, 0.76, 0.62, MAT.light, 0, 0, 0));
    const xrTex = makeXrayTexture();
    const filmMat = new THREE.MeshStandardMaterial({
      map: xrTex, emissiveMap: xrTex, emissive: 0xFFFFFF, emissiveIntensity: 0.5,
      roughness: 0.45, metalness: 0.05
    });
    const film = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.64), filmMat);
    film.rotation.y = Math.PI / 2;
    film.position.set(0.035, 0, 0);
    vw.add(film);
    vw.add(box(0.012, 0.1, 0.5, MAT.light, 0.045, -0.33, 0));
    g.add(vw);

    // supply cabinet on left wall
    const cab = new THREE.Group();
    cab.position.set(-hw + 0.24, 0, -2.15);
    cab.add(box(0.34, 1.75, 0.95, MAT.light, 0, 0.9, 0));
    cab.add(box(0.36, 0.03, 0.97, MAT.steel, 0, 1.79, 0));
    cab.add(box(0.36, 0.04, 0.97, MAT.dark, 0, 0.03, 0));
    [-0.235, 0.235].forEach(function (z) {
      cab.add(box(0.02, 1.5, 0.43, MAT.white, 0.18, 0.98, z));
      cab.add(box(0.012, 1.22, 0.32, MAT.glass, 0.193, 1.02, z));
      cab.add(cyl(0.009, 0.009, 0.18, MAT.steel, 0.205, 1.05, z + (z < 0 ? 0.16 : -0.16), 8));
    });
    [0.62, 0.95, 1.28].forEach(function (y) {
      cab.add(box(0.28, 0.02, 0.9, MAT.light, 0, y, 0));
    });
    g.add(cab);
    addShadowPatch(g, 0.5, 1.15, -hw + 0.24, -2.15, 0.5);

    // glove dispenser on back wall
    g.add(box(0.27, 0.14, 0.09, MAT.white, 2.55, 1.48, -hd + 0.06));
    g.add(box(0.2, 0.035, 0.012, MAT.dark, 2.55, 1.45, -hd + 0.108));

    // kick bucket (waste bin) near the door
    g.add(cyl(0.17, 0.15, 0.42, MAT.steel, 2.9, 0.22, 2.3, 20));
    g.add(cyl(0.175, 0.175, 0.05, MAT.light, 2.9, 0.455, 2.3, 20));
    g.add(box(0.09, 0.025, 0.05, MAT.dark, 2.9, 0.035, 2.14));
    addShadowPatch(g, 0.55, 0.55, 2.9, 2.3, 0.55);

    // step stool near the right wall
    [-1, 1].forEach(function (s) {
      g.add(box(0.02, 0.33, 0.42, MAT.steel, 3.24 + s * 0.17, 0.165, 0.62));
    });
    g.add(box(0.36, 0.03, 0.42, MAT.steel, 3.24, 0.14, 0.62));
    g.add(box(0.36, 0.03, 0.2, MAT.steel, 3.24, 0.31, 0.52));
    addShadowPatch(g, 0.55, 0.6, 3.24, 0.62, 0.5);

    // sterile back table with draped instruments
    const bt = new THREE.Group();
    bt.position.set(2.55, 0, -2.35);
    legsAt(bt, 0.28, 0.48, 0.86);
    bt.add(box(0.6, 0.02, 0.9, MAT.light, 0, 0.34, 0));
    bt.add(box(0.7, 0.03, 1.2, MAT.steel, 0, 0.86, 0));
    bt.add(box(0.74, 0.02, 1.26, MAT.drape, 0, 0.885, 0));
    bt.add(box(0.02, 0.28, 1.26, MAT.drape2, -0.36, 0.75, 0));
    bt.add(box(0.02, 0.28, 1.26, MAT.drape2, 0.36, 0.75, 0));
    bt.add(box(0.74, 0.28, 0.02, MAT.drape2, 0, 0.75, -0.63));
    bt.add(box(0.74, 0.28, 0.02, MAT.drape2, 0, 0.75, 0.63));
    bt.add(box(0.36, 0.02, 0.64, MAT.steel, 0.05, 0.9, 0.05));
    for (let i = 0; i < 5; i++) {
      bt.add(box(0.012, 0.008, 0.2, MAT.steel, -0.09 + i * 0.045, 0.912, 0.05 + i * 0.015));
    }
    g.add(bt);
    addShadowPatch(g, 1.5, 1.6, 2.55, -2.35, 0.55);

    // ceiling air diffuser
    const grilleMat = new THREE.MeshStandardMaterial({ color: 0x96A2A8, roughness: 0.55, metalness: 0.45 });
    g.add(box(0.62, 0.02, 0.62, grilleMat, -2.5, 2.985, 2.1));
    for (let i = 0; i < 7; i++) {
      g.add(box(0.56, 0.012, 0.03, MAT.dark, -2.5, 2.972, 1.9 + i * 0.07));
    }

    return g;
  }

  /* ----------------------------------------------------------
     BUILD ROOM
     ---------------------------------------------------------- */
  function buildBlocOperatoire() {
    const group = new THREE.Group();
    const objects = [];
    const waypoints = [];

    group.add(buildRoomShell(7, 6, 3));
    group.add(buildRoomProps());

    ITEMS.forEach(function (item) {
      const obj = item.build();
      obj.position.set(item.pos[0], item.pos[1], item.pos[2]);
      obj.rotation.y = item.rot || 0;
      group.add(obj);
      addContactShadow(group, obj, item.pos[0], item.pos[2]);
      objects.push(obj);
    });

    // floor cables to wall outlets
    addFloorCable(group, [[-2.35, 0.02, -0.55], [-2.6, 0.02, -1.2], [-2.3, 0.025, -2.1], [-1.9, 0.04, -2.9]]);
    addFloorCable(group, [[-2.35, 0.02, -1.5], [-2.0, 0.02, -2.05], [-1.6, 0.03, -2.85]]);
    addFloorCable(group, [[2.05, 0.02, -0.6], [2.45, 0.02, -1.3], [2.5, 0.03, -2.35], [2.16, 0.95, -2.9]]);
    addFloorCable(group, [[-2.75, 0.02, -2.2], [-3.05, 0.02, -2.55], [-3.3, 0.06, -2.82]]);
    addFloorCable(group, [[-2.05, 0.02, 0.55], [-2.6, 0.02, 1.1], [-3.2, 0.04, 1.05]]);

    // lights
    const dir = new THREE.DirectionalLight(0xFFF9F0, 0.55);
    dir.position.set(2.5, 5, 3);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -5; dir.shadow.camera.right = 5;
    dir.shadow.camera.top = 5; dir.shadow.camera.bottom = -5;
    dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 16;
    dir.shadow.bias = -0.0004;
    group.add(dir);

    const surg = new THREE.SpotLight(0xFFF4E6, 1.9, 8, Math.PI / 5, 0.55, 1.3);
    surg.position.set(0, 2.5, -1.2);
    surg.target.position.set(0, 0.9, -0.1);
    surg.castShadow = true;
    surg.shadow.mapSize.set(1024, 1024);
    group.add(surg);
    group.add(surg.target);

    const amb1 = new THREE.PointLight(0xE4F3FF, 0.22, 8);
    amb1.position.set(-1.9, 2.6, 1.2); group.add(amb1);
    const amb2 = new THREE.PointLight(0xE4F3FF, 0.22, 8);
    amb2.position.set(1.9, 2.6, 1.2); group.add(amb2);

    // waypoints
    waypoints.push({
      pos: [2.8, 1.85, 2.95], look: [0, 0.95, -0.5],
      data: {
        title: "Vue d'ensemble du bloc", model: "Salle d'opération complète",
        desc: "Un bloc opératoire équipé et installé. Tournez dans la salle, cliquez sur un équipement pour consulter sa fiche technique.",
        specs: ['11 équipements essentiels', 'Anesthésie + monitorage', 'Éclairage scialytique', 'Électrochirurgie', 'Instrumentation stérile']
      }
    });

    ITEMS.forEach(function (item) {
      waypoints.push({
        pos: item.cam, look: item.look, data: item.wp
      });
    });

    return { group: group, objects: objects, waypoints: waypoints };
  }

  /* ----------------------------------------------------------
     ROOM 2 — ANESTHÉSIE-RÉANIMATION
     ---------------------------------------------------------- */
  const ROOM2_ITEMS = [
    {
      id: 'bed', build: buildHospitalBed, pos: [0, 0, 0], rot: 0,
      cam: [2.1, 1.7, 2.6], look: [0, 0.7, 0],
      wp: {
        title: "Lit d'hôpital électrique", model: 'Saikang D8D',
        desc: "Lit médicalisé électrique Saikang D8D pour la surveillance et la réanimation du patient. Positionnement motorisé tête/jambes, hauteur réglable et barrières escamotables.",
        specs: ['4 sections motorisées indépendantes', 'Hauteur 350–800 mm électrique', 'Barrières escamotables 4 points', 'Charge utile 250 kg', 'Roulettes Ø125 à frein central', 'Télécommande patient + infirmier', 'Têtière / pied ABS amovibles', 'CPR release + rail accessoires']
      }
    },
    {
      id: 'vent', build: buildVentilatorC6, pos: [-2.2, 0, -1.4], rot: Math.PI / 2,
      cam: [-0.5, 1.75, -1.0], look: [-2.2, 1.1, -1.4],
      wp: {
        title: 'Ventilateur de réanimation', model: 'Hamilton C6',
        desc: "Ventilateur de soins intensifs Hamilton C6 : modes invasifs et non invasifs haut de gamme, adulte, pédiatrie et néonatologie, avec écran tactile couleur.",
        specs: ['Turbine intégrée sans air comprimé', 'Modes VCV, PCV, PSV, SIMV, NIV, CPAP, ASV', 'Volume courant 2–2 000 mL', 'Fréquence 1–150 bpm', 'FiO₂ 21–100%', 'Écran tactile 17" · 1920 × 1200 px', 'Unité 360 × 250 × 394 mm · moniteur 423 × 250 × 415 mm', 'Chariot 640 × 560 × 1400 mm · 46 kg']
      }
    },
    {
      id: 'monitor', build: buildMonitor, pos: [-1.4, 0, -2.35], rot: Math.PI / 2,
      cam: [0.2, 1.7, -1.7], look: [-1.4, 1.4, -2.35],
      wp: {
        title: 'Moniteur multiparamétrique', model: 'EDAN Elite V',
        desc: "Surveillance en temps réel des constantes vitales du patient réanimé. Alarmes intelligentes et courbes haute résolution.",
        specs: ['ECG 12 dérivations', 'SpO₂ Nellcor / Masimo', 'NIBP 30–270 mmHg', 'EtCO₂ main-stream / sidestream', '2 sondes de température', 'Écran 12,1" TFT couleur', 'Mémoire > 240 h', 'Wi-Fi, Ethernet, USB']
      }
    },
    {
      id: 'syringe', build: buildMedrenaSyringePump, pos: [-2.35, 0, 0.9], rot: Math.PI / 2,
      cam: [-0.8, 1.7, 1.3], look: [-2.35, 1.15, 0.9],
      wp: {
        title: 'Pousse-seringues', model: 'Medrena Unifusion SP50',
        desc: "Pousse-seringues Medrena Unifusion SP50 : injection précise des sédatifs, analgésiques et catécholamines, sur pied à perfusion pour administration continue.",
        specs: ['Débit 0,1–1 200 mL/h', 'Modes volume, poids, µg/kg/min', 'Seringues 5/10/20/30/50(60) mL', 'Batterie longue durée', 'Anti-occlusion + purge air', 'Écran LCD + touches rouge/verte', 'Alarmes multi-niveaux', 'CE · ISO 60601-1']
      }
    },
    {
      id: 'infusion', build: buildInfusionPump, pos: [-1.5, 0, 1.35], rot: Math.PI / 2,
      cam: [0.3, 1.7, 1.7], look: [-1.5, 1.1, 1.35],
      wp: {
        title: 'Pompe à perfusion volumétrique', model: 'Perfuseur volumétrique',
        desc: "Perfusion volumétrique contrôlée des solutés, antibiotiques et nutrition. Débit régulier et alarmes de fin de perfusion.",
        specs: ['Débit 1–999 mL/h', 'Précision ±5%', 'Volume à perfuser (VTBI)', 'Mode KVO automatique', 'Écran LCD + touches', 'Détection occlusion & air', 'Batterie > 4 h', 'CE · ISO 60601-1']
      }
    },
    {
      id: 'defib', build: buildDefibrillator, pos: [1.95, 0, -1.9], rot: -Math.PI / 3,
      cam: [0.9, 1.6, -0.9], look: [1.95, 1.0, -1.9],
      wp: {
        title: 'Compresseur thoracique automatique', model: 'Amoul E6',
        desc: "Compresseur thoracique mécanique Amoul E6 pour la réanimation cardio-pulmonaire. Assure des compressions thoraciques constantes, précises et sans interruption, optimisant la circulation coronaire et cérébrale en situation d'arrêt cardiaque.",
        specs: ['Compressons automatiques à fréquence/résolution contrôlées', 'Positionnement par ventouse/plateau thoracique', 'Réduction de la fatigue du réanimateur', 'Utilisable avec défibrillation simultanée', 'Compact sur base roulante', 'Démarrage rapide en urgence', 'Adapté SMUR / déchoquage / réanimation', 'CE · Conforme normes RCP']
      }
    },
    {
      id: 'suction', build: buildSuction, pos: [0.95, 0, -2.0], rot: -Math.PI / 4,
      cam: [1.85, 1.1, -1.35], look: [0.95, 0.42, -2.0],
      wp: {
        title: 'Aspirateur de mucosités', model: 'Aspiration médicale',
        desc: "Aspiration des sécrétions bronchiques et gastriques. Régulation du vide, pots collecteurs stérilisables, usage continu en réanimation.",
        specs: ['Débit > 40 L/min', 'Vide 0–0,8 bar réglable', '2 pots collecteurs 2 L', 'Filtre antibactérien', 'Usage continu 24/24', 'Bruit < 52 dB(A)', 'Alimentation 220–240 V', 'CE · ISO 10079-1']
      }
    },
    {
      id: 'ambu', build: buildAmbuBag, pos: [-3.4, 0, 2.3], rot: Math.PI / 2,
      cam: [-2.3, 1.6, 2.5], look: [-3.4, 1.25, 2.3],
      wp: {
        title: 'Ballon auto-remplisseur', model: 'Respirateur manuel (Ambu)',
        desc: "Ventilation manuelle d'urgence du patient. Ballon auto-remplisseur avec valve unidirectionnelle, masque et réservoir d'O₂.",
        specs: ['Volume 1 600 mL (adulte)', 'Valve patient unidirectionnelle', 'Réservoir O₂ 2,6 L', 'Masque facial silicone taille 4-5', 'Raccord standard 15/22 mm', 'Compatible avec O₂ mural', 'Silicone stérilisable', 'CE · ISO 10651-4']
      }
    },
    {
      id: 'overbed', build: buildOverbedTable, pos: [2.6, 0, 0.9], rot: -Math.PI / 2,
      cam: [1.6, 1.4, 1.6], look: [2.6, 0.9, 0.9],
      wp: {
        title: 'Table de chevet / overbed', model: 'Table à hauteur variable',
        desc: "Table repas roulante à hauteur et inclinaison réglables, se glissant sous le lit. Support des effets du patient et du matériel.",
        specs: ['Plateau 660 × 420 mm', 'Hauteur réglable par colonne', 'Inclinaison du plateau', 'Base en C pour glisser sous le lit', 'Roulettes à frein', 'Structure acier revêtu', 'Nettoyage facile', 'Charge utile 20 kg']
      }
    },
    {
      id: 'cart', build: buildCrashCart, pos: [3.0, 0, -1.4], rot: -Math.PI / 2,
      cam: [1.9, 1.6, -1.0], look: [3.0, 0.95, -1.4],
      wp: {
        title: "Chariot d'urgence", model: 'Chariot de réanimation',
        desc: "Chariot de réanimation et d'urgence (crash cart) : médicaments, matériel d'intubation et défibrillateur, mobilité immédiate au chevet.",
        specs: ['5 tiroirs sécurisés', 'Code couleur par tiroir', 'Plateau supérieur pour moniteur', 'Rail + panier accessoires', 'Roulettes à frein Ø125', 'Corps ABS nettoyable', 'Scellés de sécurité', 'Charge utile 60 kg']
      }
    },
    {
      id: 'gas', build: buildGasPanel, pos: [-3.45, 0, -0.2], rot: Math.PI / 2,
      cam: [-2.4, 1.75, -0.2], look: [-3.45, 1.5, -0.2],
      wp: {
        title: 'Colonne de gaz médicaux', model: 'Panneau O₂ · Air · Vide',
        desc: "Colonne murale encastrée distribuant les gaz médicaux et le vide au poste de soins. Prises normalisées à sécurité de raccordement.",
        specs: ['Prises O₂, Air médical, Vide', 'Détrompeur par gaz (non interchangeables)', 'Manomètres de pression', 'Flexibles color-codés', 'Conforme NF S90-116', 'Débit jusqu\'à 60 L/min', 'Test fiche IS 13485', 'IEC 60601-1']
      }
    },
    {
      id: 'stretcher', build: buildStretcher, pos: [2.9, 0, 2.1], rot: -Math.PI / 4,
      cam: [1.6, 1.7, 3.0], look: [2.9, 0.85, 2.1],
      wp: {
        title: 'Brancard / chariot de transport', model: 'Saikang SKB041-10',
        desc: "Brancard Saikang SKB041-10 à hauteur variable, pour le transport du patient depuis le bloc vers la chambre de réanimation. Matelas bleu, barrières repliables.",
        specs: ['Matelas bleu épais', 'Hauteur réglable à manivelle', 'Barrières latérales repliables', '4 roulettes Ø150 + freins', 'Support perfusion + O₂ intégré', 'Structure acier revêtu', 'Charge utile 180 kg', 'CE · ISO 13485']
      }
    }
  ];

  function buildAnesthesieReanimation() {
    const group = new THREE.Group();
    const objects = [];
    const waypoints = [];

    group.add(buildRoomShell(8, 6, 3));

    ROOM2_ITEMS.forEach(function (item) {
      const obj = item.build();
      obj.position.set(item.pos[0], item.pos[1], item.pos[2]);
      obj.rotation.y = item.rot || 0;
      group.add(obj);
      addContactShadow(group, obj, item.pos[0], item.pos[2]);
      objects.push(obj);
    });

    // floor cables to wall outlets
    addFloorCable(group, [[-2.2, 0.02, -1.4], [-2.9, 0.02, -1.6], [-3.3, 0.05, -1.4]]);
    addFloorCable(group, [[-1.4, 0.02, -2.35], [-2.2, 0.02, -2.6], [-3.0, 0.05, -2.4]]);
    addFloorCable(group, [[1.95, 0.02, -1.9], [2.5, 0.02, -2.2], [3.0, 0.05, -1.9]]);
    addFloorCable(group, [[-2.35, 0.02, 0.9], [-3.0, 0.02, 1.2], [-3.3, 0.04, 0.6]]);

    // ceiling-mounted IV/pendant arm (potence) over the bed
    const pend = new THREE.Group();
    pend.add(box(0.6, 0.08, 0.14, MAT.light, 0, 2.9, -0.7));
    pend.add(cyl(0.03, 0.03, 0.28, MAT.steel, -0.24, 2.72, -0.7, 12));
    const arm = cyl(0.03, 0.03, 1.0, MAT.steel, 0, 2.6, -0.25, 12);
    arm.rotation.x = Math.PI / 2; arm.position.set(-0.24, 2.6, -0.24); pend.add(arm);
    pend.add(box(0.05, 0.04, 0.3, MAT.steel, -0.24, 2.58, 0.24));
    group.add(pend);

    // ceiling air diffuser
    const grilleMat = new THREE.MeshStandardMaterial({ color: 0x96A2A8, roughness: 0.55, metalness: 0.45 });
    group.add(box(0.62, 0.02, 0.62, grilleMat, 1.8, 2.985, 1.8));
    for (let i = 0; i < 7; i++) {
      group.add(box(0.56, 0.012, 0.03, MAT.dark, 1.8, 2.972, 1.6 + i * 0.07));
    }

    // lights
    const dir = new THREE.DirectionalLight(0xFFF9F0, 0.5);
    dir.position.set(2.5, 5, 3);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -5.5; dir.shadow.camera.right = 5.5;
    dir.shadow.camera.top = 5; dir.shadow.camera.bottom = -5;
    dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 16;
    dir.shadow.bias = -0.0004;
    group.add(dir);

    const bedLight = new THREE.SpotLight(0xFFF6EC, 1.2, 8, Math.PI / 4, 0.6, 1.3);
    bedLight.position.set(0, 2.8, 0);
    bedLight.target.position.set(0, 0.7, 0);
    bedLight.castShadow = true;
    bedLight.shadow.mapSize.set(1024, 1024);
    group.add(bedLight); group.add(bedLight.target);

    const amb1 = new THREE.PointLight(0xE4F3FF, 0.24, 9);
    amb1.position.set(-2.2, 2.7, 1.6); group.add(amb1);
    const amb2 = new THREE.PointLight(0xE4F3FF, 0.24, 9);
    amb2.position.set(2.2, 2.7, 1.6); group.add(amb2);

    // waypoints
    waypoints.push({
      pos: [3.2, 1.85, 3.0], look: [0, 0.8, 0],
      data: {
        title: "Vue d'ensemble de la chambre", model: "Chambre d'anesthésie-réanimation",
        desc: "Une chambre d'anesthésie-réanimation standard, équipée pour la surveillance continue et les soins intensifs. Tournez dans la salle et cliquez sur un équipement pour sa fiche technique.",
        specs: ['12 équipements essentiels', 'Lit médicalisé + monitorage', 'Ventilation invasive & manuelle', 'Perfusion & médicaments', 'Défibrillation & aspiration', 'Gaz médicaux muraux']
      }
    });

    ROOM2_ITEMS.forEach(function (item) {
      waypoints.push({ pos: item.cam, look: item.look, data: item.wp });
    });

    return { group: group, objects: objects, waypoints: waypoints };
  }

  /* ----------------------------------------------------------
     ROOM 3 — URGENCES
     ---------------------------------------------------------- */
  const ROOM3_ITEMS = [
    {
      id: 'bed', build: buildAmbulanceStretcher, pos: [0, 0, 0], rot: 0,
      cam: [2.3, 1.8, 2.75], look: [0, 0.8, 0],
      wp: {
        title: "Brancard d'ambulance", model: 'Saikang SKB039F',
        desc: "Brancard d'ambulance Saikang SKB039F en alliage d'aluminium, dépliable et convertible en fauteuil (4 crans) pour l'accueil du patient en urgence. Longueur ajustable et dossier inclinable à 80°.",
        specs: ['Déplié : 1920 × 570 × 825 mm (±10)', 'Plié : 2000 × 570 × 260 mm (±10)', 'Longueur ajustable 1920 / 1300 mm', 'Dossier 0–80° (±5°)', "Alliage d'aluminium", 'Convertible fauteuil 4 crans', 'Charge ≤ 220 kg', 'Manœuvre par 1 seul opérateur']
      }
    },
    {
      id: 'mon-i5', build: buildAmoulI5, pos: [-1.9, 0, -1.6], rot: Math.PI / 2,
      cam: [-0.4, 1.75, -1.1], look: [-1.9, 1.55, -1.6],
      wp: {
        title: 'Moniteur de chevet', model: 'Amoul i5',
        desc: "Moniteur multiparamétrique Amoul i5 à écran tactile : surveillance continue des constantes avec alarmes configurables. Boîtier orange repérable en un coup d'œil.",
        specs: ['ECG 3/5/6 dérivations', 'SpO₂, NIBP, 2×Temp', 'EtCO₂ en option', 'Écran tactile couleur 10"', 'Alarmes 3 niveaux', 'Mémoire tendances 120 h', 'Batterie > 4 h', 'CE · ISO 80601-2-49']
      }
    },
    {
      id: 'mon-i6', build: buildAmoulI6, pos: [-1.9, 0, 0.4], rot: Math.PI / 2,
      cam: [-0.4, 1.75, 0.9], look: [-1.9, 1.55, 0.4],
      wp: {
        title: 'Moniteur multiparamétrique', model: 'Amoul i6',
        desc: "Moniteur Amoul i6, écran tactile grand format pour l'urgence : paramètres vitaux, courbes et calculs de scores cliniques intégrés.",
        specs: ['ECG 12 dérivations', 'SpO₂ Masimo, NIBP, IBP', 'EtCO₂ main-stream', 'Écran tactile 12,1"', 'Calculs NIBP / IBP', 'Réseau filaire + Wi-Fi', 'Mémoire 240 h', 'CE · ISO 80601-2-49']
      }
    },
    {
      id: 'ecg', build: buildECG, pos: [-2.9, 0, 1.8], rot: Math.PI / 2.4,
      cam: [-1.4, 1.7, 2.3], look: [-2.9, 0.95, 1.8],
      wp: {
        title: 'Électrocardiographe', model: 'Contec ECG1200G',
        desc: "Électrocardiographe 12 pistes Contec ECG1200G sur chariot : acquisition et impression simultanée des 12 dérivations pour le diagnostic d'urgence.",
        specs: ['12 dérivations simultanées', 'Vitesses 5/12,5/25/50 mm/s', 'Gains 2,5/5/10/20 mm/mV', 'Impression thermique A4', 'Interprétation auto des tracés', 'Filtres anti-bruit', 'Mémoire jusqu\'à 1000 ECG', 'CE · IEC 60601-2-25']
      }
    },
    {
      id: 'defib-e6', build: buildDefibrillator, pos: [1.8, 0, -1.9], rot: -Math.PI / 3,
      cam: [0.7, 1.6, -0.9], look: [1.8, 1.0, -1.9],
      wp: {
        title: 'Défibrillateur-moniteur', model: 'Amoul CPR E6',
        desc: "Défibrillateur-moniteur Amoul CPR E6 pour la réanimation cardio-pulmonaire avancée : défibrillation manuelle, DEA, cardioversion et monitorage.",
        specs: ['Énergie 1–360 J', 'Modes manuel / DEA / cardio', 'Reconnaissance FV, TV, asystolie', 'Moniteur ECG 3–6 dériv.', 'SpO₂ / EtCO₂ en option', 'Imprimante thermique', 'Batterie amovible', 'CE · IEC 60601-2-4']
      }
    },
    {
      id: 'defib-e8', build: buildDefibrillator, pos: [1.8, 0, -0.2], rot: -Math.PI / 3,
      cam: [0.7, 1.6, 0.8], look: [1.8, 1.0, -0.2],
      wp: {
        title: 'Défibrillateur-moniteur', model: 'Amoul CPR E8',
        desc: "Défibrillateur-moniteur Amoul CPR E8 avec écran large et aide RCP guidée : version enrichie du E6 pour la salle de déchoquage et le SMUR.",
        specs: ['Énergie 1–360 J', 'Modes manuel / DEA / cardio', 'Aide à la RCP en temps réel', 'Moniteur ECG 12 dériv.', 'SpO₂ / EtCO₂ / PNI intégrés', 'Écran tactile 8,4"', 'Batterie > 3 h', 'CE · IEC 60601-2-4']
      }
    },
    {
      id: 'vent', build: buildAmoulT5, pos: [2.9, 0, 1.4], rot: -Math.PI / 2,
      cam: [1.4, 1.75, 1.9], look: [2.9, 1.1, 1.4],
      wp: {
        title: 'Ventilateur de secours', model: 'Amoul T5',
        desc: "Ventilateur de secours Amoul T5 pour la ventilation d'urgence et le transport : turbine autonome, mise en route rapide pour adulte et pédiatrie. Corps sombre, grand écran tactile, colonnes intégrées.",
        specs: ['Turbine sans air comprimé', 'Modes VCV, PCV, PSV, SIMV, CPAP', 'Volume courant 20–1500 mL', 'Compensation fuites', 'Grand écran tactile couleur', 'Monitoring Paw, Vt, débit, Pressions', 'Batterie intégrée', 'Brancard/transport 5 roues', 'CE · IEC 60601-2-12']
      }
    },
    {
      id: 'infusion', build: buildInfusionPump, pos: [-2.7, 0, -0.7], rot: Math.PI / 2,
      cam: [-1.3, 1.7, -0.2], look: [-2.7, 1.1, -0.7],
      wp: {
        title: 'Pompe à perfusion', model: 'Perfuseur volumétrique',
        desc: "Perfusion volumétrique contrôlée pour les traitements d'urgence : solutés, drogues vasoactives et antibiotiques avec débit précis.",
        specs: ['Débit 1–999 mL/h', 'Précision ±5%', 'Volume à perfuser (VTBI)', 'Mode KVO automatique', 'Écran LCD + touches', 'Détection occlusion & air', 'Batterie > 4 h', 'CE · ISO 60601-1']
      }
    },
    {
      id: 'suction', build: buildSuction, pos: [2.8, 0, 2.3], rot: -Math.PI / 2,
      cam: [1.75, 1.15, 2.7], look: [2.8, 0.42, 2.3],
      wp: {
        title: 'Aspirateur de mucosités', model: 'Aspirateur chirurgical 2×2 L',
        desc: "Aspirateur chirurgical double bidon pour le dégagement des voies aériennes en urgence. Vide réglable et haute capacité.",
        specs: ['2 bidons de 2 L', 'Vide 0–0,9 bar', 'Débit 40–60 L/min', 'Trap anti-débordement', 'Roulettes Ø100', 'Batterie/secteur', 'Accessoires stérilisables', 'CE · ISO 10079-1']
      }
    },
    {
      id: 'cart', build: buildCrashCart, pos: [3.0, 0, -0.5], rot: -Math.PI / 2,
      cam: [1.7, 1.6, 0.2], look: [3.0, 1.05, -0.5],
      wp: {
        title: "Chariot d'urgence", model: 'Chariot de réanimation',
        desc: "Chariot d'urgence à 5 tiroirs, plan de travail inox et déchets intégrés. Rassemble les médicaments et le matériel indispensables à l'ACLS.",
        specs: ['5 tiroirs + plan inox', 'Répartition réanimation AC', 'Support défibrillateur', 'Déchets DASRI + ménagers', 'Roulettes Ø125 antifil', 'Seringues / cathéters / aiguilles', 'Panneaux étiquetés', 'CE · ISO 13485']
      }
    },
    {
      id: 'gas', build: buildGasPanel, pos: [-3.45, 0, -0.2], rot: Math.PI / 2,
      cam: [-2.4, 1.75, -0.2], look: [-3.45, 1.5, -0.2],
      wp: {
        title: 'Colonne de gaz médicaux', model: 'Panneau O₂ · Air · Vide',
        desc: "Colonne murale distribuant les gaz médicaux et le vide au poste d'urgence, avec prises à détrompeur par gaz.",
        specs: ['Prises O₂, Air médical, Vide', 'Détrompeur par gaz', 'Manomètres de pression', 'Flexibles color-codés', 'Conforme NF S90-116', 'Débit jusqu\'à 60 L/min', 'Test fiche IS 13485', 'IEC 60601-1']
      }
    },
    {
      id: 'exam', build: buildExamTable, pos: [3.1, 0, 2.2], rot: -Math.PI / 2,
      cam: [1.9, 1.7, 2.7], look: [3.1, 0.9, 2.2],
      wp: {
        title: "Table d'examen", model: 'Saikang SKB041-2',
        desc: "Table d'examen Saikang SKB041-2 à dossier inclinable pour l'auscultation et la pose des actes de petite urgence.",
        specs: ['Dossier inclinable à crémaillère', 'Mousse bleue lavable', 'Support papier d\'examen', '2 rails accessoires inox', 'Structure acier époxy', 'Roulettes Ø100 + freins', 'Charge utile 150 kg', 'CE · ISO 13485']
      }
    }
  ];

  function buildUrgences() {
    const group = new THREE.Group();
    const objects = [];
    const waypoints = [];

    group.add(buildRoomShell(8, 6, 3));

    ROOM3_ITEMS.forEach(function (item) {
      const obj = item.build();
      obj.position.set(item.pos[0], item.pos[1], item.pos[2]);
      obj.rotation.y = item.rot || 0;
      group.add(obj);
      addContactShadow(group, obj, item.pos[0], item.pos[2]);
      objects.push(obj);
    });

    addFloorCable(group, [[-1.9, 0.02, -1.6], [-2.6, 0.02, -1.6], [-3.2, 0.05, -1.4]]);
    addFloorCable(group, [[1.8, 0.02, -1.9], [2.4, 0.02, -2.2], [3.0, 0.05, -1.9]]);
    addFloorCable(group, [[2.9, 0.02, 1.4], [3.2, 0.02, 0.6], [3.4, 0.05, 0.2]]);

    // ceiling pendant over the stretcher
    const pend = new THREE.Group();
    pend.add(box(0.6, 0.08, 0.14, MAT.light, 0, 2.9, 0.6));
    pend.add(cyl(0.03, 0.03, 0.28, MAT.steel, -0.24, 2.72, 0.6, 12));
    const arm = cyl(0.03, 0.03, 1.0, MAT.steel, -0.24, 2.6, 0.1, 12);
    arm.rotation.x = Math.PI / 2; pend.add(arm);
    pend.add(box(0.05, 0.04, 0.3, MAT.steel, -0.24, 2.58, -0.4));
    group.add(pend);

    const dir = new THREE.DirectionalLight(0xFFF9F0, 0.5);
    dir.position.set(2.5, 5, 3);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -5.5; dir.shadow.camera.right = 5.5;
    dir.shadow.camera.top = 5; dir.shadow.camera.bottom = -5;
    dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 16;
    dir.shadow.bias = -0.0004;
    group.add(dir);

    const spot = new THREE.SpotLight(0xFFF6EC, 1.15, 8, Math.PI / 4, 0.6, 1.3);
    spot.position.set(0, 2.8, 0);
    spot.target.position.set(0, 0.85, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    group.add(spot); group.add(spot.target);

    const amb1 = new THREE.PointLight(0xE4F3FF, 0.24, 9);
    amb1.position.set(-2.2, 2.7, 1.8); group.add(amb1);
    const amb2 = new THREE.PointLight(0xE4F3FF, 0.24, 9);
    amb2.position.set(2.2, 2.7, 1.8); group.add(amb2);

    waypoints.push({
      pos: [3.2, 1.85, 3.0], look: [0, 0.85, 0],
      data: {
        title: "Vue d'ensemble des urgences", model: "Salle d'urgences / déchoquage",
        desc: "Une salle d'urgences équipée pour l'accueil et la réanimation du patient : brancard de déchoquage, monitorage, défibrillation et ventilation. Tournez dans la salle et cliquez sur un équipement.",
        specs: ['12 équipements essentiels', 'Déchoquage + monitorage', 'Défibrillation double', 'Ventilation & ECG', 'Perfusion & aspiration', 'Gaz médicaux muraux']
      }
    });

    ROOM3_ITEMS.forEach(function (item) {
      waypoints.push({ pos: item.cam, look: item.look, data: item.wp });
    });

    return { group: group, objects: objects, waypoints: waypoints };
  }

  /* ----------------------------------------------------------
     ROOM 4 — RADIOLOGIE
     ---------------------------------------------------------- */
  const ROOM4_ITEMS = [
    {
      id: 'table', build: buildRadTable, pos: [0, 0, 0], rot: 0,
      cam: [2.0, 1.9, 2.6], look: [0, 0.8, 0],
      wp: {
        title: "Table d'examen radiologique", model: 'Table radiotransparente mobile',
        desc: "Table d'examen à plateau radiotransparent, mobile et à hauteur réglable : permet les clichés et la scopie du patient allongé en position confortable.",
        specs: ['Plateau radiotransparent', 'Hauteur réglable 750–950 mm', 'Course longitudinale ±50 cm', 'Freins sur roulettes Ø125', 'Capacité 200 kg', 'Structure acier inox', 'Accessoires: poignées patient', 'CE · IEC 60601-1']
      }
    },
    {
      id: 'mon-x12', build: buildEdanX12, pos: [-2.0, 0, -1.4], rot: Math.PI / 2,
      cam: [-0.5, 1.75, -0.9], look: [-2.0, 1.55, -1.4],
      wp: {
        title: 'Moniteur de contrôle', model: 'EDAN X12',
        desc: "Moniteur multiparamétrique EDAN X12 pour la surveillance du patient pendant l'examen (constantes, sédation, produits de contraste).",
        specs: ['ECG 12 dérivations', 'SpO₂, NIBP, IBP', 'EtCO₂ en option', 'Écran tactile 12,1"', 'Reconnaissance arythmies', 'Mémoire tendances 240 h', 'Wi-Fi / Ethernet / USB', 'CE · ISO 80601-2-49']
      }
    },
    {
      id: 'mon-9200', build: buildContec9200, pos: [-2.0, 0, 0.5], rot: Math.PI / 2,
      cam: [-0.5, 1.75, 1.0], look: [-2.0, 1.55, 0.5],
      wp: {
        title: 'Moniteur de constantes', model: 'Contec 9200',
        desc: "Moniteur compact Contec 9200 pour le suivi des constantes vitales au poste d'examen radiologique.",
        specs: ['ECG 3/5 dérivations', 'SpO₂, NIBP, Temp', 'Écran TFT couleur', 'Alarmes sonores & visuelles', 'Mémoire tendances', 'Port USB', 'Batterie interne', 'CE · IEC 60601-1']
      }
    },
    {
      id: 'negato', build: buildNegatoscope, pos: [2.7, 0, -1.8], rot: -Math.PI / 2,
      cam: [1.4, 1.9, -0.9], look: [2.7, 1.55, -1.8],
      wp: {
        title: 'Négatoscope / lecteur de plaques', model: 'Négatoscope LED 2 volets',
        desc: "Négatoscope à LED pour la lecture des clichés radiologiques analogiques. Éclairage homogène, basse consommation, faible échauffement.",
        specs: ['2 volets d\'affichage', 'Rétro-éclairage LED', 'Luminance réglable', 'Diffuseur anti-reflets', 'Cadre aluminium', 'Fixation murale/table', 'Basse consommation', 'CE · IEC 60601-1']
      }
    },
    {
      id: 'trolley', build: buildCrashCart, pos: [2.6, 0, 0.6], rot: -Math.PI / 2,
      cam: [1.4, 1.6, 1.1], look: [2.6, 1.05, 0.6],
      wp: {
        title: 'Chariot de préparation', model: 'Chariot inox à tiroirs',
        desc: "Chariot à tiroirs pour la préparation du patient et du matériel (produit de contraste, consommables, protection plombée).",
        specs: ['Plan de travail inox', '5 tiroirs', 'Roulettes Ø125 + freins', 'Structure acier revêtu', 'Bacs amovibles', 'Garde-corps périphérique', 'Nettoyable désinfectable', 'CE · ISO 13485']
      }
    },
    {
      id: 'protect', build: buildLeadApron, pos: [1.4, 0, -2.4], rot: -Math.PI / 2,
      cam: [0.4, 1.75, -1.5], look: [1.4, 1.2, -2.4],
      wp: {
        title: 'Protection plombée', model: 'Porte-tabliers plombés',
        desc: "Support pour tabliers et jupes de plomb : range et suspend les équipements de radioprotection du personnel et du patient.",
        specs: ['Support 4 postes', 'Tabliers + jupes plombés', 'Équivalent 0,35 / 0,5 mm Pb', 'Base lestée sur roulettes', 'Barre inox 304', 'Réglage hauteur', 'Protection thyroïde & gonades', 'CE · EN 61331']
      }
    },
    {
      id: 'gas', build: buildGasBottles, pos: [-3.1, 0, 2.3], rot: Math.PI / 4,
      cam: [-1.9, 1.7, 2.7], look: [-3.1, 1.0, 2.3],
      wp: {
        title: 'Bouteilles de gaz médicaux', model: 'O₂ + Air comprimé',
        desc: "Bouteilles d'oxygène et d'air médical sur chariot, pour la prise en charge d'un patient pendant l'examen.",
        specs: ['Bouteille O₂ (blanc)', 'Bouteille Air (gris/blanc)', 'Détendeurs + manomètres', 'Débitmètre O₂', 'Chariot 4 roulettes', 'Sangles de maintien', 'Conforme TPS/CE', 'IEC 60601-1']
      }
    }
  ];

  function buildRadiologie() {
    const group = new THREE.Group();
    const objects = [];
    const waypoints = [];

    group.add(buildRoomShell(8, 6, 3));

    ROOM4_ITEMS.forEach(function (item) {
      const obj = item.build();
      obj.position.set(item.pos[0], item.pos[1], item.pos[2]);
      obj.rotation.y = item.rot || 0;
      group.add(obj);
      addContactShadow(group, obj, item.pos[0], item.pos[2]);
      objects.push(obj);
    });

    addFloorCable(group, [[-2.0, 0.02, -1.4], [-2.9, 0.02, -1.6], [-3.4, 0.05, -1.5]]);

    // lead-lined observation window on back wall
    group.add(box(1.1, 0.8, 0.04, MAT.glass, 0, 1.7, -2.98));
    group.add(box(1.18, 0.88, 0.03, MAT.dark, 0, 1.7, -2.99));

    const dir = new THREE.DirectionalLight(0xFFFDF6, 0.46);
    dir.position.set(2.5, 5, 3);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -5.5; dir.shadow.camera.right = 5.5;
    dir.shadow.camera.top = 5; dir.shadow.camera.bottom = -5;
    dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 16;
    dir.shadow.bias = -0.0004;
    group.add(dir);

    const spot = new THREE.SpotLight(0xFFF6EC, 1.0, 8, Math.PI / 4, 0.65, 1.3);
    spot.position.set(0, 2.8, 0);
    spot.target.position.set(0, 0.85, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    group.add(spot); group.add(spot.target);

    const amb1 = new THREE.PointLight(0xE4F3FF, 0.26, 9);
    amb1.position.set(-2.2, 2.7, 1.8); group.add(amb1);
    const amb2 = new THREE.PointLight(0xE4F3FF, 0.26, 9);
    amb2.position.set(2.2, 2.7, 1.8); group.add(amb2);

    waypoints.push({
      pos: [3.2, 1.9, 3.0], look: [0, 0.85, 0],
      data: {
        title: "Vue d'ensemble de la radiologie", model: "Salle d'examen radiologique",
        desc: "Une salle d'examen radiologique équipée pour l'accueil, le positionnement et la surveillance du patient, avec protection plombée et lecture des clichés. Tournez dans la salle et cliquez sur un équipement.",
        specs: ['7 équipements', 'Table radiotransparente', 'Monitorage du patient', 'Lecture des clichés', 'Radioprotection plombée', 'Gaz médicaux sur chariot']
      }
    });

    ROOM4_ITEMS.forEach(function (item) {
      waypoints.push({ pos: item.cam, look: item.look, data: item.wp });
    });

    return { group: group, objects: objects, waypoints: waypoints };
  }

  /* ----------------------------------------------------------
     ROOM 5 — STÉRILISATION
     ---------------------------------------------------------- */
  const ROOM5_ITEMS = [
    {
      id: 'autoclave', build: buildAutoclave, pos: [-2.4, 0, -2.1], rot: 0,
      cam: [-0.7, 1.85, -0.9], look: [-2.4, 1.1, -2.1],
      wp: {
        title: 'Stérilisateur (autoclave)', model: 'Autoclave à vapeur de table',
        desc: "Autoclave à vapeur pour la stérilisation des instruments et du linge. Cycles rapides à 121 °C et 134 °C, séchage sous vide.",
        specs: ['Chambre inox 24 L', 'Cycles 121 °C / 134 °C', 'Prévide fractionné + séchage', 'Écran LCD + cycle auto', 'Robinet d\'eau + purge', 'Enregistreur / traçabilité', 'Cuve inox AISI 304', 'CE · EN 13060']
      }
    },
    {
      id: 'autoclave2', build: buildAutoclave, pos: [0.6, 0, -2.1], rot: 0,
      cam: [2.2, 1.85, -0.9], look: [0.6, 1.1, -2.1],
      wp: {
        title: 'Stérilisateur (2e poste)', model: 'Autoclave à vapeur de table',
        desc: "Second autoclave pour la redondance du service de stérilisation et la continuité du flux d'instruments.",
        specs: ['Chambre inox 24 L', 'Cycles 121 °C / 134 °C', 'Prévide fractionné + séchage', 'Écran LCD + cycle auto', 'Enregistreur / traçabilité', 'Cuve inox AISI 304', 'Purge intégrée', 'CE · EN 13060']
      }
    },
    {
      id: 'tray1', build: buildSteriTray, pos: [-0.9, 0, 0.3], rot: Math.PI / 2,
      cam: [0.4, 1.6, 0.6], look: [-0.9, 0.85, 0.3],
      wp: {
        title: 'Bacs de stérilisation', model: 'Bac inox perforé sur support',
        desc: "Bacs inox perforés sur support roulant pour le conditionnement, la manipulation et le tri des instruments stérilisés.",
        specs: ['Bac inox perforé 304', 'Support 2 niveaux inox', 'Roulettes Ø100 + freins', 'Bacs empilables', 'Grille + couvercle amovibles', 'Passivation électrolytique', 'Autoclavable 134 °C', 'CE · ISO 13485']
      }
    },
    {
      id: 'tray2', build: buildSteriTray, pos: [0.9, 0, 0.3], rot: Math.PI / 2,
      cam: [2.2, 1.6, 0.6], look: [0.9, 0.85, 0.3],
      wp: {
        title: 'Bacs de stérilisation', model: 'Bac inox perforé sur support',
        desc: "Second poste de bacs inox pour séparer instruments propres, sales et stériles et fluidifier la marche en avant.",
        specs: ['Bac inox perforé 304', 'Support 2 niveaux inox', 'Roulettes Ø100 + freins', 'Bacs empilables', 'Grille + couvercle amovibles', 'Autoclavable 134 °C', 'Marche en avant respectée', 'CE · ISO 13485']
      }
    },
    {
      id: 'sink', build: buildSteriSink, pos: [3.1, 0, -1.9], rot: -Math.PI / 2,
      cam: [1.7, 1.75, -1.1], look: [3.1, 1.05, -1.9],
      wp: {
        title: 'Poste de pré-désinfection', model: 'Évier inox 2 bacs + bac à tremper',
        desc: "Poste de pré-désinfection et de lavage manuel : bacs inox avec douchette, bac à tremper et écoulement pour la décontamination des instruments.",
        specs: ['Cuve inox AISI 304', 'Douchette flexible', 'Bac à tremper + égouttoir', 'Mitigeur monotrou', 'Écoulement vers siphon', 'Support mural accessoires', 'Nettoyable désinfectable', 'CE · ISO 13485']
      }
    },
    {
      id: 'cart1', build: buildCrashCart, pos: [2.8, 0, 1.4], rot: -Math.PI / 2,
      cam: [1.5, 1.6, 1.8], look: [2.8, 1.05, 1.4],
      wp: {
        title: 'Chariot de transport', model: 'Chariot inox à étagères',
        desc: "Chariot inox pour le transport des bacs d'instruments entre la salle de stérilisation et les blocs.",
        specs: ['3 étagères inox', 'Roulettes Ø125 + freins', 'Structure inox 304', 'Bacs encastrables', 'Rebord de retenue', 'Nettoyable en laveur', 'Passivation électrolytique', 'CE · ISO 13485']
      }
    },
    {
      id: 'cab', build: buildSteriCabinet, pos: [-3.2, 0, 1.7], rot: Math.PI / 2,
      cam: [-1.9, 1.8, 2.2], look: [-3.2, 1.2, 1.7],
      wp: {
        title: 'Armoire à linge stérile', model: 'Armoire inox vitrée',
        desc: "Armoire vitrée pour le stockage du linge et des instruments stérilisés à l'abri de la contamination, en zone propre.",
        specs: ['Caisson inox AISI 304', 'Portes vitrées (repérage rapide)', 'Rayonnages amovibles', 'Éclairage intérieur LED', 'Socle sur roulettes', 'Étanche aux poussières', 'Autoclavable/lessivable', 'CE · ISO 13485']
      }
    }
  ];

  function buildSterilisation() {
    const group = new THREE.Group();
    const objects = [];
    const waypoints = [];

    group.add(buildRoomShell(8, 6, 3));

    ROOM5_ITEMS.forEach(function (item) {
      const obj = item.build();
      obj.position.set(item.pos[0], item.pos[1], item.pos[2]);
      obj.rotation.y = item.rot || 0;
      group.add(obj);
      addContactShadow(group, obj, item.pos[0], item.pos[2]);
      objects.push(obj);
    });

    addFloorCable(group, [[-2.4, 0.02, -2.1], [-3.0, 0.02, -2.4], [-3.4, 0.05, -2.2]]);
    addFloorCable(group, [[0.6, 0.02, -2.1], [1.3, 0.02, -2.4], [1.9, 0.05, -2.2]]);

    // ceiling UV lamp
    const uvMat = new THREE.MeshStandardMaterial({ color: 0x9AA6FF, emissive: 0x6C7BFF, emissiveIntensity: 0.6, roughness: 0.4 });
    group.add(box(1.4, 0.06, 0.16, uvMat, 0, 2.94, -1.4));

    const dir = new THREE.DirectionalLight(0xF2FBFF, 0.5);
    dir.position.set(2.5, 5, 3);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -5.5; dir.shadow.camera.right = 5.5;
    dir.shadow.camera.top = 5; dir.shadow.camera.bottom = -5;
    dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 16;
    dir.shadow.bias = -0.0004;
    group.add(dir);

    const amb1 = new THREE.PointLight(0xE8F4FF, 0.28, 9);
    amb1.position.set(-2.2, 2.7, 1.8); group.add(amb1);
    const amb2 = new THREE.PointLight(0xE8F4FF, 0.28, 9);
    amb2.position.set(2.2, 2.7, 1.8); group.add(amb2);

    waypoints.push({
      pos: [3.3, 1.9, 3.0], look: [0, 0.95, -0.5],
      data: {
        title: "Vue d'ensemble de la stérilisation", model: "Service de stérilisation",
        desc: "La stérilisation centralisée : réception du matériel sale, pré-désinfection, stérilisation à la vapeur puis stockage en zone propre. Tournez dans la salle et cliquez sur un équipement.",
        specs: ['7 équipements', 'Autoclaves double poste', 'Pré-désinfection inox', 'Bacs & chariots inox', 'Marche en avant', 'Armoire à linge stérile']
      }
    });

    ROOM5_ITEMS.forEach(function (item) {
      waypoints.push({ pos: item.cam, look: item.look, data: item.wp });
    });

    return { group: group, objects: objects, waypoints: waypoints };
  }

  /* ----------------------------------------------------------
     ROOM 6 — MOBILIER MÉDICAL
     ---------------------------------------------------------- */
  const ROOM6_ITEMS = [
    {
      id: 'bed-d8d', build: buildHospitalBed, pos: [-1.5, 0, -1.3], rot: 0,
      cam: [0.7, 1.85, 0.55], look: [-1.5, 0.78, -1.3],
      wp: {
        title: 'Lit d\'hôpital électrique', model: 'Saikang D8D',
        desc: "Lit médicalisé électrique Saikang D8D : positionnement motorisé 4 sections, hauteur réglable et barrières escamotables pour la chambre d'hospitalisation.",
        specs: ['4 sections motorisées', 'Hauteur 350–800 mm', 'Barrières escamotables', 'Charge utile 250 kg', 'Roulettes Ø125 frein central', 'Télécommande patient + soignant', 'Têtière / pied ABS', 'CPR release + rails']
      }
    },
    {
      id: 'bed-d8d-2', build: buildHospitalBed, pos: [1.4, 0, -1.3], rot: 0,
      cam: [2.8, 1.85, -0.1], look: [1.4, 0.78, -1.3],
      wp: {
        title: 'Lit d\'hôpital électrique', model: 'Saikang D8D',
        desc: "Lit médicalisé électrique Saikang D8D : positionnement motorisé 4 sections, hauteur réglable et barrières escamotables pour la chambre d'hospitalisation.",
        specs: ['4 sections motorisées', 'Hauteur 350–800 mm', 'Barrières escamotables', 'Charge utile 250 kg', 'Roulettes Ø125 frein central', 'Télécommande patient + soignant', 'Têtière / pied ABS', 'CPR release + rails']
      }
    },
    {
      id: 'cab-b2a10', build: buildBedsideCabinet, pos: [-3.1, 0, 0.4], rot: Math.PI / 2,
      cam: [-1.8, 1.7, 0.9], look: [-3.1, 1.05, 0.4],
      wp: {
        title: 'Table de chevet', model: 'Saikang SKB2A10',
        desc: "Table de chevet Saikang SKB2A10 avec tiroir et porte, plan de travail et tablette repas escamotable, à roulettes.",
        specs: ['Tiroir + porte + niche', 'Tablette repas escamotable', 'Plan ABS lavable', 'Roulettes Ø75', 'Structure acier revêtu', 'Charnières inox', 'Nettoyable désinfectable', 'CE · ISO 13485']
      }
    },
    {
      id: 'overbed', build: buildOverbedTable, pos: [2.8, 0, -0.4], rot: Math.PI / 2,
      cam: [1.6, 1.7, 0.1], look: [2.8, 1.05, -0.4],
      wp: {
        title: 'Table repas sur lit', model: 'Saikang table de lit',
        desc: "Table repas pour lit d'hôpital à plateau inclinable et hauteur réglable, sur base à roulettes glissant sous le lit.",
        specs: ['Plateau inclinable', 'Hauteur réglable', 'Base glissant sous le lit', 'Roulettes Ø50', 'Plateau stratifié lavable', 'Rebord anti-glisse', 'Frein de position', 'CE · ISO 13485']
      }
    },
    {
      id: 'chair', build: buildChairSKB039D, pos: [-1.4, 0, 1.9], rot: Math.PI,
      cam: [0.2, 1.6, 2.9], look: [-1.4, 0.85, 1.9],
      wp: {
        title: 'Banc de soins / fauteuil', model: 'Saikang SKB039D',
        desc: "Banc de soins Saikang SKB039D à dossier inclinable et mousse rouge, pour les soins, examens et la position demi-assise du patient.",
        specs: ['Dossier inclinable', 'Mousse rouge rembourrée', 'Structure acier époxy', 'Garde-corps latéraux', '4 roulettes Ø100 + freins', 'Accessoires sur rails', 'Nettoyable désinfectable', 'CE · ISO 13485']
      }
    },
    {
      id: 'trolley', build: buildInstrumentTrolley, pos: [1.3, 0, 1.9], rot: Math.PI,
      cam: [2.9, 1.65, 2.9], look: [1.3, 0.9, 1.9],
      wp: {
        title: 'Chariot de soins', model: 'Saikang SKR-ET625',
        desc: "Chariot de soins Saikang SKR-ET625 à 5 tiroirs (code couleur), plan inox et rangements latéraux, pour la distribution des soins en chambre.",
        specs: ['5 tiroirs code couleur', 'Plan de travail inox', 'Poubelles DASRI intégrées', 'Plateau + corbeille latérale', 'Roulettes Ø125 antifil', 'Structure acier revêtu', 'Serrure centralisée', 'CE · ISO 13485']
      }
    },
    {
      id: 'screen', build: buildScreenSKB041, pos: [3.0, 0, 1.9], rot: -Math.PI / 2,
      cam: [1.8, 1.7, 2.6], look: [3.0, 1.0, 1.9],
      wp: {
        title: 'Paravent / séparation', model: 'Saikang SKB041',
        desc: "Paravent de séparation Saikang SKB041 à panneaux repliables pour préserver l'intimité du patient au lit.",
        specs: ['3 panneaux articulés', 'Panneaux bleus lavables', 'Roulettes Ø75', 'Structure acier revêtu', 'Déploiement en accordéon', 'Nettoyable désinfectable', 'Hauteur 1 700 mm', 'CE · ISO 13485']
      }
    },
    {
      id: 'stool', build: buildExamStool, pos: [0.0, 0, 2.2], rot: 0,
      cam: [0.0, 1.65, 3.2], look: [0.0, 0.65, 2.2],
      wp: {
        title: 'Tabouret de soins', model: 'Saikang tabouret à 5 roulettes',
        desc: "Tabouret médical réglable à 5 roulettes, assise rembourrée pour les soins au chevet du patient.",
        specs: ['Assise rembourrée bleue', 'Hauteur réglable à gaz', '5 roulettes Ø50', 'Repose-pieds annulaire', 'Base 5 branches', 'Assise désinfectable', 'Charge utile 120 kg', 'CE · ISO 13485']
      }
    },
    {
      id: 'screen2', build: buildScreenSKB041, pos: [-3.0, 0, -1.9], rot: Math.PI / 2,
      cam: [-1.8, 1.7, -1.2], look: [-3.0, 1.0, -1.9],
      wp: {
        title: 'Paravent / séparation', model: 'Saikang SKB041',
        desc: "Paravent supplémentaire pour isoler une zone de soins au sein de la chambre d'hospitalisation.",
        specs: ['3 panneaux articulés', 'Panneaux bleus lavables', 'Roulettes Ø75', 'Structure acier revêtu', 'Déploiement accordéon', 'Hauteur 1 700 mm', 'Nettoyable désinfectable', 'CE · ISO 13485']
      }
    }
  ];

  function buildMobilier() {
    const group = new THREE.Group();
    const objects = [];
    const waypoints = [];

    group.add(buildRoomShell(8, 6, 3));

    ROOM6_ITEMS.forEach(function (item) {
      const obj = item.build();
      obj.position.set(item.pos[0], item.pos[1], item.pos[2]);
      obj.rotation.y = item.rot || 0;
      group.add(obj);
      addContactShadow(group, obj, item.pos[0], item.pos[2]);
      objects.push(obj);
    });

    const dir = new THREE.DirectionalLight(0xFFF9F0, 0.5);
    dir.position.set(2.5, 5, 3);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -5.5; dir.shadow.camera.right = 5.5;
    dir.shadow.camera.top = 5; dir.shadow.camera.bottom = -5;
    dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 16;
    dir.shadow.bias = -0.0004;
    group.add(dir);

    const amb1 = new THREE.PointLight(0xE4F3FF, 0.26, 9);
    amb1.position.set(-2.2, 2.7, 1.8); group.add(amb1);
    const amb2 = new THREE.PointLight(0xE4F3FF, 0.26, 9);
    amb2.position.set(2.2, 2.7, 1.8); group.add(amb2);

    waypoints.push({
      pos: [3.3, 1.9, 3.0], look: [0, 0.85, 0],
      data: {
        title: "Vue d'ensemble du mobilier", model: "Chambre équipée en mobilier médical",
        desc: "Une chambre d'hospitalisation meublée de A à Z avec le mobilier médical MAM : lits, tables de chevet, chariots et cloisons. Tournez dans la salle et cliquez sur chaque meuble.",
        specs: ['9 meubles', '2 lits médicalisés', 'Table de chevet & table repas', 'Banc de soins & tabouret', 'Chariot de soins', 'Paravents de séparation']
      }
    });

    ROOM6_ITEMS.forEach(function (item) {
      waypoints.push({ pos: item.cam, look: item.look, data: item.wp });
    });

    return { group: group, objects: objects, waypoints: waypoints };
  }

  /* ----------------------------------------------------------
     CAMERA / ORBIT
     ---------------------------------------------------------- */
  function initThree() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.66;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0B141A, 1);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0B141A);
    try {
      scene.environment = makeStudioEnvironment();
    } catch (e) {
      console.warn('Environnement IBL indisponible', e);
    }

    camera = new THREE.PerspectiveCamera(52, canvas.clientWidth / canvas.clientHeight, 0.05, 80);

    clock = new THREE.Clock();
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2(-999, -999);

    scene.add(new THREE.AmbientLight(0xFFFFFF, 0.12));
    const hemi = new THREE.HemisphereLight(0xF3FAFF, 0x707C82, 0.26);
    scene.add(hemi);

    updateCameraFromOrbit();
    window.addEventListener('resize', onResize);
    onResize();
  }

  function onResize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function updateCameraFromOrbit() {
    const sp = Math.sin(orbitPhi), cp = Math.cos(orbitPhi);
    const st = Math.sin(orbitTheta), ct = Math.cos(orbitTheta);
    camera.position.set(
      orbitTarget.x + orbitRadius * sp * st,
      orbitTarget.y + orbitRadius * cp,
      orbitTarget.z + orbitRadius * sp * ct
    );
    camera.lookAt(orbitTarget);
  }

  function onPointerDown(e) {
    isDragging = true; mouseMoved = false;
    prevMouse.x = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    prevMouse.y = e.clientY || (e.touches && e.touches[0].clientY) || 0;
    mouseDownPos.x = prevMouse.x; mouseDownPos.y = prevMouse.y;
    canvas.style.cursor = 'grabbing';
  }

  function onPointerMove(e) {
    const cx = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    const cy = e.clientY || (e.touches && e.touches[0].clientY) || 0;
    if (isDragging) {
      const dx = cx - prevMouse.x, dy = cy - prevMouse.y;
      if (Math.abs(cx - mouseDownPos.x) > 4 || Math.abs(cy - mouseDownPos.y) > 4) mouseMoved = true;
      if (mouseMoved) {
        orbitTheta -= dx * 0.005;
        orbitPhi += dy * 0.005;
        orbitPhi = Math.max(0.35, Math.min(1.52, orbitPhi));
        updateCameraFromOrbit();
        camAnim = null; animating = false;
      }
      prevMouse.x = cx; prevMouse.y = cy;
    } else {
      updateHover(cx, cy);
    }
  }

  function onPointerUp(e) {
    isDragging = false;
    canvas.style.cursor = 'default';
    if (!mouseMoved) {
      onCanvasClick(
        e.clientX || (e.changedTouches && e.changedTouches[0].clientX) || 0,
        e.clientY || (e.changedTouches && e.changedTouches[0].clientY) || 0
      );
    }
  }

  function onWheel(e) {
    e.preventDefault();
    orbitRadius += e.deltaY * 0.002;
    orbitRadius = Math.max(1.8, Math.min(14, orbitRadius));
    updateCameraFromOrbit();
    camAnim = null; animating = false;
  }

  function updateHover(cx, cy) {
    if (!currentRoom) return;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((cx - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((cy - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    canvas.style.cursor = raycaster.intersectObjects(currentRoom.objects, true).length > 0 ? 'pointer' : 'default';
  }

  function onCanvasClick(cx, cy) {
    if (!currentRoom) return;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((cx - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((cy - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(currentRoom.objects, true);
    if (hits.length > 0) {
      let clicked = hits[0].object;
      while (clicked.parent && currentRoom.objects.indexOf(clicked) === -1) clicked = clicked.parent;
      const idx = currentRoom.objects.indexOf(clicked);
      if (idx >= 0) { stopAutoPlay(); goToWaypoint(idx + 1, true); }
    } else {
      hideInfoPanel();
    }
  }

  /* ----------------------------------------------------------
     ROOM MANAGER
     ---------------------------------------------------------- */
  function loadRoom(serviceId) {
    const svc = SERVICES.find(function (s) { return s.id === serviceId; });
    if (!svc || !svc.ready) return;

    if (currentRoom) {
      scene.remove(currentRoom.group);
      currentRoom.group.traverse(function (child) {
        // Les ressources partagées du modèle GLB (clone) ne doivent pas être libérées.
        if (child.userData && child.userData.sharedModel) return;
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
    }

    currentRoom = svc.room === 'blocOperatoire' ? buildBlocOperatoire()
                : svc.room === 'anesthesieReanimation' ? buildAnesthesieReanimation()
                : svc.room === 'urgences' ? buildUrgences()
                : svc.room === 'radiologie' ? buildRadiologie()
                : svc.room === 'sterilisation' ? buildSterilisation()
                : svc.room === 'mobilier' ? buildMobilier()
                : null;
    if (currentRoom) scene.add(currentRoom.group);

    currentService = svc;
    tourIndex = 0;
    stopAutoPlay();
    updateTopbar(svc);
    buildTourDots();
    hideInfoPanel();

    if (currentRoom && currentRoom.waypoints.length) goToWaypoint(0, false);
  }

  function updateTopbar(svc) {
    $('#topbarNum').textContent = 'Service ' + svc.num;
    $('#topbarTitle').textContent = svc.label;
    $('#topbarSub').textContent = (currentRoom ? currentRoom.waypoints.length - 1 : 0) + ' équipements à découvrir';
    $('#topbarCount').textContent = currentRoom ? (tourIndex + 1) + ' / ' + currentRoom.waypoints.length : '';
  }

  /* ----------------------------------------------------------
     GUIDED TOUR
     ---------------------------------------------------------- */
  function goToWaypoint(index, animate) {
    if (!currentRoom || !currentRoom.waypoints[index]) return;
    tourIndex = index;
    const wp = currentRoom.waypoints[index];
    const targetPos = new THREE.Vector3(wp.pos[0], wp.pos[1], wp.pos[2]);
    const targetLook = new THREE.Vector3(wp.look[0], wp.look[1], wp.look[2]);

    orbitTarget.copy(targetLook);
    const off = new THREE.Vector3().subVectors(targetPos, targetLook);
    orbitRadius = Math.max(1.8, off.length());
    orbitTheta = Math.atan2(off.x, off.z);
    orbitPhi = Math.acos(Math.max(-1, Math.min(1, off.y / orbitRadius)));

    if (animate !== false) {
      camAnim = {
        fromPos: camera.position.clone(), toPos: targetPos,
        fromLook: getCameraLookTarget(), toLook: targetLook,
        t: 0, dur: 1.2
      };
      animating = true;
    } else {
      camera.position.copy(targetPos);
      camera.lookAt(targetLook);
      updateCameraFromOrbit();
    }

    showInfoPanel(index);
    updateTopbar(currentService);
    updateTourDots();
    highlightLabel(index);
  }

  function getCameraLookTarget() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    return camera.position.clone().add(dir.multiplyScalar(5));
  }

  function nextWaypoint() {
    if (!currentRoom) return;
    goToWaypoint((tourIndex + 1) % currentRoom.waypoints.length, true);
  }
  function prevWaypoint() {
    if (!currentRoom) return;
    goToWaypoint((tourIndex - 1 + currentRoom.waypoints.length) % currentRoom.waypoints.length, true);
  }
  function toggleAutoPlay() { tourPlaying ? stopAutoPlay() : startAutoPlay(); }
  function startAutoPlay() {
    tourPlaying = true; updatePlayButton();
    tourTimer = setInterval(nextWaypoint, 5000);
  }
  function stopAutoPlay() {
    tourPlaying = false; updatePlayButton();
    if (tourTimer) { clearInterval(tourTimer); tourTimer = null; }
  }

  function showInfoPanel(index) {
    const wp = currentRoom && currentRoom.waypoints[index];
    if (!wp) return;
    const d = wp.data;
    $('#infoStep').textContent = 'Étape ' + (index + 1) + ' / ' + currentRoom.waypoints.length;
    $('#infoTitle').textContent = d.title;
    $('#infoModel').textContent = d.model;
    $('#infoDesc').textContent = d.desc;
    const specsEl = $('#infoSpecs');
    specsEl.innerHTML = '';
    d.specs.forEach(function (s) {
      const li = document.createElement('li');
      li.textContent = s;
      specsEl.appendChild(li);
    });
    infoPanel.classList.add('visible');
  }
  function hideInfoPanel() { infoPanel.classList.remove('visible'); }

  function buildTourDots() {
    tourDots.innerHTML = '';
    if (!currentRoom) return;
    currentRoom.waypoints.forEach(function (wp, i) {
      const dot = document.createElement('button');
      dot.className = 'tour-dot' + (i === tourIndex ? ' active' : (i < tourIndex ? ' done' : ''));
      dot.title = wp.data.title;
      dot.addEventListener('click', function () { stopAutoPlay(); goToWaypoint(i, true); });
      tourDots.appendChild(dot);
    });
  }

  function updateTourDots() {
    tourDots.querySelectorAll('.tour-dot').forEach(function (dot, i) {
      dot.className = 'tour-dot' + (i === tourIndex ? ' active' : (i < tourIndex ? ' done' : ''));
    });
  }

  function highlightLabel(activeIndex) {
    if (!currentRoom) return;
    currentRoom.objects.forEach(function (obj, i) {
      const lbl = obj.userData.label;
      if (!lbl) return;
      if (i + 1 === activeIndex) {
        lbl.material.opacity = 1;
        lbl.scale.set(1.1, 0.172, 1);
      } else {
        lbl.material.opacity = 0.45;
        lbl.scale.set(0.78, 0.122, 1);
      }
    });
  }

  function updatePlayButton() {
    const btn = $('#btnPlay');
    if (!btn) return;
    btn.innerHTML = tourPlaying
      ? '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
      : '<svg viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20" fill="currentColor" stroke="none"/></svg>';
  }

  /* ----------------------------------------------------------
     LOOP
     ---------------------------------------------------------- */
  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    if (camAnim && animating) {
      camAnim.t += dt / camAnim.dur;
      if (camAnim.t >= 1) { camAnim.t = 1; animating = false; }
      const t = camAnim.t;
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, ease);
      camera.lookAt(new THREE.Vector3().lerpVectors(camAnim.fromLook, camAnim.toLook, ease));
    }

    if (currentRoom) {
      currentRoom.objects.forEach(function (obj) {
        const lbl = obj.userData.label;
        if (lbl) lbl.position.y += Math.sin(elapsed * 2 + obj.id) * 0.0002;
      });
    }

    renderer.render(scene, camera);
  }

  /* ----------------------------------------------------------
     UI
     ---------------------------------------------------------- */
  function initUI() {
    document.querySelectorAll('.svc-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        document.querySelectorAll('.svc-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        loadRoom(btn.dataset.service);
        $('.sidebar').classList.remove('open');
        $('.sidebar-backdrop').classList.remove('visible');
      });
    });

    $('#btnPrev').addEventListener('click', function () { stopAutoPlay(); prevWaypoint(); });
    $('#btnNext').addEventListener('click', function () { stopAutoPlay(); nextWaypoint(); });
    $('#btnPlay').addEventListener('click', toggleAutoPlay);

    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('mouseleave', function () { isDragging = false; canvas.style.cursor = 'default'; });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onPointerDown, { passive: true });
    canvas.addEventListener('touchmove', onPointerMove, { passive: true });
    canvas.addEventListener('touchend', onPointerUp, { passive: true });

    const menuToggle = $('#menuToggle');
    if (menuToggle) menuToggle.addEventListener('click', function () {
      $('.sidebar').classList.toggle('open');
      $('.sidebar-backdrop').classList.toggle('visible');
    });
    const backdrop = $('.sidebar-backdrop');
    if (backdrop) backdrop.addEventListener('click', function () {
      $('.sidebar').classList.remove('open');
      backdrop.classList.remove('visible');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { stopAutoPlay(); nextWaypoint(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { stopAutoPlay(); prevWaypoint(); }
      if (e.key === ' ') { e.preventDefault(); toggleAutoPlay(); }
    });

    updatePlayButton();
  }

  /* ----------------------------------------------------------
     BOOT
     ---------------------------------------------------------- */
  function boot() {
    initThree();
    initUI();
    animate();
    setTimeout(function () { loader.classList.add('hidden'); }, 6000);

    let started = false;
    function startRoom() {
      if (started) return;
      started = true;
      try {
        const first = SERVICES.find(function (s) { return s.ready; });
        if (first) loadRoom(first.id);
        window.MAM3D = {
          tableLoaded: !!tableModelProto,
          anesthesiaLoaded: !!anesthesiaModelProto,
          anesthesia: lastAnesInfo,
          edanLoaded: !!edanMonitorProto,
          edan: lastEdanInfo,
          hamiltonLoaded: !!hamiltonProto,
          hamilton: lastHamiltonInfo,
          saikangLoaded: !!saikangCartProto,
          saikang: lastSaikangInfo,
          inoxLoaded: !!inoxTrolleyProto,
          inox: lastInoxInfo,
          connLoaded: !!connTableProto,
          conn: lastConnInfo,
          suctionLoaded: !!suctionProto,
          suction: lastSuctionInfo,
          bedD8DLoaded: !!bedD8DProto,
          bedD8D: lastBedD8DInfo,
          stretcher039Loaded: !!stretcher039Proto,
          stretcher039: lastStretcher039Info,
          c6Loaded: true,
          c6: lastC6Info,
          amoulE6Loaded: !!amoulE6Proto,
          amoulE6: lastAmoulE6Info,
          firstRoom: first ? first.id : null,
          items: currentRoom ? currentRoom.objects.length : 0
        };
        // accès de debug (non sérialisable : gardé hors de MAM3D)
        window.MAM3D_scene = scene;
        window.MAM3D_camera = camera;
      } catch (err) {
        console.error('Erreur de chargement de la salle :', err);
        const t = $('.loader__text');
        if (t) t.textContent = 'Erreur : ' + (err && err.message ? err.message : err);
      }
      loader.classList.add('hidden');
    }

    let pendingModels = 11;
    function modelDone() { if (--pendingModels <= 0) startRoom(); }
    loadOperatingTableModel(modelDone);
    loadAnesthesiaModel(modelDone);
    loadEdanMonitorModel(modelDone);
    loadHamiltonModel(modelDone);
    loadSaikangCartModel(modelDone);
    loadInstrumentTrolleyModel(modelDone);
    loadConnectionTableModel(modelDone);
    loadSuctionModel(modelDone);
    loadBedD8DModel(modelDone);
    loadAmbulanceStretcherModel(modelDone);
    loadAmoulE6Model(modelDone);
    setTimeout(startRoom, 14000); // sécurité si un modèle ne répond pas
  }

  if (window.THREE) boot();
  else window.addEventListener('load', function () {
    if (window.THREE) boot();
    else $('.loader__text').textContent = 'Three.js indisponible';
  });

})();
