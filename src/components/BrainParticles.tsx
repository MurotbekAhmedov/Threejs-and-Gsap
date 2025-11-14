import * as THREE from "three";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";

gsap.registerPlugin(ScrollTrigger);

const DESIRED_COUNT = 50000;
const HOVER_RADIUS = 0.55;
const HOVER_PUSH = 0.14;
const RELAX_SPEED = 0.12;

export default function BrainParticles() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // -----------------------------
    // SCENE
    // -----------------------------
    const scene = new THREE.Scene();

    // -----------------------------
    // CAMERA
    // -----------------------------
    const camera = new THREE.PerspectiveCamera(
      75,
      innerWidth / innerHeight,
      0.1,
      2000
    );
    const ORBIT_RADIUS = 3;
    camera.position.set(0, 0, ORBIT_RADIUS);

    // -----------------------------
    // RENDERER
    // -----------------------------
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    // -----------------------------
    // LIGHTS
    // -----------------------------
    scene.add(new THREE.AmbientLight(0x4466ff, 0.7));
    const hemi = new THREE.HemisphereLight(0x5aa0ff, 0x001122, 0.7);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0x88ccff, 0.8);
    dir.position.set(3, 4, 5);
    scene.add(dir);

    // -----------------------------
    // PARTICLE SPHERE
    // -----------------------------
    const sphereSize = 0.009; // размер шаров
    const sphereGeo = new THREE.SphereGeometry(1, 10, 10);
    sphereGeo.scale(sphereSize, sphereSize, sphereSize);

    const baseMat = new THREE.MeshStandardMaterial({
      metalness: 0.1,
      roughness: 0.4,
      vertexColors: true,
    });

    const mesh = new THREE.InstancedMesh(sphereGeo, baseMat, DESIRED_COUNT);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);

    // -----------------------------
    // ARRAYS
    // -----------------------------
    const start: THREE.Vector3[] = new Array(DESIRED_COUNT);
    const end: THREE.Vector3[] = new Array(DESIRED_COUNT);

    const tempPos = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();
    const tempScale = new THREE.Vector3(1, 1, 1);
    const tempMat = new THREE.Matrix4();

    let hoverPoint: THREE.Vector3 | null = null;
    const HOVER_RADIUS_SQ = HOVER_RADIUS * HOVER_RADIUS;

    // -----------------------------
    // LOAD BRAIN MODEL
    // -----------------------------
    const loader = new GLTFLoader();
    loader.load(
      "/models/brain-new/scene.gltf",
      (gltf) => {
        // find mesh
        let brainMesh: THREE.Mesh | null = null;
        gltf.scene.traverse((child: THREE.Object3D) => {
          if ((child as THREE.Mesh).isMesh) brainMesh = child as THREE.Mesh;
        });

        if (!brainMesh) {
          console.error("Brain mesh not found");
          return;
        }

        // clone geometry
        const geometry = (brainMesh as THREE.Mesh).geometry.clone();
        geometry.scale(0.02, 0.02, 0.02);
        geometry.rotateX(30);
        geometry.rotateY(135);
        geometry.center();

        (brainMesh as THREE.Mesh).geometry = geometry;

        // -----------------------------
        // MeshSurfaceSampler
        // -----------------------------
        const sampler = new MeshSurfaceSampler(brainMesh).build();

        const pos = new THREE.Vector3();
        const normal = new THREE.Vector3();

        interface SamplePoint {
          pos: THREE.Vector3;
          depth: number;
        }

        let result: SamplePoint[] = [];
        const MAX_DEPTH = 0.08;

        // генерируем точки
        for (let i = 0; i < DESIRED_COUNT; i++) {
          sampler.sample(pos, normal);

          const depth = Math.random() * MAX_DEPTH;

          const inner = pos.clone().addScaledVector(normal, -depth);

          result.push({ pos: inner, depth });
        }

        // -----------------------------
        // APPLY START/END + COLORS
        // -----------------------------
        const colors = new Float32Array(DESIRED_COUNT * 3);

        const colorSurface = new THREE.Color(0.3, 0.65, 1.0); // голубой
        const colorDeep = new THREE.Color(0.05, 0.1, 0.4); // темно-синий

        for (let i = 0; i < DESIRED_COUNT; i++) {
          const { pos, depth } = result[i];
          start[i] = pos.clone();

          end[i] = pos
            .clone()
            .add(
              new THREE.Vector3(
                (Math.random() - 0.5) * (0.25 + depth),
                -1.2 - depth * 3 - Math.random() * 1.4,
                (Math.random() - 0.5) * (0.25 + depth)
              )
            );

          // цвет
          const t = depth / MAX_DEPTH;
          const col = colorSurface.clone().lerp(colorDeep, t);

          colors[i * 3 + 0] = col.r;
          colors[i * 3 + 1] = col.g;
          colors[i * 3 + 2] = col.b;
        }

        sphereGeo.setAttribute(
          "color",
          new THREE.InstancedBufferAttribute(colors, 3)
        );

        // -----------------------------
        // INITIAL SHAPE
        // -----------------------------
        for (let i = 0; i < DESIRED_COUNT; i++) {
          tempPos.copy(start[i]);
          tempMat.compose(tempPos, tempQuat, tempScale);
          mesh.setMatrixAt(i, tempMat);
        }
        mesh.instanceMatrix.needsUpdate = true;

        // -----------------------------
        // RAYCAST FOR HOVER
        // -----------------------------
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        renderer.domElement.addEventListener("mousemove", (e) => {
          mouse.x = (e.clientX / innerWidth) * 2 - 1;
          mouse.y = -(e.clientY / innerHeight) * 2 + 1;
          raycaster.setFromCamera(mouse, camera);

          const hit = raycaster.intersectObject(mesh, true)[0];
          hoverPoint = hit ? hit.point.clone() : null;
        });

        // -----------------------------
        // UPDATE LOOP FOR INSTANCES
        // -----------------------------
        const proxy = { t: 0 };

        function updateInstances() {
          for (let i = 0; i < DESIRED_COUNT; i++) {
            const t = proxy.t;

            const basePos = start[i].clone().lerp(end[i], t);

            mesh.getMatrixAt(i, tempMat);
            tempMat.decompose(tempPos, tempQuat, tempScale);

            if (hoverPoint) {
              const dx = tempPos.x - hoverPoint.x;
              const dy = tempPos.y - hoverPoint.y;
              const dz = tempPos.z - hoverPoint.z;
              const distSq = dx * dx + dy * dy + dz * dz;

              if (distSq < HOVER_RADIUS_SQ) {
                const dist = Math.sqrt(distSq) || 1e-6;
                const k = (1 - dist / HOVER_RADIUS) * HOVER_PUSH;
                tempPos.x += (dx / dist) * k;
                tempPos.y += (dy / dist) * k;
                tempPos.z += (dz / dist) * k * 0.6;
              } else tempPos.lerp(basePos, RELAX_SPEED);
            } else tempPos.lerp(basePos, RELAX_SPEED);

            tempMat.compose(tempPos, tempQuat, tempScale);
            mesh.setMatrixAt(i, tempMat);
          }

          mesh.instanceMatrix.needsUpdate = true;
        }

        // -----------------------------
        // SCROLLTRIGGER
        // -----------------------------
        gsap
          .timeline({
            scrollTrigger: {
              trigger: wrapRef.current,
              start: "top top",
              end: "bottom bottom",
              scrub: 1,
              pin: true,
              pinSpacing: false,
            },
          })
          .to(proxy, { t: 1, onUpdate: updateInstances, ease: "none" });

        // -----------------------------
        // CAMERA MOUSE LOOK
        // -----------------------------
        const MAX_YAW = 0.25;
        const MAX_PITCH = 0.15;
        let targetYaw = 0,
          targetPitch = 0,
          curYaw = 0,
          curPitch = 0;

        window.addEventListener("mousemove", (e) => {
          targetYaw = ((e.clientX / innerWidth) * 2 - 1) * MAX_YAW;
          targetPitch = ((e.clientY / innerHeight) * 2 - 1) * MAX_PITCH;
        });

        // -----------------------------
        // ANIMATE
        // -----------------------------
        function animate() {
          requestAnimationFrame(animate);

          curYaw += (targetYaw - curYaw) * 0.08;
          curPitch += (targetPitch - curPitch) * 0.08;

          camera.position.x = Math.sin(curYaw) * ORBIT_RADIUS;
          camera.position.y = Math.sin(curPitch) * ORBIT_RADIUS * 0.2;
          camera.position.z = Math.cos(curYaw) * ORBIT_RADIUS;

          camera.lookAt(0, 0, 0);
          renderer.render(scene, camera);
        }
        animate();
      },
      undefined,
      (err) => console.error("Load error:", err)
    );

    return () => {
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={wrapRef} style={{ height: "300vh", position: "relative" }}>
      <div
        ref={mountRef}
        style={{
          position: "fixed",
          top: 0,
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          background: "transparent",
        }}
      />
    </div>
  );
}
