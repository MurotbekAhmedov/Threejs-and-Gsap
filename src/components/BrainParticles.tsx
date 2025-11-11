import * as THREE from "three";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

gsap.registerPlugin(ScrollTrigger);

const DESIRED_COUNT = 3000;
const TRI_SIZE = 0.035;
const HOVER_RADIUS = 0.55;
const HOVER_PUSH = 0.14;
const SHATTER_SPREAD = new THREE.Vector3(5, 5, 3);
const RELAX_SPEED = 0.1;

export default function BrainParticles() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // === СЦЕНА И КАМЕРА ===
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
    const ORBIT_RADIUS = 3;
    camera.position.z = ORBIT_RADIUS;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    // === СВЕТ ===
    const light = new THREE.PointLight(0xffffff, 1);
    light.position.set(2, 2, 5);
    scene.add(light);

    // === ТРЕУГОЛЬНАЯ ГЕОМЕТРИЯ ДЛЯ ЧАСТИЦ ===
    const triangleGeo = (() => {
      const geo = new THREE.BufferGeometry();
      const a = new THREE.Vector3(0, TRI_SIZE * 1.8, 0);
      const b = new THREE.Vector3(-TRI_SIZE * 0.7, -TRI_SIZE * 0.9, 0);
      const c = new THREE.Vector3(TRI_SIZE * 0.9, -TRI_SIZE * 0.7, 0);
      geo.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array([...a.toArray(), ...b.toArray(), ...c.toArray()]), 3)
      );
      geo.computeVertexNormals();
      return geo;
    })();

    // === МАТЕРИАЛ ===
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.25,
      roughness: 0.35,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
    });

    const mesh = new THREE.InstancedMesh(triangleGeo, baseMat, DESIRED_COUNT);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);

    const start: THREE.Vector3[] = new Array(DESIRED_COUNT);
    const end: THREE.Vector3[] = new Array(DESIRED_COUNT);
    const tempPos = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();
    const tempScale = new THREE.Vector3();
    const tempMat = new THREE.Matrix4();

    let hoverPoint: THREE.Vector3 | null = null;
    const HOVER_RADIUS_SQ = HOVER_RADIUS * HOVER_RADIUS;

    // === ЗАГРУЗКА МОЗГА ===
    const loader = new GLTFLoader();
    loader.load(
      "/brain.glb",
      (gltf) => {
        gltf.scene.traverse((child: any) => {
          if (child.isMesh) {
            const geometry = child.geometry.clone();
            geometry.scale(1, 1, 1);
            geometry.center();

            const posAttr = geometry.attributes.position;
            const verts: THREE.Vector3[] = [];
            for (let i = 0; i < posAttr.count; i++) {
              verts.push(new THREE.Vector3().fromBufferAttribute(posAttr, i));
            }

            // === СОЗДАНИЕ ЧАСТИЦ ===
            for (let i = 0; i < DESIRED_COUNT; i++) {
              const p = verts[(Math.random() * verts.length) | 0];
              start[i] = p.clone();
              const spreadFactor = (p.y + 1) / 2;
              end[i] = p
                .clone()
                .add(
                  new THREE.Vector3(
                    (Math.random() - 0.5) * SHATTER_SPREAD.x,
                    (Math.random() - 0.5) * SHATTER_SPREAD.y * spreadFactor,
                    (Math.random() - 0.5) * SHATTER_SPREAD.z
                  )
                );
            }

            // === УСТАНОВКА НАЧАЛЬНОГО СОСТОЯНИЯ ===
            for (let i = 0; i < DESIRED_COUNT; i++) {
              tempPos.copy(start[i]);
              tempQuat.setFromEuler(new THREE.Euler(0, 0, Math.random() * Math.PI));
              const s = 1 + Math.random() * 0.7;
              tempScale.set(s, s, 1);
              tempMat.compose(tempPos, tempQuat, tempScale);
              mesh.setMatrixAt(i, tempMat);
            }
            mesh.instanceMatrix.needsUpdate = true;

            // === РЕАКЦИЯ НА МЫШЬ ===
            const raycaster = new THREE.Raycaster();
            const mouse = new THREE.Vector2();
            renderer.domElement.addEventListener("mousemove", (e) => {
              mouse.x = (e.clientX / innerWidth) * 2 - 1;
              mouse.y = -(e.clientY / innerHeight) * 2 + 1;
              raycaster.setFromCamera(mouse, camera);
              const hit = raycaster.intersectObject(mesh, true)[0];
              hoverPoint = hit ? hit.point.clone() : null;
            });

            // === SHATTER-АНИМАЦИЯ ===
            const proxy = { t: 0 };
            const updateInstances = () => {
              for (let i = 0; i < DESIRED_COUNT; i++) {
                const baseT = THREE.MathUtils.clamp(proxy.t, 0, 1);
                const basePos = tempPos.lerpVectors(start[i], end[i], baseT).clone();
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
                    tempPos.z += (dz / dist) * (k * 0.6);
                  } else {
                    tempPos.lerp(basePos, RELAX_SPEED);
                  }
                } else {
                  tempPos.lerp(basePos, RELAX_SPEED);
                }

                tempMat.compose(tempPos, tempQuat, tempScale);
                mesh.setMatrixAt(i, tempMat);
              }
              mesh.instanceMatrix.needsUpdate = true;
            };

            // === АНИМАЦИЯ ПРИ СКРОЛЛЕ ===
            const tl = gsap.timeline({
              scrollTrigger: {
                trigger: wrapRef.current,
                start: "top top",
                end: "+=1600",
                scrub: 1,
                pin: true,
              },
            });
            tl.to(proxy, { t: 1, duration: 1.5, onUpdate: updateInstances });
            tl.to(proxy, { t: 0, duration: 1.5, onUpdate: updateInstances });
            updateInstances();

            // === ДВИЖЕНИЕ КАМЕРЫ ===
            const MAX_YAW = 0.25;
            const MAX_PITCH = 0.15;
            let targetYaw = 0,
              targetPitch = 0,
              curYaw = 0,
              curPitch = 0;

            window.addEventListener("mousemove", (e) => {
              const ndcX = (e.clientX / innerWidth - 0.5) * 2;
              const ndcY = (e.clientY / innerHeight - 0.5) * 2;
              targetYaw = ndcX * MAX_YAW;
              targetPitch = ndcY * MAX_PITCH;
            });

            const animate = () => {
              requestAnimationFrame(animate);
              curYaw += (targetYaw - curYaw) * 0.08;
              curPitch += (targetPitch - curPitch) * 0.08;

              const x = Math.sin(curYaw) * ORBIT_RADIUS;
              const y = Math.sin(curPitch) * ORBIT_RADIUS * 0.2;
              const z = Math.cos(curYaw) * ORBIT_RADIUS;

              camera.position.set(x, y, z);
              camera.lookAt(0, 0, 0);
              light.position.copy(camera.position);

              renderer.render(scene, camera);
            };
            animate();
          }
        });
      },
      undefined,
      (err) => console.error("Ошибка загрузки brain.glb:", err)
    );

    return () => {
      if (mountRef.current) mountRef.current.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={wrapRef} style={{ height: "260vh", position: "relative" }}>
      <div
        ref={mountRef}
        style={{
          position: "sticky",
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
