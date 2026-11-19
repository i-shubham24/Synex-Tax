import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Hero scene: a honeycomb cluster of glossy indigo pillars rising out of a white
 * fog, with a gold rupee coin that hops from pillar top to pillar top.
 * Vanilla three.js (no R3F) so the render loop is fully under our control:
 * it pauses off-screen, on hidden tabs, and honours prefers-reduced-motion.
 */

type PillarSpec = { x: number; z: number; h: number };

// Hex cluster: back row tallest, stepping down toward the viewer.
const LAYOUT: PillarSpec[] = [
  { x: -1.1, z: -0.95, h: 3.05 },
  { x: 0.0, z: -0.95, h: 4.05 },
  { x: 1.1, z: -0.95, h: 3.75 },
  { x: -1.65, z: 0.0, h: 2.55 },
  { x: -0.55, z: 0.0, h: 3.3 },
  { x: 0.55, z: 0.0, h: 3.55 },
  { x: 1.65, z: 0.0, h: 2.95 },
  { x: -1.1, z: 0.95, h: 2.35 },
  { x: 0.0, z: 0.95, h: 2.15 },
  { x: 1.1, z: 0.95, h: 2.5 },
];

const RADIUS = 0.49;
const BASE_Y = -4.6;
const COIN_R = 0.5;
const FADE_COLOR = new THREE.Color('#f7f7fa');

const FINAL_CAM = new THREE.Vector3(0.1, 6.9, 14.4);
const FINAL_LOOK = new THREE.Vector3(-0.45, 1.75, 0);
const INTRO_CAM = new THREE.Vector3(0.55, 4.75, 4.1);
const INTRO_LOOK = new THREE.Vector3(0.25, 3.8, -0.6);

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t: number) => {
  const c1 = 1.6;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

interface Pillar {
  mesh: THREE.Mesh;
  mat: THREE.MeshPhysicalMaterial;
  spec: PillarSpec;
  lift: number; // current hover lift
  dip: number; // landing dip (spring position)
  dipVel: number;
  rise: number; // intro rise 0..1
}

export interface PillarSceneOptions {
  reducedMotion: boolean;
  onIntroReveal?: () => void;
}

/** Pillar silhouette with a soft bevelled top rim, revolved around Y. */
function pillarGeometry(height: number) {
  const bevel = 0.09;
  const pts: THREE.Vector2[] = [];
  pts.push(new THREE.Vector2(0, BASE_Y));
  pts.push(new THREE.Vector2(RADIUS, BASE_Y));
  pts.push(new THREE.Vector2(RADIUS, height - bevel));
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(RADIUS - bevel + Math.cos(a) * bevel, height - bevel + Math.sin(a) * bevel));
  }
  pts.push(new THREE.Vector2(0, height));
  return new THREE.LatheGeometry(pts, 64);
}

/** Inject a world-height fade so pillars dissolve into the page colour. */
function addHeightFade(mat: THREE.Material, top: number, bottom: number) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFadeColor = { value: FADE_COLOR };
    shader.uniforms.uFadeTop = { value: top };
    shader.uniforms.uFadeBottom = { value: bottom };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWorldY;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvWorldY = (modelMatrix * vec4(transformed, 1.0)).y;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vWorldY;\nuniform vec3 uFadeColor;\nuniform float uFadeTop;\nuniform float uFadeBottom;',
      )
      .replace(
        '#include <dithering_fragment>',
        // smoothstep needs edge0 < edge1 (reversed edges are undefined in GLSL)
        '#include <dithering_fragment>\nfloat fadeK = 1.0 - smoothstep(uFadeBottom, uFadeTop, vWorldY);\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uFadeColor, fadeK);',
      );
  };
}

