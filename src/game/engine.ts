import * as THREE from 'three';
import { audio } from './audio';
import {
  INITIAL_STATS, RUN_TIME, SHARDS_TO_UNLOCK,
  type GameEvent, type GameInput, type GameResult, type GameStats, type Settings,
} from './types';

interface Callbacks {
  onStats: (stats: GameStats) => void;
  onEvent: (event: GameEvent) => void;
  onEnd: (result: GameResult) => void;
}

interface Island { x: number; z: number; radius: number }
interface Bridge { x: number; z: number; width: number; depth: number }
interface Obstacle { x: number; z: number; radius: number; height: number }
interface Crystal { x: number; z: number; active: boolean; phase: number }
interface Guardian {
  mesh: THREE.Group;
  home: THREE.Vector3;
  island: number;
  alive: boolean;
  phase: number;
}
interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number; size: number;
}

const ISLANDS: Island[] = [
  { x: 0, z: 4, radius: 10 },
  { x: 0, z: -17, radius: 8.5 },
  { x: 0, z: -38, radius: 9 },
];
const BRIDGES: Bridge[] = [
  { x: 0, z: -4.9, width: 3.4, depth: 3 },
  { x: 0, z: -9.5, width: 3.4, depth: 2 },
  { x: 0, z: -24.5, width: 3.4, depth: 3 },
  { x: 0, z: -30.2, width: 3.4, depth: 2.4 },
];
const CRYSTAL_POSITIONS = [
  [0, 5], [0, 2], [0, -1.2], [-3.2, 0.2], [3.2, 0.2], [4.8, 4],
  [0, -5.1], [0, -9.5], [0, -12], [0, -15],
  [-3.5, -17], [3.5, -18], [0, -21], [0, -25.5],
  [0, -30], [0, -33], [-3.5, -36], [3.5, -37], [0, -39.5],
];
const PARTICLE_COUNT = 280;
const DASH_COOLDOWN = 1.05;

function random(min: number, max: number) { return min + Math.random() * (max - min); }
function material(color: THREE.ColorRepresentation) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

