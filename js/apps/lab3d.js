/* lab3d.js — 3D Lab. Three.js is imported lazily, only when this app opens,
   so the rest of the OS stays light. 14 teaching models, orbit, zoom, spin,
   wireframe, aspect-aware framing and snapshot → whiteboard. */

import { el, toast, download, clamp, reducedMotion } from '../utils.js';
import { icon } from '../icons.js';

const MODELS = [
  { id: 'cube', label: 'Cube', note: 'A cube has 6 square faces, 12 edges and 8 vertices. Volume = a³, surface = 6a².' },
  { id: 'cuboid', label: 'Cuboid', note: 'A cuboid (rectangular prism): 6 rectangular faces. Volume = l × b × h.' },
  { id: 'sphere', label: 'Sphere', note: 'Every point is the same distance from the centre. Volume = 4/3πr³, surface = 4πr².' },
  { id: 'cylinder', label: 'Cylinder', note: 'Two parallel circular bases. Volume = πr²h, curved surface = 2πrh.' },
  { id: 'cone', label: 'Cone', note: 'One circular base and an apex. Volume = 1/3πr²h, slant height l = √(r² + h²).' },
  { id: 'prism', label: 'Triangular prism', note: 'Two triangular bases joined by rectangles. Volume = area of triangle × length.' },
  { id: 'pyramid', label: 'Square pyramid', note: 'A square base with 4 triangles meeting at the apex. Volume = 1/3 × base area × height.' },
  { id: 'torus', label: 'Torus', note: 'A donut: a circle swept around an axis. Great for rotation and symmetry talks.' },
  { id: 'icosahedron', label: 'Icosahedron', note: 'A platonic solid with 20 equilateral triangles, 30 edges and 12 vertices.' },
  { id: 'solar', label: 'Solar system', note: 'The Sun with four inner planets. Orbits are not to scale — use it to talk about revolution and rotation.' },
  { id: 'water', label: 'Water · H₂O', note: 'One oxygen with two hydrogens, bent at about 104.5°. The bent shape makes water polar.' },
  { id: 'co2', label: 'Carbon dioxide · CO₂', note: 'A linear molecule: carbon double-bonds with two oxygens, 180° apart.' },
  { id: 'methane', label: 'Methane · CH₄', note: 'Tetrahedral: one carbon at the centre with four hydrogens at ~109.5°.' },
  { id: 'dna', label: 'DNA helix', note: 'Two sugar-phosphate strands twist around each other; base pairs (rungs) join them.' },
];

