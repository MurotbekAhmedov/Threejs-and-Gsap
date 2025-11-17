// BrainParticlesGpu.tsx
import * as THREE from "three";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";

gsap.registerPlugin(ScrollTrigger);

const PARTICLE_COUNT = 100_000;

export default function BrainParticlesGpu() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // -----------------------------
    // BASE SETUP
    // -----------------------------
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      70,
      innerWidth / innerHeight,
      0.1,
      2000
    );
    camera.position.set(0, 0, 3);

    const renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x4466ff, 0.7));
    const dl = new THREE.DirectionalLight(0xffffff, 0.7);
    dl.position.set(3, 4, 5);
    scene.add(dl);

    // -----------------------------
    // BUFFERS
    // -----------------------------
    const posBrain = new Float32Array(PARTICLE_COUNT * 3);
    const posExplode = new Float32Array(PARTICLE_COUNT * 3);
    const posDown = new Float32Array(PARTICLE_COUNT * 3);
    const posBulb = new Float32Array(PARTICLE_COUNT * 3);

    const colBrain = new Float32Array(PARTICLE_COUNT * 3);
    const colExplode = new Float32Array(PARTICLE_COUNT * 3);
    const colDown = new Float32Array(PARTICLE_COUNT * 3);
    const colBulb = new Float32Array(PARTICLE_COUNT * 3);

    const drawPos = new Float32Array(PARTICLE_COUNT * 3);
    const drawCol = new Float32Array(PARTICLE_COUNT * 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(drawPos, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(drawCol, 3));

    // -----------------------------
    // SHADER
    // -----------------------------
    const material = new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec3 color;
        varying vec3 vColor;
        void main(){
          vColor = color;
          gl_PointSize = 1.5;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main(){
          vec2 c = gl_PointCoord - vec2(0.5);
          if(length(c) > 0.5) discard;
          gl_FragColor = vec4(vColor, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // -----------------------------
    // LOAD MODELS
    // -----------------------------
    const loader = new GLTFLoader();

    Promise.all([
      loader.loadAsync("/models/brain/scene.gltf"),
      loader.loadAsync("/models/bulb/scene.gltf"),
    ]).then(([brainGLTF, bulbGLTF]) => {
      let brainMesh: THREE.Mesh = null!;
      let bulbMesh: THREE.Mesh = null!;

      brainGLTF.scene.traverse((o) => {
        if ((o as any).isMesh && !brainMesh) brainMesh = o as THREE.Mesh;
      });

      bulbGLTF.scene.traverse((o) => {
        if ((o as any).isMesh && !bulbMesh) bulbMesh = o as THREE.Mesh;
      });

      // -----------------------------
      // NORMALIZE geometries
      // -----------------------------
      const R_X = THREE.MathUtils.degToRad(270);
      const R_Y = THREE.MathUtils.degToRad(270);

      const gBrain = brainMesh.geometry.clone();
      gBrain.center();
      gBrain.scale(0.8, 0.8, 0.8);
      gBrain.rotateX(R_X);
      gBrain.rotateY(R_Y);
      brainMesh.geometry = gBrain;

      const gBulb = bulbMesh.geometry.clone();
      gBulb.center();
      gBulb.scale(15, 15, 15);
      gBulb.rotateX(R_X);
      gBulb.rotateY(R_Y);
      bulbMesh.geometry = gBulb;

      const brainSampler = new MeshSurfaceSampler(brainMesh).build();
      const bulbSampler = new MeshSurfaceSampler(bulbMesh).build();

      const p = new THREE.Vector3();
      const n = new THREE.Vector3();
      const b = new THREE.Vector3();

      // Colors
      const colA = new THREE.Color("#6be8ff");
      const colB = new THREE.Color("#3388ff");

      const bulA = new THREE.Color("#3388ff");
      const bulB = new THREE.Color("#3388ff");

      // -----------------------------
      // GENERATE POINTS
      // -----------------------------
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const I = i * 3;

        // Brain
        brainSampler.sample(p, n);
        posBrain[I] = p.x;
        posBrain[I + 1] = p.y + 0.55;
        posBrain[I + 2] = p.z;

        const cBrain = colA.clone().lerp(colB, Math.random());
        colBrain[I] = cBrain.r;
        colBrain[I + 1] = cBrain.g;
        colBrain[I + 2] = cBrain.b;

        // EXPLOSION
        posExplode[I] = p.x + (Math.random() - 0.5) * 2.0;
        posExplode[I + 1] = p.y + (Math.random() - 0.5) * 2.0;
        posExplode[I + 2] = p.z + (Math.random() - 0.5) * 2.0;

        const cExp = cBrain.clone().lerp(bulA, Math.random() * 0.5);
        colExplode[I] = cExp.r;
        colExplode[I + 1] = cExp.g;
        colExplode[I + 2] = cExp.b;

        // DOWN
        posDown[I] = p.x * 0.3;
        posDown[I + 1] = -2.3 - Math.random() * 0.5;
        posDown[I + 2] = p.z * 0.3;

        const cDown = cBrain.clone().lerp(bulA, 0.3);
        colDown[I] = cDown.r;
        colDown[I + 1] = cDown.g;
        colDown[I + 2] = cDown.b;

        // BULB
        bulbSampler.sample(b, n);
        posBulb[I] = b.x;
        posBulb[I + 1] = b.y - 1.5;
        posBulb[I + 2] = b.z;

        const cBulb = bulA.clone().lerp(bulB, Math.random());
        colBulb[I] = cBulb.r;
        colBulb[I + 1] = cBulb.g;
        colBulb[I + 2] = cBulb.b;
      }

      // initial = brain
      drawPos.set(posBrain);
      drawCol.set(colBrain);

      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;

      // -----------------------------
      // SCROLL MORPH (4 PHASES)
      // -----------------------------
      const state = { t: 0 };

      const updateMorph = () => {
        const t = state.t;

        // Map scroll segments:
        // 0.00–0.33   = brain → explode
        // 0.33–0.66   = explode → down
        // 0.66–1.00   = down → bulb

        let k1 = 0, k2 = 0, k3 = 0;

        if (t < 0.33) {
          k1 = t / 0.33;
        } else if (t < 0.66) {
          k1 = 1;
          k2 = (t - 0.33) / 0.33;
        } else {
          k1 = 1;
          k2 = 1;
          k3 = (t - 0.66) / 0.34;
        }

        for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
          let p1 = posBrain[i] + (posExplode[i] - posBrain[i]) * k1;
          let p2 = posExplode[i] + (posDown[i] - posExplode[i]) * k2;
          let p3 = posDown[i] + (posBulb[i] - posDown[i]) * k3;

          let c1 = colBrain[i] + (colExplode[i] - colBrain[i]) * k1;
          let c2 = colExplode[i] + (colDown[i] - colExplode[i]) * k2;
          let c3 = colDown[i] + (colBulb[i] - colDown[i]) * k3;

          drawPos[i] = t < 0.33 ? p1 : t < 0.66 ? p2 : p3;
          drawCol[i] = t < 0.33 ? c1 : t < 0.66 ? c2 : c3;
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
      };

      gsap.to(state, {
        t: 1,
        ease: "none",
        scrollTrigger: {
          trigger: wrapRef.current!,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
          pin: true,
        },
        onUpdate: updateMorph,
      });
    });

    // -----------------------------
    // CAMERA motion
    // -----------------------------
    const MAX_YAW = 0.25;
    const MAX_PITCH = 0.15;
    let ty = 0,
      tp = 0,
      cy = 0,
      cp = 0;

    window.addEventListener("mousemove", (e) => {
      ty = ((e.clientX / innerWidth) * 2 - 1) * MAX_YAW;
      tp = ((e.clientY / innerHeight) * 2 - 1) * MAX_PITCH;
    });

    const animate = () => {
      requestAnimationFrame(animate);
      cy += (ty - cy) * 0.08;
      cp += (tp - cp) * 0.08;

      camera.position.x = Math.sin(cy) * 3;
      camera.position.y = Math.sin(cp) * 0.6;
      camera.position.z = Math.cos(cy) * 3;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={wrapRef} style={{ height: "300vh", position: "relative" }}>
      <div
        ref={mountRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