/** Gold coin face: rim, inner ring and an embossed rupee sign. */
function coinFaceTextures() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const cx = size / 2;

  const grad = g.createRadialGradient(cx * 0.8, cx * 0.7, 20, cx, cx, cx);
  grad.addColorStop(0, '#ffe39a');
  grad.addColorStop(0.55, '#f2b53a');
  grad.addColorStop(1, '#c98612');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);

  g.lineWidth = 18;
  g.strokeStyle = '#d99a1e';
  g.beginPath();
  g.arc(cx, cx, cx - 30, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 6;
  g.strokeStyle = '#ffd77a';
  g.beginPath();
  g.arc(cx, cx, cx - 62, 0, Math.PI * 2);
  g.stroke();

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 270px "Inter Tight", "Segoe UI", system-ui, sans-serif';
  g.fillStyle = '#b77708';
  g.fillText('₹', cx + 8, cx + 14);
  g.fillStyle = '#ffe08c';
  g.fillText('₹', cx - 4, cx + 4);
  g.fillStyle = '#f0b33b';
  g.fillText('₹', cx, cx + 8);

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  // Height map for the emboss
  const b = document.createElement('canvas');
  b.width = b.height = size;
  const h = b.getContext('2d')!;
  h.fillStyle = '#7a7a7a';
  h.fillRect(0, 0, size, size);
  h.lineWidth = 18;
  h.strokeStyle = '#d0d0d0';
  h.beginPath();
  h.arc(cx, cx, cx - 30, 0, Math.PI * 2);
  h.stroke();
  h.lineWidth = 6;
  h.beginPath();
  h.arc(cx, cx, cx - 62, 0, Math.PI * 2);
  h.stroke();
  h.textAlign = 'center';
  h.textBaseline = 'middle';
  h.font = '700 270px "Inter Tight", "Segoe UI", system-ui, sans-serif';
  h.fillStyle = '#ededed';
  h.fillText('₹', cx, cx + 8);
  const bump = new THREE.CanvasTexture(b);
  return { map, bump };
}

function coinEdgeTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 16;
  const g = c.getContext('2d')!;
  for (let x = 0; x < 512; x += 8) {
    g.fillStyle = '#c8c8c8';
    g.fillRect(x, 0, 4, 16);
    g.fillStyle = '#6a6a6a';
    g.fillRect(x + 4, 0, 4, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

export class PillarScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private cluster = new THREE.Group();
  private pillars: Pillar[] = [];
  private coin: THREE.Mesh;
  private coinGroup = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2(9, 9);
  private pointerDirty = false;
  private pickTargets: THREE.Object3D[] = [];
  private frame = 0;
  private pixelRatio = 1;
  private cssSize = { w: 0, h: 0 };
  private slowFrames = 0;
  private sampledFrames = 0;
  private raf = 0;
  private active = true;
  private disposed = false;
  private startedAt = 0;
  private lastFrame = 0;
  private introDone = false;
  private revealed = false;
  private reduced: boolean;
  private onIntroReveal?: () => void;

  // interaction state
  private pointerTarget = new THREE.Vector2(0, 0);
  private pointerCurrent = new THREE.Vector2(0, 0);
  private scrollTarget = 0;
  private scrollCurrent = 0;
  private hovered: Pillar | null = null;

  // coin state machine
  private coinAt = 1;
  private hopFrom = 1;
  private hopTo = 1;
  private hopT = 1; // 0..1 while hopping, 1 = resting
  private hopDur = 0.82;
  private restTimer = 1.2;
  private queuedTarget: number | null = null;
  private coinSpin = 0;
  private coinSpinBase = 0;
  private landing = 0; // squash timer

  private camLook = new THREE.Vector3();
  private tmpV = new THREE.Vector3();

  constructor(private canvas: HTMLCanvasElement, opts: PillarSceneOptions) {
    this.reduced = opts.reducedMotion;
    this.onIntroReveal = opts.onIntroReveal;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    // 1.5x is visually indistinguishable here and ~45% cheaper than 2x; slow GPUs drop to 1x (see loop).
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(0x000000, 0);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
    this.scene.environmentIntensity = 0.62;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(27, 1, 0.1, 100);

    // Lights: soft key from upper left, magenta kicker for the rim highlights seen in the reference.
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(-5, 10, 6);
    this.scene.add(key);
    const kicker = new THREE.PointLight(0xff5fd2, 18, 8, 2);
    kicker.position.set(1.4, 6.2, 0.6);
    this.scene.add(kicker);
    const cool = new THREE.PointLight(0x9db8ff, 9, 10, 2);
    cool.position.set(-3.2, 4.2, 3.2);
    this.scene.add(cool);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b2ff, 0.25));

    // Pillars
    LAYOUT.forEach((spec) => {
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#3f2fe0'),
        roughness: 0.34,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.14,
        emissive: new THREE.Color('#2a12d8'),
        emissiveIntensity: 0.12,
      });
      addHeightFade(mat, 1.2, -1.7);
      const mesh = new THREE.Mesh(pillarGeometry(spec.h), mat);
      mesh.position.set(spec.x, 0, spec.z);
      mesh.userData.pillarIndex = this.pillars.length;
      this.cluster.add(mesh);
      this.pillars.push({ mesh, mat, spec, lift: 0, dip: 0, dipVel: 0, rise: this.reduced ? 1 : 0 });
    });

    this.pickTargets = this.pillars.map((p) => p.mesh);

    // Coin
    const { map, bump } = coinFaceTextures();
    const edge = coinEdgeTexture();
    const faceMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map,
      bumpMap: bump,
      bumpScale: 2.2,
      metalness: 0.78,
      roughness: 0.24,
      clearcoat: 0.7,
      clearcoatRoughness: 0.16,
      envMapIntensity: 2.4,
      emissive: new THREE.Color('#7a4a00'),
      emissiveIntensity: 0.32,
    });
    const edgeMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#f0b23a'),
      bumpMap: edge,
      bumpScale: 1.4,
      metalness: 0.85,
      roughness: 0.28,
      envMapIntensity: 2.4,
      emissive: new THREE.Color('#6a3e00'),
      emissiveIntensity: 0.3,
    });
    // Edge band + two circle faces (CircleGeometry UVs keep the rupee sign upright).
    const thickness = 0.11;
    const edgeGeo = new THREE.CylinderGeometry(COIN_R, COIN_R, thickness, 64, 1, true);
    edgeGeo.rotateX(Math.PI / 2);
    this.coin = new THREE.Mesh(edgeGeo, edgeMat);
    const faceGeo = new THREE.CircleGeometry(COIN_R, 64);
    const front = new THREE.Mesh(faceGeo, faceMat);
    front.position.z = thickness / 2;
    const back = new THREE.Mesh(faceGeo, faceMat);
    back.position.z = -thickness / 2;
    back.rotation.y = Math.PI;
    this.coin.add(front, back);
    this.coinGroup.add(this.coin);

    // Soft golden glow sprite behind the coin
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 128;
    const gg = glowCanvas.getContext('2d')!;
    const rg = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,214,120,0.55)');
    rg.addColorStop(1, 'rgba(255,214,120,0)');
    gg.fillStyle = rg;
    gg.fillRect(0, 0, 128, 128);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowCanvas), depthWrite: false, transparent: true }),
    );
    glow.scale.set(2.2, 2.2, 1);
    glow.position.z = -0.25;
    this.coinGroup.add(glow);

    this.cluster.add(this.coinGroup);
    this.scene.add(this.cluster);

    if (this.reduced) {
      this.camera.position.copy(FINAL_CAM);
      this.camLook.copy(FINAL_LOOK);
      this.introDone = true;
      this.revealed = true;
      this.onIntroReveal?.();
    } else {
      this.camera.position.copy(INTRO_CAM);
      this.camLook.copy(INTRO_LOOK);
    }
    this.camera.lookAt(this.camLook);
    this.placeCoinAtRest(0);

    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- public API
  resize(width: number, height: number) {
    if (width === 0 || height === 0) return;
    this.cssSize = { w: width, h: height };
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Keep the cluster framed on narrow screens.
    this.camera.fov = width / height < 0.9 ? 36 : 27;
    this.camera.updateProjectionMatrix();
  }

  setActive(active: boolean) {
    if (this.disposed || active === this.active) return;
    this.active = active;
    if (active) {
      this.lastFrame = performance.now() / 1000;
      this.raf = requestAnimationFrame(this.loop);
    } else {
      cancelAnimationFrame(this.raf);
    }
  }

  /** Normalised pointer over the whole hero, -1..1. */
  setPointer(nx: number, ny: number) {
    this.pointerTarget.set(nx, ny);
  }

  /** Pointer in canvas pixels for hover picking. */
  pointerOverCanvas(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.pointerDirty = true;
  }

  pointerLeaveCanvas() {
    this.ndc.set(9, 9);
    this.pointerDirty = true;
  }

  /** Returns true when a pillar was hit (the coin will hop there next). */
  click(): boolean {
    if (!this.hovered) return false;
    const idx = this.pillars.indexOf(this.hovered);
    if (idx === this.coinAt && this.hopT >= 1) {
      // Tap on the coin's own pillar: little flip in place.
      this.landing = 0.0001;
      this.coinSpinBase += Math.PI * 2;
      return true;
    }
    this.queuedTarget = idx;
    this.restTimer = Math.min(this.restTimer, 0.05);
    return true;
  }

  isHoveringPillar() {
    return this.hovered !== null;
  }

  /** 0 at rest, 1 when the hero has scrolled out of view. */
  setScroll(p: number) {
    this.scrollTarget = clamp01(p);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- internals
  private pillarTop(i: number) {
    const p = this.pillars[i];
    return p.spec.h + p.lift - p.dip + (p.rise - 1) * 5.2;
  }

  private placeCoinAtRest(t: number) {
    const p = this.pillars[this.coinAt];
    this.coinGroup.position.set(p.spec.x, this.pillarTop(this.coinAt) + COIN_R + 0.015 + Math.sin(t * 2.1) * 0.025, p.spec.z);
  }

  private neighbours(i: number) {
    const a = this.pillars[i].spec;
    return this.pillars
      .map((p, j) => ({ j, d: Math.hypot(p.spec.x - a.x, p.spec.z - a.z) }))
      .filter((n) => n.j !== i && n.d < 1.25)
      .map((n) => n.j);
  }

  private pickNext() {
    if (this.queuedTarget !== null) {
      const t = this.queuedTarget;
      this.queuedTarget = null;
      return t;
    }
    const n = this.neighbours(this.coinAt);
    // Prefer pillars whose tops face the camera (front half) so hops read clearly.
    return n[Math.floor(Math.random() * n.length)] ?? this.coinAt;
  }

  private updateIntro(t: number) {
    // 0.0 - 0.5s: hold on the close-up of pillar tops
    // 0.4 - 2.9s: dolly out to the final framing
    // pillars rise out of the fog, staggered from back to front
    const camK = easeInOutCubic(clamp01((t - 0.35) / 2.55));
    this.camera.position.lerpVectors(INTRO_CAM, FINAL_CAM, camK);
    this.camLook.lerpVectors(INTRO_LOOK, FINAL_LOOK, camK);

    this.pillars.forEach((p, i) => {
      const order = (p.spec.z + 1) * 0.5 + (i % 3) * 0.06;
      const k = clamp01((t - 0.15 - order * 0.55) / 1.25);
      p.rise = i === 1 ? Math.max(clamp01((t - 0.0) / 0.9), easeOutBack(k)) : easeOutBack(k);
    });

    // Coin drops from above onto the tallest pillar with a spin.
    const dropK = clamp01((t - 0.55) / 1.45);
    const top = this.pillarTop(1) + COIN_R + 0.015;
    const p = this.pillars[1].spec;
    const fall = 1 - Math.pow(1 - dropK, 3);
    this.coinGroup.position.set(p.x, top + (1 - fall) * 4.2 + Math.sin(dropK * Math.PI) * 0.35, p.z);
    this.coinSpin = (1 - fall) * Math.PI * 5;

    if (!this.revealed && t > 1.55) {
      this.revealed = true;
      this.onIntroReveal?.();
    }
    if (t > 3.0) {
      this.introDone = true;
      this.coinAt = 1;
      this.coinSpin = 0;
      this.coinSpinBase = 0;
      this.landing = 0.0001;
      this.pillars[1].dipVel = -1.4;
      this.restTimer = 0.9;
    }
  }

  private updateCoin(dt: number, t: number) {
    if (this.hopT < 1) {
      this.hopT = Math.min(1, this.hopT + dt / this.hopDur);
      const k = this.hopT;
      const a = this.pillars[this.hopFrom].spec;
      const b = this.pillars[this.hopTo].spec;
      const ya = this.pillarTop(this.hopFrom) + COIN_R + 0.015;
      const yb = this.pillarTop(this.hopTo) + COIN_R + 0.015;
      const arc = 1.05 + Math.max(0, yb - ya) * 0.6;
      const e = easeInOutCubic(k);
      this.coinGroup.position.set(a.x + (b.x - a.x) * e, ya + (yb - ya) * e + arc * 4 * k * (1 - k), a.z + (b.z - a.z) * e);
      this.coinSpin = e * Math.PI * 2;
      if (this.hopT >= 1) {
        this.coinAt = this.hopTo;
        this.coinSpinBase += Math.PI * 2;
        this.coinSpin = 0;
        this.landing = 0.0001;
        this.pillars[this.coinAt].dipVel = -1.6;
        this.restTimer = 0.95 + Math.random() * 0.6;
      }
      return;
    }

    this.placeCoinAtRest(t);
    if (this.reduced) return;
    this.restTimer -= dt;
    if (this.restTimer <= 0) {
      const next = this.pickNext();
      if (next !== this.coinAt) {
        this.hopFrom = this.coinAt;
        this.hopTo = next;
        this.hopT = 0;
      } else {
        this.restTimer = 0.8;
      }
    }
  }

  private loop() {
    if (!this.active || this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now() / 1000;
    if (this.startedAt === 0) this.startedAt = now;
    const dt = Math.min(now - this.lastFrame || 1 / 60, 1 / 30);
    this.lastFrame = now;
    // Wall-clock time drives the intro so it never crawls on throttled frames.
    const t = now - this.startedAt;

    // Pointer parallax and scroll sink (both smoothed)
    const smooth = this.reduced ? 1 : 1 - Math.pow(0.0015, dt);
    this.pointerCurrent.lerp(this.pointerTarget, smooth);
    this.scrollCurrent += (this.scrollTarget - this.scrollCurrent) * (this.reduced ? 1 : 1 - Math.pow(0.002, dt));
    this.cluster.rotation.y = -0.18 + this.pointerCurrent.x * 0.24 + this.scrollCurrent * 0.35;
    this.cluster.rotation.x = this.pointerCurrent.y * 0.04;
    this.cluster.position.y = -this.scrollCurrent * 2.6;

    if (!this.introDone) this.updateIntro(t);

    // Hover picking: only when the pointer moved (or every 8th frame while it rests over the
    // canvas, since the cluster drifts under it). Never while the pointer is outside.
    this.frame++;
    if (this.introDone && (this.pointerDirty || (this.ndc.x < 2 && this.frame % 8 === 0))) {
      this.pointerDirty = false;
      if (this.ndc.x > 2) {
        this.hovered = null;
      } else {
        this.raycaster.setFromCamera(this.ndc, this.camera);
        const hits = this.raycaster.intersectObjects(this.pickTargets, false);
        const hit = hits.find((h) => h.point.y > -0.4);
        this.hovered = hit ? this.pillars[hit.object.userData.pillarIndex as number] : null;
      }
    }

    // Adaptive quality: if frames run slow after the intro, drop to 1x pixel ratio once.
    if (this.introDone && this.pixelRatio > 1 && this.sampledFrames < 120) {
      this.sampledFrames++;
      if (dt > 1 / 40) this.slowFrames++;
      if (this.sampledFrames === 120 && this.slowFrames > 40) {
        this.pixelRatio = 1;
        this.renderer.setPixelRatio(1);
        this.renderer.setSize(this.cssSize.w, this.cssSize.h, false);
      }
    }

    // Pillar springs: hover lift + landing dip
    this.pillars.forEach((p) => {
      const targetLift = this.hovered === p ? 0.26 : 0;
      p.lift += (targetLift - p.lift) * (this.reduced ? 1 : 1 - Math.pow(0.0008, dt));
      const k = 140;
      const damp = 12;
      const acc = -k * p.dip - damp * p.dipVel;
      p.dipVel += acc * dt;
      p.dip += p.dipVel * dt;
      p.mesh.position.y = p.lift - p.dip + (p.rise - 1) * 5.2;
      const glow = this.hovered === p ? 0.28 : 0.08;
      p.mat.emissiveIntensity += (glow - p.mat.emissiveIntensity) * 0.15;
    });

    if (this.introDone) this.updateCoin(dt, t);

    // Coin orientation: face camera, spin on hop, gentle idle sway, squash on landing.
    const idle = this.hopT >= 1 ? Math.sin(t * 1.3) * 0.32 : 0;
    this.coin.rotation.set(0, this.coinSpinBase + this.coinSpin + idle - this.cluster.rotation.y, 0);
    if (this.landing > 0) {
      this.landing += dt;
      const s = Math.max(0, 1 - this.landing / 0.35);
      const squash = Math.sin(this.landing * 26) * 0.08 * s;
      this.coin.scale.set(1 + squash, 1 - squash, 1);
      if (this.landing > 0.35) {
        this.landing = 0;
        this.coin.scale.set(1, 1, 1);
      }
    }

    this.camera.lookAt(this.camLook);
    this.renderer.render(this.scene, this.camera);
  }
}