export function mount({ body, win, api, os }) {
  let THREE = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let root = null;
  let grid = null;
  let raf = 0;
  let disposed = false;
  let current = MODELS[0].id;
  let spinning = true;
  let wireframe = false;
  let baseRadius = 5;
  let needRender = true;

  const orbit = {
    theta: Math.PI / 5, phi: Math.PI / 2.6, radius: 5,
    minRadius: 1.4, maxRadius: 24, target: null, dragging: null, pinch: null,
  };

  const lab = el('div', { class: 'lab' });
  const side = el('div', { class: 'lab__side', role: 'tablist', 'aria-label': '3D models' });
  const host = el('div', { class: 'lab__canvasHost' });
  const notes = el('div', { class: 'lab__notes', text: MODELS[0].note });
  const bar = el('div', { class: 'toolbar', role: 'toolbar', 'aria-label': '3D tools' });
  lab.append(bar, side, host, notes);
  body.classList.add('no-scroll');
  body.append(lab);

  // toolbar
  const spinBtn = el('button', { class: 'tbtn is-active', type: 'button', title: 'Auto-spin', 'aria-label': 'Toggle auto-spin' });
  spinBtn.innerHTML = icon('reset');
  const wireBtn = el('button', { class: 'tbtn', type: 'button', title: 'Wireframe', 'aria-label': 'Toggle wireframe' });
  wireBtn.innerHTML = icon('grid');
  const snapBtn = el('button', { class: 'tbtn', type: 'button', title: 'Send snapshot to whiteboard', 'aria-label': 'Snapshot to whiteboard' });
  snapBtn.innerHTML = icon('board');
  const pngBtn = el('button', { class: 'tbtn', type: 'button', title: 'Download PNG', 'aria-label': 'Download PNG' });
  pngBtn.innerHTML = icon('download');
  const resetBtn = el('button', { class: 'tbtn', type: 'button', title: 'Reset view', 'aria-label': 'Reset view' });
  resetBtn.innerHTML = icon('expand');
  spinBtn.disabled = wireBtn.disabled = snapBtn.disabled = pngBtn.disabled = resetBtn.disabled = true;
  bar.append(spinBtn, wireBtn, el('div', { class: 'toolbar__spacer' }), snapBtn, pngBtn, resetBtn);

  const loading = el('div', { class: 'lab__loading' }, el('span', { text: 'Loading 3D engine…' }));
  host.append(loading);

  MODELS.forEach((m) => {
    const b = el('button', { type: 'button', text: m.label, dataset: { model: m.id }, role: 'tab' });
    b.addEventListener('click', () => selectModel(m.id));
    side.append(b);
  });

  function syncTabs() {
    side.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.model === current);
      b.setAttribute('aria-selected', b.dataset.model === current ? 'true' : 'false');
    });
    notes.textContent = MODELS.find((m) => m.id === current)?.note || '';
  }

  /* ————————————————— build models ————————————————— */
  function material(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
      color, roughness: 0.42, metalness: 0.12, flatShading: false,
      wireframe, ...opts,
    });
  }
  function atom(pos, r, color) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), material(color, { roughness: 0.3 }));
    m.position.set(...pos);
    m.userData.frame = true;
    return m;
  }
  function bond(a, b, r, color) {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(r, r, len, 18);
    const mesh = new THREE.Mesh(geo, material(color, { roughness: 0.5 }));
    mesh.position.copy(start).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    mesh.userData.frame = true;
    return mesh;
  }

  function buildModel(id) {
    const g = new THREE.Group();
    const add = (m) => { m.userData.frame = true; g.add(m); return m; };
    switch (id) {
      case 'cube': add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), material('#8b7dff'))); break;
      case 'cuboid': add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 1.4), material('#5ad1ff'))); break;
      case 'sphere': add(new THREE.Mesh(new THREE.SphereGeometry(1.25, 56, 36), material('#ff8f6b'))); break;
      case 'cylinder': add(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 2.1, 48, 1), material('#4ade80'))); break;
      case 'cone': add(new THREE.Mesh(new THREE.ConeGeometry(1.25, 2.1, 48), material('#fbbf24'))); break;
      case 'prism': {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 2.1, 3, 1), material('#c8a7ff'));
        m.rotation.y = Math.PI / 6;
        add(m);
        break;
      }
      case 'pyramid': add(new THREE.Mesh(new THREE.ConeGeometry(1.45, 2.1, 4, 1), material('#7fd6a1'))); break;
      case 'torus': add(new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.42, 26, 72), material('#ff6f9c'))); break;
      case 'icosahedron': add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.45, 0), material('#5ad1ff', { flatShading: true }))); break;
      case 'solar': {
        add(atom([0, 0, 0], 0.62, '#ffcf4a'));
        const planets = [
          { d: 1.8, r: 0.13, c: '#b9c2d8' },
          { d: 2.5, r: 0.19, c: '#ffb545' },
          { d: 3.25, r: 0.21, c: '#5ad1ff' },
          { d: 4.1, r: 0.16, c: '#ff6f7d' },
        ];
        planets.forEach((p, i) => {
          const pg = new THREE.Group();
          pg.rotation.y = i * 1.4;
          const planet = atom([p.d, 0, 0], p.r, p.c);
          pg.add(planet);
          g.add(pg);
          planet.userData.frame = true;
        });
        const orbitLines = new THREE.Group();
        planets.forEach((p) => {
          const pts = [];
          for (let a = 0; a <= 64; a++) {
            const t = (a / 64) * Math.PI * 2;
            pts.push(new THREE.Vector3(Math.cos(t) * p.d, 0, Math.sin(t) * p.d));
          }
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: 0x4a5578, transparent: true, opacity: 0.55 }));
          line.userData.noFrame = true;
          orbitLines.add(line);
        });
        g.add(orbitLines);
        break;
      }
      case 'water': {
        const o = [0, 0, 0];
        const h1 = [-0.85, 0.6, 0];
        const h2 = [0.85, 0.6, 0];
        add(atom(o, 0.55, '#ff5c5c'));
        add(atom(h1, 0.32, '#eef4ff'));
        add(atom(h2, 0.32, '#eef4ff'));
        add(bond(o, h1, 0.1, '#c9d3e6'));
        add(bond(o, h2, 0.1, '#c9d3e6'));
        break;
      }
      case 'co2': {
        add(atom([0, 0, 0], 0.5, '#3a3f52'));
        add(atom([-1.5, 0, 0], 0.44, '#ff5c5c'));
        add(atom([1.5, 0, 0], 0.44, '#ff5c5c'));
        add(bond([0, 0, 0], [-1.3, 0, 0], 0.13, '#c9d3e6'));
        add(bond([0, 0, 0], [1.3, 0, 0], 0.13, '#c9d3e6'));
        break;
      }
      case 'methane': {
        add(atom([0, 0, 0], 0.52, '#3a3f52'));
        const dirs = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
        dirs.forEach((d) => {
          const v = new THREE.Vector3(...d).normalize().multiplyScalar(1.45);
          add(atom([v.x, v.y, v.z], 0.3, '#eef4ff'));
          add(bond([0, 0, 0], [v.x, v.y, v.z], 0.1, '#c9d3e6'));
        });
        break;
      }
      case 'dna': {
        const steps = 26;
        const radius = 1.05;
        const height = 4.4;
        for (let i = 0; i < steps; i++) {
          const t = (i / (steps - 1)) * Math.PI * 3.2;
          const y = -height / 2 + (i / (steps - 1)) * height;
          const a = [Math.cos(t) * radius, y, Math.sin(t) * radius];
          const b = [Math.cos(t + Math.PI) * radius, y, Math.sin(t + Math.PI) * radius];
          add(atom(a, 0.14, '#8b7dff'));
          add(atom(b, 0.14, '#5ad1ff'));
          if (i % 2 === 0) add(bond(a, b, 0.055, '#7f8aa8'));
        }
        break;
      }
      default: add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), material('#8b7dff')));
    }
    return g;
  }

  /* ————————————————— scene ————————————————— */
  function disposeGroup(group) {
    if (!group) return;
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose?.());
      }
    });
    scene?.remove(group);
  }

  function computeFraming() {
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      if (!obj.isMesh || obj.userData.noFrame || obj.userData.frame === false) return;
      if (!obj.geometry) return;
      if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
      const bb = obj.geometry.boundingBox;
      if (!bb) return;
      // expand using the mesh's world transform, ignoring Points / helpers
      const corners = [
        [bb.min.x, bb.min.y, bb.min.z], [bb.max.x, bb.min.y, bb.min.z],
        [bb.min.x, bb.max.y, bb.min.z], [bb.max.x, bb.max.y, bb.min.z],
        [bb.min.x, bb.min.y, bb.max.z], [bb.max.x, bb.min.y, bb.max.z],
        [bb.min.x, bb.max.y, bb.max.z], [bb.max.x, bb.max.y, bb.max.z],
      ];
      corners.forEach((c) => { v.set(...c).applyMatrix4(obj.matrixWorld); box.expandByPoint(v); });
    });
    if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(2, 2, 2));
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(0.9, size.length() / 2);
    const fov = (camera.fov * Math.PI) / 180;
    const aspect = camera.aspect || 1;
    const fit = radius / Math.sin(fov / 2);
    baseRadius = clamp(fit * (aspect < 1 ? 1 / Math.max(0.62, aspect) : 1.05), 2.4, 26);
    orbit.target = center.clone();
    orbit.radius = baseRadius;
    orbit.minRadius = clamp(radius * 0.8, 0.8, 12);
    orbit.maxRadius = baseRadius * 3.2;
    applyOrbit();
  }

  function applyOrbit() {
    if (!camera || !orbit.target) return;
    const r = clamp(orbit.radius, orbit.minRadius, orbit.maxRadius);
    const sp = Math.sin(orbit.phi);
    camera.position.set(
      orbit.target.x + r * sp * Math.cos(orbit.theta),
      orbit.target.y + r * Math.cos(orbit.phi),
      orbit.target.z + r * sp * Math.sin(orbit.theta)
    );
    camera.lookAt(orbit.target);
    needRender = true;
  }

  function selectModel(id) {
    current = id;
    syncTabs();
    if (!root || !scene) return;
    disposeGroup(root);
    root = buildModel(id);
    scene.add(root);
    wireBtn.classList.toggle('is-active', wireframe);
    orientModel();
    computeFraming();
    needRender = true;
  }

  function orientModel() {
    if (!root) return;
    if (['cube', 'cuboid', 'prism', 'pyramid', 'cylinder', 'cone'].includes(current)) {
      root.rotation.set(0.22, -0.5, 0);
    } else {
      root.rotation.set(0, 0, 0);
    }
    const isGeometry = !['solar', 'water', 'co2', 'methane', 'dna'].includes(current);
    if (grid) grid.visible = isGeometry;
  }

  function setWireframe(on) {
    wireframe = on;
    wireBtn.classList.toggle('is-active', on);
    root?.traverse((obj) => {
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => { if ('wireframe' in m) m.wireframe = on; });
      }
    });
    needRender = true;
  }

  function resize() {
    if (!renderer || !camera) return;
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    const prevAspect = camera.aspect;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (Math.abs(prevAspect - camera.aspect) > 0.02) {
      const factor = camera.aspect < 1 ? 1 / Math.max(0.62, camera.aspect) : 1;
      orbit.radius = clamp(baseRadius * factor, orbit.minRadius, orbit.maxRadius);
    }
    applyOrbit();
  }

  function animate() {
    if (disposed) return;
    raf = requestAnimationFrame(animate);
    if (root && spinning && !reducedMotion()) {
      if (current === 'solar' || current === 'dna' || current === 'torus') {
        root.rotation.y += 0.0045;
      } else {
        root.rotation.y += 0.0035;
      }
      needRender = true;
    }
    if (needRender && scene && camera) {
      needRender = false;
      renderer.render(scene, camera);
    }
  }

  /* ————————— input ————————— */
  function attachInput() {
    const canvas = renderer.domElement;
    let last = null;
    const pts = new Map();
    canvas.addEventListener('pointerdown', (ev) => {
      canvas.setPointerCapture?.(ev.pointerId);
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        orbit.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), radius: orbit.radius };
        last = null;
        return;
      }
      last = { x: ev.clientX, y: ev.clientY };
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (!pts.has(ev.pointerId)) return;
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pts.size >= 2 && orbit.pinch) {
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        orbit.radius = clamp(orbit.pinch.radius * (orbit.pinch.dist / Math.max(20, dist)), orbit.minRadius, orbit.maxRadius);
        applyOrbit();
        return;
      }
      if (!last) return;
      const dx = ev.clientX - last.x;
      const dy = ev.clientY - last.y;
      last = { x: ev.clientX, y: ev.clientY };
      orbit.theta -= dx * 0.008;
      orbit.phi = clamp(orbit.phi - dy * 0.008, 0.22, Math.PI - 0.22);
      applyOrbit();
    });
    const end = (ev) => {
      pts.delete(ev.pointerId);
      if (pts.size < 2) orbit.pinch = null;
      if (!pts.size) last = null;
      try { canvas.releasePointerCapture?.(ev.pointerId); } catch { /* ignore */ }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      orbit.radius = clamp(orbit.radius * (ev.deltaY > 0 ? 1.08 : 1 / 1.08), orbit.minRadius, orbit.maxRadius);
      applyOrbit();
    }, { passive: false });
  }

  /* ————————— actions ————————— */
  function snapshot(dataUrl) {
    os.openApp('board').then(() => {
      setTimeout(() => {
        os.boardApi?.insertImage(dataUrl);
        toast('3D snapshot sent to the whiteboard');
      }, 140);
    });
  }

  function capture() {
    if (!renderer) return null;
    renderer.render(scene, camera);
    try { return renderer.domElement.toDataURL('image/png'); }
    catch (err) { console.warn('[lab] snapshot failed', err); return null; }
  }

  snapBtn.addEventListener('click', () => {
    const url = capture();
    if (url) snapshot(url); else toast('Snapshot could not be captured', { type: 'error' });
  });
  pngBtn.addEventListener('click', () => {
    const url = capture();
    if (url) download(url, `smartboard-3d-${current}.png`);
    else toast('PNG could not be captured', { type: 'error' });
  });
  spinBtn.addEventListener('click', () => { spinning = !spinning; spinBtn.classList.toggle('is-active', spinning); });
  wireBtn.addEventListener('click', () => setWireframe(!wireframe));
  resetBtn.addEventListener('click', () => {
    orbit.theta = Math.PI / 5;
    orbit.phi = Math.PI / 2.6;
    orbit.radius = baseRadius;
    applyOrbit();
  });

  /* ————————— boot ————————— */
  (async () => {
    try {
      THREE = await import('../../vendor/three.module.min.js');
    } catch (err) {
      console.error('[lab] three.js failed to load', err);
      loading.innerHTML = '<span>3D engine could not load. Re-open the app or reload after the first install.</span>';
      return;
    }
    if (disposed) return;
    try {
      scene = new THREE.Scene();
      scene.background = null;
      camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.touchAction = 'none';
      host.append(renderer.domElement);
      loading.remove();

      scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a2035, 1.5));
      const key = new THREE.DirectionalLight(0xffffff, 2.1);
      key.position.set(4, 7, 6);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x7fb0ff, 0.9);
      rim.position.set(-6, -3, -5);
      scene.add(rim);

      grid = new THREE.GridHelper(12, 12, 0x5a6b8c, 0x2b3451);
      grid.material.transparent = true;
      grid.material.opacity = 0.55;
      grid.userData.noFrame = true;
      scene.add(grid);

      root = buildModel(current);
      scene.add(root);
      orientModel();
      syncTabs();
      attachInput();
      resize();
      computeFraming();
      spinBtn.disabled = wireBtn.disabled = snapBtn.disabled = pngBtn.disabled = resetBtn.disabled = false;
      animate();
    } catch (err) {
      console.error('[lab] init failed', err);
      loading.textContent = 'WebGL is not available in this browser, so 3D models cannot be shown.';
      if (loading.parentElement !== host) host.append(loading);
    }
  })();

  const ro = new ResizeObserver(() => resize());
  ro.observe(host);
  api.onResize(() => resize());

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    disposeGroup(root);
    try { grid?.geometry?.dispose(); grid?.material?.dispose?.(); } catch { /* ignore */ }
    try { renderer?.dispose(); renderer?.domElement?.remove(); } catch { /* ignore */ }
    scene = null; camera = null; renderer = null; root = null;
    body.classList.remove('no-scroll');
    lab.remove();
  };
}
