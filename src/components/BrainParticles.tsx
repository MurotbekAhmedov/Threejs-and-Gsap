import * as THREE from "three";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const DESIRED_COUNT = 3000;
const BRAIN_SCALE = 4.2;
const TRI_SIZE = 0.035;
const HOVER_RADIUS = 0.55;
const HOVER_PUSH = 0.14;
const SHATTER_SPREAD = new THREE.Vector3(5, 5, 3);

export default function BrainParticles() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // --- Сцена и камера ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
    camera.position.z = 3;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    const light = new THREE.PointLight(0xffffff, 1);
    light.position.set(2, 2, 5);
    scene.add(light);

    // --- Геометрия треугольников ---
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

    // --- Материал ---
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.25,
      roughness: 0.35,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1, // сразу видно мозг
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
    const waveProgressFor = (i: number, t: number) => {
      const factor = Math.pow((start[i].y + BRAIN_SCALE / 2) / BRAIN_SCALE, 1.5); // низ -> 0, верх -> 1
      return THREE.MathUtils.clamp(t * 3 - factor, 0, 1);
    };

    // точка ховера (null — если нет пересечения)
    let hoverPoint: THREE.Vector3 | null = null;

    // параметры возврата
    const RELAX_SPEED = 0.12; // чем больше — тем быстрее возвращаются к базе
    const HOVER_RADIUS_SQ = HOVER_RADIUS * HOVER_RADIUS;
    // --- Загружаем мозг ---
    const img = new Image();
    img.src = "/brain-map.png";
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const cvs = document.createElement("canvas");
      const ctx = cvs.getContext("2d")!;
      cvs.width = img.width;
      cvs.height = img.height;
      ctx.drawImage(img, 0, 0);
      const pix = ctx.getImageData(0, 0, img.width, img.height).data;

      const sample = (pix[0] + pix[1] + pix[2]) / 3;
      const brainIsLight = sample < 128;
      const candidates: THREE.Vector3[] = [];

      for (let y = 0; y < img.height; y += 2) {
        for (let x = 0; x < img.width; x += 2) {
          const i = (y * img.width + x) * 4;
          const r = pix[i], g = pix[i + 1], b = pix[i + 2];
          const brightness = (r + g + b) / 3;
          const isBrainPixel = brainIsLight ? brightness > 200 : brightness < 55;
          if (isBrainPixel) {
            const nx = (x / img.width - 0.5) * BRAIN_SCALE;
            const ny = (0.5 - y / img.height) * BRAIN_SCALE;
            const nz = (Math.random() - 0.5) * 0.45;
            candidates.push(new THREE.Vector3(nx, ny, nz));
          }
        }
      }

      for (let i = 0; i < DESIRED_COUNT; i++) {
        const p = candidates[(Math.random() * candidates.length) | 0] ?? new THREE.Vector3();
        const jitter = 0.015;
        start[i] = new THREE.Vector3(
          p.x + (Math.random() - 0.5) * jitter,
          p.y + (Math.random() - 0.5) * jitter,
          p.z
        );
        // Чем ниже — тем раньше "взрывается"
        const spreadFactor = THREE.MathUtils.clamp((p.y + BRAIN_SCALE / 2) / BRAIN_SCALE, 0, 1);
        end[i] = new THREE.Vector3(
          start[i].x + (Math.random() - 0.5) * SHATTER_SPREAD.x,
          start[i].y + (Math.random() - 0.5) * SHATTER_SPREAD.y * spreadFactor,
          start[i].z + (Math.random() - 0.5) * SHATTER_SPREAD.z
        );
      }

      // --- Расставляем треугольники ---
      for (let i = 0; i < DESIRED_COUNT; i++) {
        tempPos.copy(start[i]);
        tempQuat.setFromEuler(new THREE.Euler(0, 0, Math.random() * Math.PI));
        const s = 1.0 + Math.random() * 0.7;
        tempScale.set(s, s, 1);
        tempMat.compose(tempPos, tempQuat, tempScale);
        mesh.setMatrixAt(i, tempMat);
      }
      mesh.instanceMatrix.needsUpdate = true;

      // --- Hover эффекты ---
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      const onMove = (e: MouseEvent) => {
        mouse.x = (e.clientX / innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hit = raycaster.intersectObject(mesh, true)[0];
        hoverPoint = hit ? hit.point.clone() : null; // если нет попадания — считаем, что курсор "вне радиуса"
      };

renderer.domElement.addEventListener("mousemove", onMove);
      // --- Shatter эффект снизу вверх ---
      const proxy = { t: 0 };
      const updateInstances = () => {
        for (let i = 0; i < DESIRED_COUNT; i++) {
          // база: где частица должна быть согласно скроллу (shatter-волна снизу-вверх)
          const baseT = waveProgressFor(i, proxy.t);
          const basePos = tempPos.lerpVectors(start[i], end[i], baseT).clone();

          // достаём текущие transform инстанса
          mesh.getMatrixAt(i, tempMat);
          tempMat.decompose(tempPos, tempQuat, tempScale);

          // если есть hover-точка и мы в радиусе — отталкиваемся
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
              // вне радиуса — плавно тянем обратно к базе
              tempPos.lerp(basePos, RELAX_SPEED);
            }
          } else {
            // ховера нет — всегда тянем к базе
            tempPos.lerp(basePos, RELAX_SPEED);
          }

          // небольшой твист по мере shatter-прогресса — для «искр»
          // const twist = (baseT * Math.PI * 0.3) * (i % 2 ? 1 : -1);
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0));
          const finalQuat = tempQuat.multiply(q);

          tempMat.compose(tempPos, finalQuat, tempScale);
          mesh.setMatrixAt(i, tempMat);
        }
        mesh.instanceMatrix.needsUpdate = true;
      };

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: wrapRef.current,
          start: "top top",
          end: "+=1600",
          scrub: 1,
          pin: true,
        },
        defaults: { ease: "none" },
      });

      tl.to(proxy, { t: 1, duration: 1.5, onUpdate: updateInstances });
      // tl.to(proxy, { t: 0, duration: 1.5, onUpdate: updateInstances });

      // --- Камера ---
      let targetCamX = 0;
      const onParallax = (e: MouseEvent) => {
        const ndcX = (e.clientX / innerWidth - 0.5) * 2;
        targetCamX = ndcX * 1.2;
      };
      window.addEventListener("mousemove", onParallax);

      const animate = () => {
        requestAnimationFrame(animate);
        camera.position.x += (targetCamX - camera.position.x) * 0.06;
        camera.lookAt(scene.position);
          updateInstances();
        renderer.render(scene, camera);
      };
      animate();
    };

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