export class GameEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 0.15, 220);
  private settings: Settings;
  private input: GameInput;
  private callbacks: Callbacks;
  private host: HTMLDivElement;
  private resizeObserver: ResizeObserver;
  private frame = 0;
  private lastTime = 0;
  private active = false;
  private disposed = false;
  private clock = 0;
  private duration = 0;
  private stats: GameStats = { ...INITIAL_STATS };
  private hudTick = 0;
  private eventId = 0;
  private keys = new Set<string>();
  private player = new THREE.Group();
  private character = new THREE.Group();
  private legs: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private cape: THREE.Mesh;
  private blob: THREE.Mesh;
  private velocity = new THREE.Vector3();
  private movement = new THREE.Vector3();
  private dashDirection = new THREE.Vector3(0, 0, -1);
  private grounded = true;
  private jumps = 0;
  private coyote = 0.1;
  private jumpBuffer = 0;
  private dashTime = 0;
  private dashCooldown = 0;
  private invulnerable = 0;
  private checkpoint = 0;
  private comboTimer = 0;
  private comboCount = 0;
  private shake = 0;
  private squash = 0;
  private stepTimer = 0;
  private yaw = 0;
  private pitch = 0.55;
  private dragging: { id: number; x: number; y: number } | null = null;
  private cameraTarget = new THREE.Vector3();
  private cameraDesired = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private crystals: Crystal[] = [];
  private crystalMesh: THREE.InstancedMesh;
  private glowMesh: THREE.InstancedMesh;
  private obstacles: Obstacle[] = [];
  private guardians: Guardian[] = [];
  private particles: Particle[] = [];
  private particleMesh: THREE.InstancedMesh;
  private particleCursor = 0;
  private fireflies: THREE.Points;
  private portal = new THREE.Group();
  private portalRing: THREE.Mesh;
  private portalMaterial: THREE.ShaderMaterial;
  private portalLights: THREE.InstancedMesh;
  private terrainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private frameAverage = 16;
  private qualityTick = 0;
  private maxPixelRatio = 1.75;
  private glowTexture: THREE.CanvasTexture;

  constructor(host: HTMLDivElement, input: GameInput, callbacks: Callbacks, settings: Settings) {
    this.host = host;
    this.input = input;
    this.callbacks = callbacks;
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ antialias: settings.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label', 'Skybound 3D adventure. Move with WASD, jump with Space, and dash with Shift.');
    this.renderer.domElement.setAttribute('role', 'img');
    host.appendChild(this.renderer.domElement);

    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 64;
    const context = glowCanvas.getContext('2d')!;
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,0.65)');
    gradient.addColorStop(0.18, 'rgba(255,230,170,0.25)');
    gradient.addColorStop(1, 'rgba(255,200,100,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    this.glowTexture = new THREE.CanvasTexture(glowCanvas);

    this.createEnvironment();
    this.createTerrain();
    this.createScenery();
    const playerParts = this.createPlayer();
    this.cape = playerParts.cape;
    this.blob = playerParts.blob;

    this.crystals = CRYSTAL_POSITIONS.map(([x, z], i) => ({ x, z, active: true, phase: i * 1.7 }));
    this.crystalMesh = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: '#ffd16a', emissive: '#ff9c27', emissiveIntensity: 0.65, roughness: 0.3, flatShading: true }),
      this.crystals.length,
    );
    this.glowMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.glowTexture, color: '#ffbb50', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      this.crystals.length,
    );
    this.crystalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.crystalMesh.frustumCulled = this.glowMesh.frustumCulled = false;
    this.scene.add(this.crystalMesh, this.glowMesh);

    this.createGuardians();
    const portalParts = this.createPortal();
    this.portalRing = portalParts.ring;
    this.portalMaterial = portalParts.shader;
    this.portalLights = portalParts.lights;

    this.particleMesh = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 }),
      PARTICLE_COUNT,
    );
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push({ x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 0 });
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummy.matrix);
      this.particleMesh.setColorAt(i, this.color.set('#ffd075'));
    }
    this.scene.add(this.particleMesh);

    const fireflyGeometry = new THREE.BufferGeometry();
    const fireflyPositions = new Float32Array(100 * 3);
    for (let i = 0; i < 100; i++) {
      fireflyPositions[i * 3] = random(-22, 22);
      fireflyPositions[i * 3 + 1] = random(0.5, 7);
      fireflyPositions[i * 3 + 2] = random(-55, 20);
    }
    fireflyGeometry.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3));
    this.fireflies = new THREE.Points(fireflyGeometry, new THREE.PointsMaterial({ color: '#ffe5a0', size: 0.075, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.fireflies);

    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.clearInput);
    this.renderer.domElement.addEventListener('pointerdown', this.pointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.pointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.pointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.pointerUp);
    this.applySettings(settings);
    this.resize();
    this.reset();
    this.frame = requestAnimationFrame(this.tick);
  }

  private createEnvironment() {
    this.scene.fog = new THREE.FogExp2('#a5b8aa', 0.0125);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(180, 16, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          topColor: { value: new THREE.Color('#5a939a') },
          bottomColor: { value: new THREE.Color('#ecd1a5') },
        },
        vertexShader: 'varying vec3 vPosition; void main(){ vPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vPosition; void main(){ float h = smoothstep(-0.25,0.75,normalize(vPosition).y); gl_FragColor = vec4(mix(bottomColor,topColor,h),1.0); }',
      }),
    );
    this.scene.add(sky);
    this.scene.add(new THREE.HemisphereLight('#fff0d1', '#355c55', 2.4));
    const sunlight = new THREE.DirectionalLight('#ffe0aa', 3.1);
    sunlight.position.set(-16, 35, 5);
    sunlight.target.position.set(0, 0, -18);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(1024, 1024);
    sunlight.shadow.camera.left = -34;
    sunlight.shadow.camera.right = 34;
    sunlight.shadow.camera.top = 38;
    sunlight.shadow.camera.bottom = -38;
    sunlight.shadow.camera.near = 1;
    sunlight.shadow.camera.far = 100;
    sunlight.shadow.normalBias = 0.035;
    sunlight.shadow.bias = -0.0003;
    this.scene.add(sunlight, sunlight.target);

    const sun = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12), new THREE.MeshBasicMaterial({ color: '#fff0c3' }));
    sun.position.set(-65, 45, -110);
    this.scene.add(sun);

    const clouds = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), material('#ced7c7'), 30);
    for (let i = 0; i < 30; i++) {
      this.dummy.position.set(random(-95, 95), random(-18, -8), random(-110, 45));
      this.dummy.scale.set(random(5, 15), random(0.6, 2), random(3, 8));
      this.dummy.rotation.set(0, random(0, Math.PI), 0);
      this.dummy.updateMatrix();
      clouds.setMatrixAt(i, this.dummy.matrix);
    }
    this.scene.add(clouds);

    for (let i = 0; i < 9; i++) {
      const distant = new THREE.Group();
      const radius = random(3, 7);
      const rock = new THREE.Mesh(new THREE.ConeGeometry(radius, radius * 2.7, 6), material(i % 2 ? '#719489' : '#628984'));
      rock.rotation.z = Math.PI;
      rock.position.y = -radius * 1.35;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.6, 6), material('#7f9d80'));
      distant.add(rock, top);
      for (let t = 0; t < 3; t++) {
        const tree = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.2, radius * 0.75, 5), material('#537c70'));
        tree.position.set(random(-radius * 0.5, radius * 0.5), radius * 0.37, random(-radius * 0.5, radius * 0.5));
        distant.add(tree);
      }
      distant.position.set((i % 2 ? -1 : 1) * random(27, 65), random(-6, 4), -i * 12 + 8);
      this.scene.add(distant);
    }
  }

  private createTerrain() {
    for (const island of ISLANDS) {
      const group = new THREE.Group();
      group.position.set(island.x, 0, island.z);
      const positions: number[] = [];
      const colors: number[] = [];
      const segments = 18;
      const outer: THREE.Vector3[] = [];
      const lower: THREE.Vector3[] = [];
      const bottom: THREE.Vector3[] = [];
      const color = new THREE.Color();
      for (let i = 0; i < segments; i++) {
        const angle = i / segments * Math.PI * 2;
        const radius = island.radius * random(0.98, 1.06);
        outer.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
        lower.push(new THREE.Vector3(Math.cos(angle) * radius * random(0.65, 0.9), random(-5, -2.8), Math.sin(angle) * radius * random(0.65, 0.9)));
        bottom.push(new THREE.Vector3(Math.cos(angle) * radius * 0.24 + 1, random(-11, -8), Math.sin(angle) * radius * 0.24));
      }
      const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, shade: THREE.Color) => {
        positions.push(...a.toArray(), ...b.toArray(), ...c.toArray());
        for (let i = 0; i < 3; i++) colors.push(shade.r, shade.g, shade.b);
      };
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        color.setHSL(random(0.22, 0.26), random(0.25, 0.4), random(0.29, 0.39));
        triangle(new THREE.Vector3(0, 0, 0), outer[next], outer[i], color);
        color.setHSL(0.43, random(0.08, 0.2), random(0.24, 0.36));
        triangle(outer[i], outer[next], lower[i], color);
        color.multiplyScalar(random(0.8, 1.1));
        triangle(outer[next], lower[next], lower[i], color);
        color.setHSL(0.44, 0.13, random(0.19, 0.3));
        triangle(lower[i], lower[next], bottom[i], color);
        triangle(lower[next], bottom[next], bottom[i], color);
        triangle(bottom[i], bottom[next], new THREE.Vector3(0, -13, 0), color);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      const terrain = new THREE.Mesh(geometry, this.terrainMaterial);
      terrain.receiveShadow = true;
      terrain.castShadow = true;
      group.add(terrain);
      this.scene.add(group);
    }

    const bridgeMaterial = material('#a2a58a');
    for (const bridge of BRIDGES) {
      const bridgeMesh = new THREE.Mesh(new THREE.BoxGeometry(bridge.width, 0.55, bridge.depth), bridgeMaterial);
      bridgeMesh.position.set(bridge.x, -0.27, bridge.z);
      bridgeMesh.receiveShadow = true;
      this.scene.add(bridgeMesh);
      for (const side of [-1, 1]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, bridge.depth), material('#697768'));
        edge.position.set(side * (bridge.width / 2 - 0.1), 0.06, bridge.z);
        this.scene.add(edge);
      }
    }
  }

  private createScenery() {
    const trees: { x: number; z: number; scale: number }[] = [];
    for (const island of ISLANDS) {
      for (let i = 0; i < 12; i++) {
        const angle = i / 12 * Math.PI * 2 + 0.1;
        const radius = island.radius * random(0.73, 0.88);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius + island.z;
        if (Math.abs(x) < 2.9) continue;
        trees.push({ x, z, scale: random(0.7, 1.4) });
      }
    }
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.24, 1.9, 5), material('#696552'), trees.length);
    const foliage = new THREE.InstancedMesh(new THREE.ConeGeometry(1.15, 2.6, 6), material('#3b6853'), trees.length * 3);
    trees.forEach((tree, i) => {
      this.obstacles.push({ x: tree.x, z: tree.z, radius: 0.24 * tree.scale, height: tree.scale * 2.5 });
      this.dummy.position.set(tree.x, 0.8 * tree.scale, tree.z);
      this.dummy.rotation.set(0, i * 1.3, 0);
      this.dummy.scale.setScalar(tree.scale);
      this.dummy.updateMatrix();
      trunks.setMatrixAt(i, this.dummy.matrix);
      for (let j = 0; j < 3; j++) {
        const scale = tree.scale * (1 - j * 0.19);
        this.dummy.position.y = (2.0 + j * 0.9) * tree.scale;
        this.dummy.scale.set(scale, scale, scale);
        this.dummy.updateMatrix();
        foliage.setMatrixAt(i * 3 + j, this.dummy.matrix);
        this.color.setHSL(0.35, 0.23 + j * 0.035, 0.24 + j * 0.045);
        foliage.setColorAt(i * 3 + j, this.color);
      }
    });
    trunks.castShadow = foliage.castShadow = true;
    this.scene.add(trunks, foliage);

    const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.1, 0.65, 3), material('#9cad69'), 650);
    for (let i = 0; i < 650; i++) {
      const island = ISLANDS[i % ISLANDS.length];
      const angle = random(0, Math.PI * 2);
      const radius = Math.sqrt(Math.random()) * island.radius * 0.92;
      let x = Math.cos(angle) * radius;
      if (Math.abs(x) < 1.2) x += x > 0 ? 1.4 : -1.4;
      this.dummy.position.set(x, 0.2, island.z + Math.sin(angle) * radius);
      this.dummy.rotation.set(random(-0.18, 0.18), random(0, 6), random(-0.2, 0.2));
      this.dummy.scale.set(random(0.65, 1.5), random(0.4, 1.3), random(0.6, 1.5));
      this.dummy.updateMatrix();
      grass.setMatrixAt(i, this.dummy.matrix);
      this.color.setHSL(random(0.19, 0.26), 0.3, random(0.38, 0.59));
      grass.setColorAt(i, this.color);
    }
    this.scene.add(grass);

    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), material('#8a9984'), 48);
    for (let i = 0; i < 48; i++) {
      const island = ISLANDS[i % 3];
      const angle = random(0, Math.PI * 2);
      const radius = random(0.66, 0.93) * island.radius;
      let x = Math.cos(angle) * radius;
      if (Math.abs(x) < 2.2) x += x > 0 ? 2.3 : -2.3;
      this.dummy.position.set(x, random(0.1, 0.35), island.z + Math.sin(angle) * radius);
      this.dummy.rotation.set(random(0, 6), random(0, 6), 0);
      this.dummy.scale.set(random(0.3, 1.1), random(0.3, 0.85), random(0.4, 1));
      this.dummy.updateMatrix();
      rocks.setMatrixAt(i, this.dummy.matrix);
      this.obstacles.push({ x, z: this.dummy.position.z, radius: Math.max(this.dummy.scale.x, this.dummy.scale.z) * 0.65, height: this.dummy.position.y + this.dummy.scale.y });
    }
    rocks.castShadow = true;
    this.scene.add(rocks);

    const path = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.78, 0.88, 0.1, 6), material('#acac8a'), 41);
    let count = 0;
    for (let z = 9; z > -43; z -= 1.3) {
      if (!this.hasGround(0, z)) continue;
      this.dummy.position.set(Math.sin(z * 0.5) * 0.3, 0.035, z);
      this.dummy.rotation.set(0, random(0, 1), 0);
      this.dummy.scale.set(random(0.8, 1.1), 1, random(0.65, 0.9));
      this.dummy.updateMatrix();
      path.setMatrixAt(count++, this.dummy.matrix);
    }
    path.count = count;
    path.receiveShadow = true;
    this.scene.add(path);

    const stoneMaterial = material('#aeb29b');
    for (const [x, z, height] of [[-5, -15, 2.7], [5.5, -18, 1.8], [-4.2, -41, 3.5], [4.2, -41, 2.5], [-5, 6, 1.5]]) {
      this.obstacles.push({ x, z, radius: 0.5, height });
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.5, height, 6), stoneMaterial);
      column.position.set(x, height / 2, z);
      column.rotation.z = x > 0 ? -0.12 : 0.08;
      column.castShadow = true;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.3, 1.05), stoneMaterial);
      foot.position.set(x, 0.13, z);
      this.scene.add(column, foot);
    }
  }

  private createPlayer() {
    const coat = material('#234c48');
    const cream = material('#efe3bd');
    const boot = material('#3d3934');
    const orange = new THREE.MeshLambertMaterial({ color: '#ef8642', side: THREE.DoubleSide, flatShading: true });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.39, 0.74, 7), coat);
    body.position.y = 0.96;
    this.character.add(body);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.39, 8, 6), cream);
    hood.position.set(0, 1.57, 0);
    hood.scale.set(1, 1.05, 0.94);
    this.character.add(hood);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.265, 8, 6), material('#253c36'));
    face.position.set(0, 1.54, -0.245);
    face.scale.set(0.88, 0.87, 0.4);
    this.character.add(face);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.027, 5, 4), new THREE.MeshBasicMaterial({ color: '#ffda83' }));
      eye.position.set(side * 0.085, 1.56, -0.348);
      this.character.add(eye);
      const leg = new THREE.Group();
      leg.position.set(side * 0.17, 0.62, 0);
      const legMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.24), coat);
      legMesh.position.y = -0.23;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.19, 0.36), boot);
      foot.position.set(0, -0.51, -0.065);
      leg.add(legMesh, foot);
      this.legs.push(leg);
      this.character.add(leg);
      const arm = new THREE.Group();
      arm.position.set(side * 0.37, 1.19, 0);
      const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.08, 0.5, 5), coat);
      armMesh.position.y = -0.22;
      arm.add(armMesh);
      this.arms.push(arm);
      this.character.add(arm);
    }
    const scarf = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.32, 0.14, 7), orange);
    scarf.position.y = 1.3;
    this.character.add(scarf);

    const capeGeometry = new THREE.BufferGeometry();
    capeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.28, 0, 0, -0.5, -0.81, 0.31, 0.5, -0.81, 0.31,
      -0.28, 0, 0, 0.5, -0.81, 0.31, 0.28, 0, 0,
    ], 3));
    capeGeometry.computeVertexNormals();
    const cape = new THREE.Mesh(capeGeometry, orange);
    cape.position.set(0, 1.28, 0.25);
    this.character.add(cape);
    this.character.traverse((object) => { if (object instanceof THREE.Mesh) object.castShadow = true; });
    this.player.add(this.character);
    this.scene.add(this.player);

    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.53, 16), new THREE.MeshBasicMaterial({ color: '#183c34', transparent: true, opacity: 0.28, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    this.scene.add(blob);
    return { cape, blob };
  }

  private createGuardians() {
    const purple = material('#57465e');
    const dark = material('#393347');
    const red = new THREE.MeshBasicMaterial({ color: '#ff8564' });
    const homes = [[3.4, -1, 0], [-2.2, -15, 1], [1.7, -21, 1], [-2.4, -35, 2], [2.2, -40, 2]];
    homes.forEach(([x, z, island], i) => {
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), purple);
      body.scale.set(1, 0.8, 1);
      body.castShadow = true;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 4), dark);
      crown.position.y = 0.6;
      group.add(body, crown);
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.12), red);
        eye.position.set(side * 0.24, 0.07, 0.58);
        group.add(eye);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.035, 4, 16), red);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.4;
      group.add(ring);
      group.position.set(x, 1, z);
      this.guardians.push({ mesh: group, home: new THREE.Vector3(x, 1, z), island, alive: true, phase: i * 1.9 });
      this.scene.add(group);
    });
  }

  private createPortal() {
    this.portal.position.set(0, 0, -43);
    const arch = new THREE.InstancedMesh(new THREE.BoxGeometry(0.77, 0.71, 0.75), material('#879487'), 22);
    for (let i = 0; i < 22; i++) {
      const angle = i / 22 * Math.PI * 2;
      this.dummy.position.set(Math.sin(angle) * 2.5, 2.75 + Math.cos(angle) * 2.5, 0);
      this.dummy.rotation.set(0, 0, -angle);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      arch.setMatrixAt(i, this.dummy.matrix);
    }
    arch.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.16, 0.095, 6, 48), new THREE.MeshBasicMaterial({ color: '#778c76' }));
    ring.position.y = 2.75;
    const shader = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: { time: { value: 0 }, ready: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}',
      fragmentShader: `
        uniform float time; uniform float ready; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5;
          float d = length(p) * 2.0;
          float a = atan(p.y, p.x);
          float swirl = sin(d * 25.0 - time * 3.0 + a * 3.0) * 0.5 + 0.5;
          float edge = pow(d, 3.0);
          vec3 color = mix(vec3(0.2,0.45,0.39),vec3(1.0,0.55,0.16),ready);
          color += vec3(0.35,0.26,0.13) * swirl;
          float alpha = (0.07 + edge * 0.53 + swirl * 0.07) * (0.2 + ready * 0.8);
          gl_FragColor = vec4(color, alpha * (1.0 - smoothstep(0.94,1.0,d)));
        }
      `,
    });
    const disk = new THREE.Mesh(new THREE.CircleGeometry(2.13, 48), shader);
    disk.position.y = 2.75;
    const lights = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: '#ffffff' }), SHARDS_TO_UNLOCK);
    for (let i = 0; i < SHARDS_TO_UNLOCK; i++) {
      const a = i / SHARDS_TO_UNLOCK * Math.PI * 2;
      this.dummy.position.set(Math.sin(a) * 2.5, 2.75 + Math.cos(a) * 2.5, 0.43);
      this.dummy.rotation.set(0, 0, a);
      this.dummy.scale.set(1, 1.4, 1);
      this.dummy.updateMatrix();
      lights.setMatrixAt(i, this.dummy.matrix);
      lights.setColorAt(i, this.color.set('#51695c'));
    }
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.28, 2), material('#9b9e87'));
    plinth.position.y = 0.07;
    this.portal.add(arch, ring, disk, lights, plinth);
    this.scene.add(this.portal);
    return { ring, shader, lights };
  }

  private hasGround(x: number, z: number) {
    return ISLANDS.some((island) => Math.hypot(x - island.x, z - island.z) < island.radius * 0.975)
      || BRIDGES.some((bridge) => Math.abs(x - bridge.x) < bridge.width / 2 && Math.abs(z - bridge.z) < bridge.depth / 2);
  }

  private keyDown = (event: KeyboardEvent) => {
    if (!this.active || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE', 'KeyF'].includes(event.code)) {
      event.preventDefault();
      this.keys.add(event.code);
      if (!event.repeat && event.code === 'Space') this.jumpBuffer = 0.16;
      if (!event.repeat && ['ShiftLeft', 'ShiftRight', 'KeyF'].includes(event.code)) this.input.dash = true;
    }
  };
  private keyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private clearInput = () => {
    this.keys.clear();
    this.input.x = this.input.z = 0;
    this.input.jump = this.input.dash = false;
    this.dragging = null;
    this.jumpBuffer = 0;
  };
  private pointerDown = (event: PointerEvent) => {
    if (!this.active || event.button !== 0 || this.dragging) return;
    this.dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };
  private pointerMove = (event: PointerEvent) => {
    if (!this.dragging || this.dragging.id !== event.pointerId || !this.active) return;
    this.yaw -= (event.clientX - this.dragging.x) * 0.005;
    this.pitch = THREE.MathUtils.clamp(this.pitch + (event.clientY - this.dragging.y) * 0.003, 0.27, 0.9);
    this.dragging.x = event.clientX;
    this.dragging.y = event.clientY;
  };
  private pointerUp = (event: PointerEvent) => {
    if (this.dragging?.id === event.pointerId) this.dragging = null;
  };

  private resize = () => {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width < 1 || height < 1) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.fov = width < height ? 64 : 55;
    this.camera.updateProjectionMatrix();
    if (!this.active && this.lastTime > 0) {
      this.updateCamera(1);
      this.renderer.render(this.scene, this.camera);
    }
  };

  applySettings(settings: Settings) {
    this.settings = settings;
    const mobile = window.matchMedia('(pointer: coarse)').matches;
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, settings.quality === 'high' ? 2 : mobile ? 1.25 : 1.65);
    this.renderer.setPixelRatio(settings.quality === 'low' ? Math.min(1, this.maxPixelRatio) : this.maxPixelRatio);
    this.renderer.shadowMap.enabled = settings.quality === 'high' || (settings.quality === 'auto' && !mobile);
    if (!this.active && this.lastTime > 0) this.renderer.render(this.scene, this.camera);
  }

  setActive(active: boolean) {
    this.active = active;
    this.lastTime = performance.now();
    if (!active) {
      this.clearInput();
      this.callbacks.onStats({ ...this.stats });
    }
  }

  reset() {
    this.stats = { ...INITIAL_STATS };
    this.clock = this.duration = this.hudTick = 0;
    this.checkpoint = this.comboTimer = this.comboCount = 0;
    this.dashTime = this.dashCooldown = this.invulnerable = 0;
    this.shake = this.squash = this.stepTimer = 0;
    this.frameAverage = 16;
    this.qualityTick = 0;
    this.yaw = 0;
    this.pitch = 0.55;
    this.player.position.set(0, 0.04, 8);
    this.player.visible = true;
    this.character.rotation.set(0, 0, 0);
    this.character.scale.setScalar(1);
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.jumps = 0;
    this.coyote = 0.1;
    this.crystals.forEach((crystal) => { crystal.active = true; });
    this.guardians.forEach((guardian) => {
      guardian.alive = true;
      guardian.mesh.visible = true;
      guardian.mesh.position.copy(guardian.home);
    });
    this.particles.forEach((particle) => { particle.life = 0; });
    this.terrainMaterial.color.set('#ffffff');
    this.clearInput();
    this.updatePortal();
    this.cameraTarget.copy(this.player.position);
    this.camera.position.set(0, 8.5, 20);
    this.updateCamera(1);
    this.updateCrystals(0);
    this.updateParticles(0);
    this.callbacks.onStats({ ...this.stats });
    this.renderer.render(this.scene, this.camera);
  }

  private emit(text: string, kind: GameEvent['kind']) {
    this.callbacks.onEvent({ id: ++this.eventId, text, kind });
  }

  private burst(x: number, y: number, z: number, count: number, color: string, force = 3) {
    for (let i = 0; i < count; i++) {
      const index = this.particleCursor++ % PARTICLE_COUNT;
      const particle = this.particles[index];
      particle.x = x; particle.y = y; particle.z = z;
      particle.vx = random(-1, 1) * force;
      particle.vy = random(0.25, 1.5) * force;
      particle.vz = random(-1, 1) * force;
      particle.life = particle.maxLife = random(0.28, 0.65);
      particle.size = random(0.045, 0.13);
      this.particleMesh.setColorAt(index, this.color.set(color));
    }
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
  }

  private updatePlayer(dt: number) {
    const held = (key: string) => this.keys.has(key) ? 1 : 0;
    let x = this.input.x + held('KeyD') + held('ArrowRight') - held('KeyA') - held('ArrowLeft');
    let z = this.input.z + held('KeyS') + held('ArrowDown') - held('KeyW') - held('ArrowUp');
    const length = Math.hypot(x, z);
    if (length > 1) { x /= length; z /= length; }
    this.yaw += (held('KeyQ') - held('KeyE')) * dt * 1.6;
    this.movement.set(x * Math.cos(this.yaw) + z * Math.sin(this.yaw), 0, z * Math.cos(this.yaw) - x * Math.sin(this.yaw));
    if (this.input.jump) { this.jumpBuffer = 0.16; this.input.jump = false; }
    this.jumpBuffer -= dt;
    this.coyote = this.grounded ? 0.1 : this.coyote - dt;
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.dashTime = Math.max(0, this.dashTime - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0 || this.jumps < 2)) {
      const double = !this.grounded && this.coyote <= 0;
      this.velocity.y = double ? 8.3 : 9.1;
      this.jumps = double ? 2 : 1;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.squash = -0.2;
      audio.play('jump');
      this.burst(this.player.position.x, this.player.position.y + 0.15, this.player.position.z, double ? 16 : 10, double ? '#ffd482' : '#b5c48b', 2.2);
    }
    if (this.input.dash) {
      this.input.dash = false;
      if (this.dashCooldown <= 0) {
        this.dashTime = 0.22;
        this.dashCooldown = DASH_COOLDOWN;
        if (this.movement.lengthSq() > 0.01) this.dashDirection.copy(this.movement).normalize();
        else this.dashDirection.set(-Math.sin(this.character.rotation.y), 0, -Math.cos(this.character.rotation.y));
        this.shake = Math.max(this.shake, 0.1);
        this.burst(this.player.position.x, this.player.position.y + 0.7, this.player.position.z, 15, '#ffe3a7', 2.6);
        audio.play('dash');
      }
    }

    const speed = 7.4;
    const smooth = 1 - Math.exp(-24 * dt);
    if (this.dashTime > 0) {
      this.velocity.x = this.dashDirection.x * 23;
      this.velocity.z = this.dashDirection.z * 23;
      this.burst(this.player.position.x, this.player.position.y + 0.8, this.player.position.z, 2, '#ffd38b', 0.8);
    } else {
      this.velocity.x += (this.movement.x * speed - this.velocity.x) * smooth;
      this.velocity.z += (this.movement.z * speed - this.velocity.z) * smooth;
    }
    this.velocity.y -= (this.dashTime > 0 ? 9 : 24) * dt;
    this.player.position.addScaledVector(this.velocity, dt);
    for (const obstacle of this.obstacles) {
      if (this.player.position.y > obstacle.height || this.player.position.y < -0.5) continue;
      const dx = this.player.position.x - obstacle.x;
      const dz = this.player.position.z - obstacle.z;
      const distance = Math.hypot(dx, dz);
      const clearance = obstacle.radius + 0.3;
      if (distance < clearance && distance > 0.001) {
        this.player.position.x += dx / distance * (clearance - distance);
        this.player.position.z += dz / distance * (clearance - distance);
      }
    }
    const onGround = this.hasGround(this.player.position.x, this.player.position.z);
    if (this.player.position.y <= 0.04 && this.player.position.y > -0.7 && onGround && this.velocity.y <= 0) {
      if (!this.grounded && this.velocity.y < -4) {
        this.squash = 0.23;
        this.burst(this.player.position.x, 0.1, this.player.position.z, 8, '#b9c598', 1.8);
      }
      this.player.position.y = 0.04;
      this.velocity.y = 0;
      this.grounded = true;
      this.jumps = 0;
      ISLANDS.forEach((island, i) => {
        if (Math.hypot(this.player.position.x - island.x, this.player.position.z - island.z) < island.radius * 0.7) this.checkpoint = i;
      });
    } else {
      this.grounded = false;
      if (this.coyote <= 0 && this.jumps === 0) this.jumps = 1;
    }
    if (this.player.position.y < -9) {
      this.hurt(true);
      if (!this.active) return;
    }

    const moving = Math.min(1, Math.hypot(this.velocity.x, this.velocity.z) / speed);
    if (this.movement.lengthSq() > 0.025) {
      const targetAngle = Math.atan2(-this.movement.x, -this.movement.z);
      const angleDiff = Math.atan2(Math.sin(targetAngle - this.character.rotation.y), Math.cos(targetAngle - this.character.rotation.y));
      this.character.rotation.y += angleDiff * (1 - Math.exp(-20 * dt));
    }
    this.squash *= Math.exp(-13 * dt);
    this.character.scale.set(1 + this.squash * 0.5, 1 - this.squash, 1 + this.squash * 0.5);
    this.character.rotation.x = THREE.MathUtils.lerp(this.character.rotation.x, this.dashTime > 0 ? -0.33 : 0, smooth);
    const walk = Math.sin(this.clock * 17) * moving * (this.grounded ? 0.65 : 0.1);
    this.legs[0].rotation.x = walk;
    this.legs[1].rotation.x = -walk;
    this.arms[0].rotation.x = -walk * 0.7;
    this.arms[1].rotation.x = walk * 0.7;
    this.cape.rotation.x = -0.12 - moving * 0.4 + Math.sin(this.clock * 9) * 0.07;
    this.cape.rotation.z = Math.sin(this.clock * 5) * (0.035 + moving * 0.045);
    this.character.position.y = this.grounded ? Math.abs(Math.sin(this.clock * 17)) * 0.045 * moving : 0;
    this.player.visible = this.invulnerable <= 0 || Math.floor(this.invulnerable * 12) % 2 === 0;
    this.blob.visible = onGround && this.player.position.y >= 0;
    this.blob.position.set(this.player.position.x, 0.12, this.player.position.z);
    this.blob.scale.setScalar(Math.max(0.45, 1 - this.player.position.y * 0.13));
    this.stepTimer += dt;
    if (moving > 0.2 && this.grounded && this.stepTimer > 0.14) {
      this.stepTimer = 0;
      this.burst(this.player.position.x, 0.13, this.player.position.z, 2, '#b8c292', 0.7);
    }
    this.stats.dashReady = 1 - this.dashCooldown / DASH_COOLDOWN;
  }

  private hurt(fall = false) {
    if (!fall && this.invulnerable > 0) return;
    this.stats.lives--;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.stats.combo = 1;
    this.invulnerable = 2;
    this.shake = 0.6;
    audio.play('hurt');
    this.emit(fall ? 'THE WIND CAUGHT YOU' : 'WATCH THE GUARDIANS', 'hurt');
    if (this.stats.lives <= 0) { this.finish('lives'); return; }
    if (fall) {
      const island = ISLANDS[this.checkpoint];
      this.player.position.set(island.x, 0.08, island.z + 2.5);
      this.velocity.set(0, 0, 0);
      this.dashTime = 0;
      this.grounded = true;
      this.jumps = 0;
      this.burst(this.player.position.x, 1, this.player.position.z, 30, '#fce1a3', 2.5);
      this.cameraTarget.copy(this.player.position);
    } else {
      this.velocity.y = 5;
      this.grounded = false;
      this.jumps = 1;
    }
    this.callbacks.onStats({ ...this.stats });
  }

  private updateCrystals(dt: number) {
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) { this.comboCount = 0; this.stats.combo = 1; }
    this.crystals.forEach((crystal, index) => {
      const y = 1.05 + Math.sin(this.clock * 2.7 + crystal.phase) * 0.17;
      if (crystal.active && this.active && Math.hypot(this.player.position.x - crystal.x, this.player.position.z - crystal.z) < 1.05 && Math.abs(this.player.position.y + 0.8 - y) < 1.7) {
        crystal.active = false;
        this.comboCount++;
        this.comboTimer = 3.2;
        this.stats.combo = Math.min(5, 1 + Math.floor((this.comboCount - 1) / 2));
        const points = 100 * this.stats.combo;
        this.stats.score += points;
        this.stats.shards++;
        this.stats.totalShards++;
        this.squash = -0.12;
        this.burst(crystal.x, y, crystal.z, 22, '#ffcf69', 3.2);
        audio.play('shard', this.stats.combo);
        this.emit(`+${points}${this.stats.combo > 1 ? ` / ${this.stats.combo}x COMBO` : ' / SUNSHARD'}`, 'shard');
        if (this.stats.shards === SHARDS_TO_UNLOCK) {
          this.stats.portalReady = true;
          this.shake = 0.25;
          audio.play('portal');
          this.emit('THE PORTAL IS OPEN', 'portal');
          this.burst(0, 2.7, -43, 65, '#ffc56a', 6);
        }
        this.updatePortal();
      }
      this.dummy.position.set(crystal.x, y, crystal.z);
      this.dummy.rotation.set(0.08, this.clock * 1.5 + crystal.phase, 0.06);
      this.dummy.scale.set(crystal.active ? 0.3 : 0, crystal.active ? 0.51 : 0, crystal.active ? 0.3 : 0);
      this.dummy.updateMatrix();
      this.crystalMesh.setMatrixAt(index, this.dummy.matrix);
      this.dummy.quaternion.copy(this.camera.quaternion);
      this.dummy.scale.setScalar(crystal.active ? 2.2 : 0);
      this.dummy.updateMatrix();
      this.glowMesh.setMatrixAt(index, this.dummy.matrix);
    });
    this.crystalMesh.instanceMatrix.needsUpdate = true;
    this.glowMesh.instanceMatrix.needsUpdate = true;
  }

  private updateGuardians(dt: number) {
    for (const guardian of this.guardians) {
      if (!guardian.alive) continue;
      const position = guardian.mesh.position;
      const dx = this.player.position.x - position.x;
      const dz = this.player.position.z - position.z;
      const distance = Math.hypot(dx, dz);
      const island = ISLANDS[guardian.island];
      const playerOnIsland = Math.hypot(this.player.position.x, this.player.position.z - island.z) < island.radius;
      let targetX: number;
      let targetZ: number;
      if (distance < 7.5 && playerOnIsland && this.duration > 3.5) {
        targetX = this.player.position.x;
        targetZ = this.player.position.z;
      } else {
        targetX = guardian.home.x + Math.cos(this.clock * 0.7 + guardian.phase) * 1.4;
        targetZ = guardian.home.z + Math.sin(this.clock * 0.7 + guardian.phase) * 1.4;
      }
      const targetDistance = Math.hypot(targetX - position.x, targetZ - position.z);
      if (targetDistance > 0.1) {
        const move = Math.min(targetDistance, dt * (1.65 + Math.min(1.8, (this.stats.realm - 1) * 0.25)));
        position.x += (targetX - position.x) / targetDistance * move;
        position.z += (targetZ - position.z) / targetDistance * move;
        guardian.mesh.rotation.y = Math.atan2(targetX - position.x, targetZ - position.z);
      }
      position.y = 0.95 + Math.sin(this.clock * 3.1 + guardian.phase) * 0.14;
      guardian.mesh.rotation.z = Math.sin(this.clock * 2 + guardian.phase) * 0.06;
      if (distance < (this.dashTime > 0 ? 1.65 : 1.05) && Math.abs(this.player.position.y + 0.6 - position.y) < 1.1) {
        if (this.dashTime > 0) {
          guardian.alive = false;
          guardian.mesh.visible = false;
          const points = 250 * this.stats.combo;
          this.stats.score += points;
          this.shake = 0.4;
          this.burst(position.x, position.y, position.z, 34, '#b291ad', 4.5);
          this.burst(position.x, position.y, position.z, 16, '#ffd175', 5);
          this.emit(`+${points} / GUARDIAN CLEARED`, 'dash');
          audio.play('guardian');
        } else {
          this.hurt();
          if (!this.active) return;
        }
      }
    }
  }

  private updatePortal() {
    (this.portalRing.material as THREE.MeshBasicMaterial).color.set(this.stats.portalReady ? '#ffc668' : '#627b68');
    this.portalMaterial.uniforms.ready.value = this.stats.portalReady ? 1 : this.stats.shards / SHARDS_TO_UNLOCK * 0.35;
    for (let i = 0; i < SHARDS_TO_UNLOCK; i++) this.portalLights.setColorAt(i, this.color.set(i < this.stats.shards ? '#ffcb71' : '#52695c'));
    if (this.portalLights.instanceColor) this.portalLights.instanceColor.needsUpdate = true;
  }

  private nextRealm() {
    this.stats.score += 1000;
    this.stats.realm++;
    const timeBonus = Math.min(35, RUN_TIME - this.stats.time);
    this.stats.time += timeBonus;
    this.stats.lives = Math.min(3, this.stats.lives + 1);
    this.stats.shards = 0;
    this.stats.portalReady = false;
    this.checkpoint = 0;
    this.player.position.set(0, 0.04, 8);
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.jumps = 0;
    this.invulnerable = 2;
    this.dashTime = this.dashCooldown = 0;
    this.yaw = 0;
    this.cameraTarget.copy(this.player.position);
    this.camera.position.set(0, 8.5, 20);
    this.crystals.forEach((crystal) => { crystal.active = true; });
    this.guardians.forEach((guardian) => {
      guardian.alive = true;
      guardian.mesh.visible = true;
      guardian.mesh.position.copy(guardian.home);
    });
    this.terrainMaterial.color.set(['#ffffff', '#e6d7b6', '#bfdace', '#c6d8e0'][(this.stats.realm - 1) % 4]);
    this.updatePortal();
    this.burst(0, 1, 8, 75, '#ffcb71', 6);
    this.shake = 0.5;
    audio.play('portal');
    this.emit(`REALM ${this.stats.realm} / +1,000 / +${Math.round(timeBonus)} SECONDS`, 'portal');
    this.callbacks.onStats({ ...this.stats });
  }

  private updateParticles(dt: number) {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const particle = this.particles[i];
      particle.life -= dt;
      if (particle.life > 0) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.z += particle.vz * dt;
        particle.vy -= dt * 8;
        this.dummy.position.set(particle.x, particle.y, particle.z);
        this.dummy.rotation.set(this.clock * 2 + i, this.clock * 3, 0);
        this.dummy.scale.setScalar(particle.size * Math.min(1, particle.life / particle.maxLife * 2));
      } else {
        this.dummy.scale.setScalar(0);
      }
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
  }

  private updateCamera(dt: number) {
    const p = this.player.position;
    this.lookTarget.set(p.x, Math.max(-2, p.y) + 1.1, p.z);
    this.cameraTarget.lerp(this.lookTarget, 1 - Math.exp(-9 * dt));
    const distance = this.camera.aspect < 1 ? 15.5 : 12;
    this.cameraDesired.set(
      this.cameraTarget.x + Math.sin(this.yaw) * distance * Math.cos(this.pitch),
      this.cameraTarget.y + Math.sin(this.pitch) * distance,
      this.cameraTarget.z + Math.cos(this.yaw) * distance * Math.cos(this.pitch),
    );
    this.camera.position.lerp(this.cameraDesired, 1 - Math.exp(-12 * dt));
    this.shake *= Math.exp(-12 * dt);
    if (this.settings.shake && this.shake > 0.005) {
      this.camera.position.x += random(-1, 1) * this.shake;
      this.camera.position.y += random(-1, 1) * this.shake;
    }
    this.lookTarget.copy(this.cameraTarget);
    this.lookTarget.x -= Math.sin(this.yaw) * 1.4;
    this.lookTarget.z -= Math.cos(this.yaw) * 1.4;
    this.camera.lookAt(this.lookTarget);
    const targetFov = (this.camera.aspect < 1 ? 64 : 55) + (this.dashTime > 0 && this.settings.shake ? 7 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.02) {
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-10 * dt));
      this.camera.updateProjectionMatrix();
    }
  }

  private finish(reason: GameResult['reason']) {
    this.active = false;
    this.clearInput();
    this.player.visible = true;
    this.callbacks.onStats({ ...this.stats });
    audio.play('over');
    this.callbacks.onEnd({
      score: this.stats.score,
      shards: this.stats.totalShards,
      realm: this.stats.realm,
      duration: this.duration,
      reason,
    });
  }

  private tick = (now: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    const rawDt = this.lastTime ? Math.max(0, (now - this.lastTime) / 1000) : 1 / 60;
    this.lastTime = now;
    if (!this.active || document.hidden) return;
    const dt = Math.min(rawDt, 0.1);
    this.clock += dt;
    this.duration += rawDt;
    this.stats.elapsed = this.duration;
    this.stats.time = Math.max(0, this.stats.time - rawDt);
    if (this.stats.time <= 0) { this.finish('time'); return; }
    // Small simulation steps keep jumps and collisions stable during a dropped frame.
    let remaining = dt;
    while (remaining > 0.0001 && this.active) {
      const step = Math.min(remaining, 1 / 60);
      this.updatePlayer(step);
      if (!this.active) break;
      this.updateCrystals(step);
      this.updateGuardians(step);
      remaining -= step;
    }
    if (!this.active) { this.renderer.render(this.scene, this.camera); return; }
    if (this.stats.portalReady && Math.abs(this.player.position.x) < 1.8 && Math.abs(this.player.position.z + 43) < 1.4 && this.player.position.y < 3) this.nextRealm();
    this.updateParticles(dt);
    this.updateCamera(dt);
    this.portalMaterial.uniforms.time.value = this.clock;
    this.fireflies.position.y = Math.sin(this.clock * 0.4) * 0.25;
    this.fireflies.position.x = Math.sin(this.clock * 0.2) * 0.3;
    this.renderer.render(this.scene, this.camera);

    this.hudTick += dt;
    if (this.hudTick > 0.08) {
      this.hudTick = 0;
      this.callbacks.onStats({ ...this.stats });
    }

    // Adapt resolution rather than simulation speed on slower GPUs.
    this.frameAverage = this.frameAverage * 0.98 + Math.min(rawDt * 1000, 80) * 0.02;
    this.qualityTick += dt;
    if (this.settings.quality === 'auto' && this.qualityTick > 3) {
      this.qualityTick = 0;
      const ratio = this.renderer.getPixelRatio();
      if (this.frameAverage > 23 && ratio > 0.75) this.renderer.setPixelRatio(Math.max(0.75, ratio - 0.15));
      else if (this.frameAverage < 17 && ratio < this.maxPixelRatio) this.renderer.setPixelRatio(Math.min(this.maxPixelRatio, ratio + 0.1));
    }
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.clearInput);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.pointerDown);
    canvas.removeEventListener('pointermove', this.pointerMove);
    canvas.removeEventListener('pointerup', this.pointerUp);
    canvas.removeEventListener('pointercancel', this.pointerUp);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((mat) => materials.add(mat));
        if (object instanceof THREE.InstancedMesh) object.dispose();
      }
      if (object instanceof THREE.Light && 'shadow' in object) {
        (object.shadow as THREE.LightShadow | undefined)?.dispose();
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((mat) => mat.dispose());
    this.glowTexture.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }
}