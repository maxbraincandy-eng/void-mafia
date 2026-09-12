import * as THREE from 'three';
import { oldTbilisi } from '../src/components/worlds/oldTbilisi';
import type { WorldContext, WorldCollider, WorldVehicle } from '../src/components/worlds/types';
import { buildRetroCar } from '../src/components/worlds/retroCar';

const W = 1280, H = 760;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(oldTbilisi.clear);
scene.fog = new THREE.FogExp2(oldTbilisi.fog.color, oldTbilisi.fog.density);
const ambientLight = new THREE.AmbientLight(0xffffff, 1);
const moon = new THREE.DirectionalLight(0xffffff, 1);
scene.add(ambientLight, moon);
const colliders: WorldCollider[] = [];
const vehicles: WorldVehicle[] = [];
const ctx: WorldContext = {
  three: THREE, scene, renderer, moon, ambientLight,
  addCollider: c => { colliders.push(c); },
  addSeat: () => {}, addInteractable: () => {}, addAmbient: () => {},
  addSwimZone: () => {}, addDryZone: () => {},
  // Build the mesh too — the engine does this, and a harness that only records
  // the spec cannot see whether the car exists.
  addVehicle: v => {
    vehicles.push(v);
    if (v.kind === 'retro') {
      const g = new THREE.Group();
      buildRetroCar(THREE, g, v.color, []);
      g.position.set(v.x, 0, v.z); g.rotation.y = v.yaw ?? 0;
      scene.add(g);
    }
  },
  setScreen: () => {}, onUpdate: () => {}, disposables: [], perf: { reduced: false },
};
oldTbilisi.build(ctx);
const cam = new THREE.PerspectiveCamera(62, W / H, 0.4, 6000);
let meshes = 0, tris = 0;
scene.traverse(o => { const m = o as THREE.Mesh; if (!(m as any).isMesh) return;
  meshes++; const g = m.geometry as THREE.BufferGeometry;
  const n = g.index ? g.index.count : g.attributes.position?.count ?? 0;
  tris += (n / 3) * ((m as any).isInstancedMesh ? (m as any).count : 1); });
(window as any).__walk = (x: number, z: number, yaw: number, eye = 1.7) => {
  cam.position.set(x, eye, z);
  // The engine's forward is (−sin yaw, −cos yaw). The first version of this
  // used +sin/+cos and every 'spawn' shot was the view over the player's
  // shoulder — which is how an empty square kept being reported as the spawn.
  cam.lookAt(x - Math.sin(yaw) * 10, eye - 0.2, z - Math.cos(yaw) * 10);
  renderer.render(scene, cam);
  return renderer.domElement.toDataURL('image/png');
};
(window as any).__view = (x: number, y: number, z: number, lx: number, ly: number, lz: number) => {
  cam.position.set(x, y, z); cam.lookAt(lx, ly, lz);
  renderer.render(scene, cam);
  return renderer.domElement.toDataURL('image/png');
};
(window as any).__stats = () => ({ meshes, triangles: Math.round(tris), colliders: colliders.length, vehicles: vehicles.length, cars: vehicles.map(v => ({ x: Math.round(v.x), z: Math.round(v.z), yaw: +(v.yaw ?? 0).toFixed(2) })) });
