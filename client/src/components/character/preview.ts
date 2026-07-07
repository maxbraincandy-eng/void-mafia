// ── Character Creator — studio preview engine ─────────────────────────
// A small Three.js "photo studio": three-point lighting, soft shadow, dark
// gradient backdrop, drag-orbit + zoom, and the live character model with its
// idle animation. Rebuilds the model whenever the spec changes.
import * as THREE from 'three';
import { buildCharacter, type CharacterModel } from './model';
import type { CharacterSpec } from './spec';

export class CreatorPreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private model: CharacterModel | null = null;

  private yaw = 0; private pitch = 0.05; private dist = 3.1;
  private target = new THREE.Vector3(0, 0.95, 0);

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    (this.renderer as any).outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.scene.background = this.backdrop();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

    // three-point studio lighting
    this.scene.add(new THREE.AmbientLight(0x8890b0, 0.55));
    const key = new THREE.DirectionalLight(0xfff2e0, 2.1);
    key.position.set(2.5, 4, 3.2); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 20;
    (key.shadow.camera as THREE.OrthographicCamera).left = -2;
    (key.shadow.camera as THREE.OrthographicCamera).right = 2;
    (key.shadow.camera as THREE.OrthographicCamera).top = 3;
    (key.shadow.camera as THREE.OrthographicCamera).bottom = -0.5;
    key.shadow.bias = -0.0006;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.7); fill.position.set(-3, 2, 1.5); this.scene.add(fill);
    const rim = new THREE.SpotLight(0xc08aff, 3.2, 12, Math.PI / 5, 0.6); rim.position.set(-1.5, 3, -3.5); this.scene.add(rim);
    const rim2 = new THREE.SpotLight(0x3ba0ff, 2.2, 12, Math.PI / 5, 0.6); rim2.position.set(2.5, 2, -3); this.scene.add(rim2);

    // studio floor (receives the soft shadow)
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 40),
      new THREE.MeshStandardMaterial({ color: 0x141420, roughness: 0.5, metalness: 0.2 }),
    );
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);

    this.resize();
  }

  private backdrop(): THREE.Texture {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(128, 90, 20, 128, 128, 200);
    grad.addColorStop(0, '#2a2440'); grad.addColorStop(0.5, '#171528'); grad.addColorStop(1, '#0a0912');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }

  setSpec(spec: CharacterSpec) {
    if (this.model) { this.scene.remove(this.model.group); this.model.dispose(); }
    this.model = buildCharacter(spec);
    this.scene.add(this.model.group);
  }

  orbit(dx: number, dy: number) {
    this.yaw -= dx * 0.01;
    this.pitch = Math.max(-0.5, Math.min(0.7, this.pitch - dy * 0.006));
  }
  zoom(delta: number) { this.dist = Math.max(1.7, Math.min(4.6, this.dist + delta)); }
  focusFace(on: boolean) { this.target.y = on ? 1.55 : 0.95; this.dist = on ? 1.5 : 3.1; }

  start() {
    this.clock.start();
    const loop = () => { if (this.disposed) return; this.raf = requestAnimationFrame(loop); this.frame(); };
    this.raf = requestAnimationFrame(loop);
  }

  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.model?.update(dt, this.clock.elapsedTime);
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * this.dist * cp,
      this.target.y + Math.sin(this.pitch) * this.dist + 0.2,
      this.target.z + Math.cos(this.yaw) * this.dist * cp,
    );
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.model) { this.model.dispose(); }
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose?.();
    });
    (this.scene.background as THREE.Texture)?.dispose?.();
    this.renderer.dispose();
  }
}
