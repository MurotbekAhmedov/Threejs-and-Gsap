import * as THREE from "three";                      // импорт всего из three.js (сцена, камера, геометрии, материалы и т.д.)
import { useEffect, useRef } from "react";           // хуки React для побочных эффектов и ссылок на DOM
import { gsap } from "gsap";                         // основная библиотека GSAP для анимаций
import { ScrollTrigger } from "gsap/ScrollTrigger";  // плагин GSAP для анимации, завязанной на скролл
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"; // загрузчик 3D-моделей glTF/GLB

gsap.registerPlugin(ScrollTrigger);                  // регистрируем плагин, чтобы GSAP мог использовать ScrollTrigger

const DESIRED_COUNT = 50000;                          // сколько частиц-треугольников создаём
const TRI_SIZE = 0.025;                              // базовый размер треугольника (вершины геометрии)
const HOVER_RADIUS = 0.55;                           // радиус влияния ховера (в мировых координатах)
const HOVER_PUSH = 0.14;                             // сила отталкивания при ховере
const SHATTER_SPREAD = new THREE.Vector3(5, 5, 3);   // диапазон разлёта частиц (случайное смещение по XYZ)
const RELAX_SPEED = 0.1;                             // скорость «возврата» частицы к базовой позиции при отсутствии ховера

export default function BrainParticles() {           // экспорт компонента React
  const wrapRef = useRef<HTMLDivElement>(null);      // ref на внешнюю обёртку (для ScrollTrigger: trigger/pin)
  const mountRef = useRef<HTMLDivElement>(null);     // ref на контейнер под canvas three.js

  useEffect(() => {                                   // выполняем один раз после маунта компонента
    if (!mountRef.current) return;                    // если контейнера нет — выходим (безопасность)

    // === СЦЕНА И КАМЕРА ===
    const scene = new THREE.Scene();                  // создаём сцену
    const camera = new THREE.PerspectiveCamera(       // создаём перспективную камеру
      75,                                             // поле зрения (fov) в градусах
      innerWidth / innerHeight,                       // соотношение сторон экрана
      0.1,                                            // ближняя плоскость отсечения
      1000                                            // дальняя плоскость отсечения
    );
    const ORBIT_RADIUS = 3;                           // радиус «орбиты» камеры вокруг центра
    camera.position.z = ORBIT_RADIUS;                 // ставим камеру на оси Z на расстоянии ORBIT_RADIUS

    const renderer = new THREE.WebGLRenderer({        // создаём WebGL-рендерер
      antialias: true,                                // сглаживание
      alpha: true                                     // прозрачный фон канваса
    });
    renderer.setSize(innerWidth, innerHeight);        // размер рендера под размер окна
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // ограничиваем DPR максимум до 2 для производительности
    mountRef.current.appendChild(renderer.domElement);// добавляем canvas в DOM

    // === СВЕТ ===
    const light = new THREE.PointLight(0xffffff, 1);  // точечный источник света (белый, интенсивность 1)
    light.position.set(2, 2, 5);                      // позиция света в мире
    scene.add(light);                                 // добавляем све т в сцену
    
    // === ТРЕУГОЛЬНИК ДЛЯ ЧАСТИЦ ===
    const triangleGeo = (() => {                      // создаём геометрию одного «острого» треугольника
      const geo = new THREE.BufferGeometry();         // буферная геометрия
      const a = new THREE.Vector3(0, TRI_SIZE * 1.8, 0);            // вершина A (вытянутый вверх угол)
      const b = new THREE.Vector3(-TRI_SIZE * 0.7, -TRI_SIZE * 0.9, 0); // вершина B (левый нижний угол)
      const c = new THREE.Vector3(TRI_SIZE * 0.9, -TRI_SIZE * 0.7, 0);  // вершина C (правый нижний угол)
      geo.setAttribute(                               
        "position",                                   // атрибут координат вершин
        new THREE.BufferAttribute(
          new Float32Array([...a.toArray(), ...b.toArray(), ...c.toArray()]),
          3                                           // по 3 числа на вершину (x,y,z)
        )
      );
      geo.computeVertexNormals();                     // вычислить нормали (на случай освещения)
      return geo;                                     // вернуть собранную геометрию
    })();

    // === МАТЕРИАЛ ===
    const baseMat = new THREE.MeshStandardMaterial({  // физически корректный материал
      color: 0xffffff,                                // белый
      metalness: 0.25,                                // немного металличности
      roughness: 0.35,                                // умеренная шероховатость
      side: THREE.DoubleSide,                         // рисовать обе стороны треугольника
      transparent: true,                              // поддержка прозрачности
      opacity: 1,                                     // полностью видно
    });

    const mesh = new THREE.InstancedMesh(             // создаём InstancedMesh для быстрого рендера множества копий
      triangleGeo,                                    // геометрия одного треугольника
      baseMat,                                        // общий материал
      DESIRED_COUNT                                   // количество инстансов
    );
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // помечаем матрицы как часто обновляемые
    scene.add(mesh);                                   // добавляем instanced-меш в сцену

    const start: THREE.Vector3[] = new Array(DESIRED_COUNT); // массив стартовых позиций (форма мозга)
    const end: THREE.Vector3[]   = new Array(DESIRED_COUNT); // массив конечных позиций (разлёт)
    const tempPos  = new THREE.Vector3();                    // временный вектор для работы с матрицами
    const tempQuat = new THREE.Quaternion();                 // временный кватернион (повороты)
    const tempScale= new THREE.Vector3();                    // временный масштаб
    const tempMat  = new THREE.Matrix4();                    // временная матрица transform

    let hoverPoint: THREE.Vector3 | null = null;             // точка пересечения мыши с частицами (для ховера)
    const HOVER_RADIUS_SQ = HOVER_RADIUS * HOVER_RADIUS;     // квадрат радиуса (чтобы не дергать sqrt лишний раз)

    // === ЗАГРУЗКА МОДЕЛИ МОЗГА ===
    const loader = new GLTFLoader();                         // создаём загрузчик GLTF/GLB
    loader.load(
      "/models/brain/scene.gltf",                                          // путь к твоему GLB (должен лежать в /public)
      (gltf) => {                                            // onLoad: модель успешно загружена
        gltf.scene.traverse((child: any) => {                // обходим все узлы сцены glTF
          if (child.isMesh) {                                // интересуют только меши
            const geometry = child.geometry.clone();         // клонируем геометрию, чтобы не портить оригинал
            geometry.scale(0.8, 0.8, 0.8); 
            geometry.rotateX(30);  
            geometry.rotateY(180);                  // подгоняем масштаб под экран
            geometry.center();                               // центрируем в (0,0,0)

            const posAttr = geometry.attributes.position;    // доступ к массиву вершин
            const verts: THREE.Vector3[] = [];               // сюда сложим вершины как Vector3
            for (let i = 0; i < posAttr.count; i++) {        // проходим по всем вершинам модели
              verts.push(new THREE.Vector3().fromBufferAttribute(posAttr, i)); // читаем i-тую вершину
            }

            // === СОЗДАНИЕ ЧАСТИЦ ===
            for (let i = 0; i < DESIRED_COUNT; i++) {        // для каждого инстанса
              const p = verts[(Math.random() * verts.length) | 0]; // берём случайную вершину модели
              // теперь start = МОЗГ, end = разлетевшиеся позиции
              start[i] = p.clone();                       // стартовая позиция как у модели мозга
              end[i] = p
                .clone()
                .add(                                         // конечная позиция = старт + случайный оффсет
                  new THREE.Vector3(
                    (Math.random() - 0.1) * SHATTER_SPREAD.x, // случайный разлёт по X
                    (Math.random() - 0.1) * SHATTER_SPREAD.y, // по Y
                    (Math.random() - 0.1) * SHATTER_SPREAD.z  // по Z
                  )
                );
            }

            // === УСТАНОВКА СТАРТА ===
            for (let i = 0; i < DESIRED_COUNT; i++) {         // выставляем матрицы инстансов в стартовые позиции
              tempPos.copy(start[i]);                         // позиция = старт
              tempQuat.setFromEuler(new THREE.Euler(0, 0, Math.random() * Math.PI)); // случайно повернём в плоскости
              const s = 1 + Math.random() * 0.7;              // небольшой разброс масштаба
              tempScale.set(s, s, 1);                         // масштаб по Z = 1 (плоский треугольник)
              tempMat.compose(tempPos, tempQuat, tempScale);  // собираем матрицу из позиции/поворота/масштаба
              mesh.setMatrixAt(i, tempMat);                   // записываем в буфер инстансов i-тую матрицу
            }
            mesh.instanceMatrix.needsUpdate = true;           // говорим three.js, что матрицы обновились

            // === МЫШЬ ===
            const raycaster = new THREE.Raycaster();          // луч для «попадания» мыши в 3D
            const mouse = new THREE.Vector2();                // координаты мыши в NDC
            renderer.domElement.addEventListener("mousemove", (e) => { // на движение мыши
              mouse.x = (e.clientX / innerWidth) * 2 - 1;     // преобразуем в NDC [-1..1]
              mouse.y = -(e.clientY / innerHeight) * 2 + 1;
              raycaster.setFromCamera(mouse, camera);         // строим луч из камеры через точку на экране
              const hit = raycaster.intersectObject(mesh, true)[0]; // пересечение с instanced mesh
              hoverPoint = hit ? hit.point.clone() : null;    // если есть, запоминаем точку попадания; иначе null
            });

            // === SHATTER ===
            const proxy = { t: 0 };                           // прокси-объект для анимации (между 0 и 1)
            const waveProgressFromBottom = (i: number, globalT: number) => {
              const yNorm = (start[i].y + 1) / 2; 
              const delay = yNorm * 0.8;
              const t = (globalT - delay) / (1 - delay);
              return THREE.MathUtils.clamp(t, 0, 1);
            };
            const updateInstances = () => {
                  
                  for (let i = 0; i < DESIRED_COUNT; i++) {
                    // --- ПРОГРЕСС ДЛЯ КАЖДОЙ ЧАСТИЦЫ — СНИЗУ ВВЕРХ ---
                    const localT = waveProgressFromBottom(i, proxy.t);
                    // базовая позиция с учётом волны
                   const basePos = start[i].clone().lerp(end[i], localT);

                    // читаем текущий state частицы
                    mesh.getMatrixAt(i, tempMat);
                    tempMat.decompose(tempPos, tempQuat, tempScale);

                    // --- Hover эффект ---
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

            function setInitialBrainShape() {
              for (let i = 0; i < DESIRED_COUNT; i++) {
                tempPos.copy(start[i]);            // ставим РОВНО на форму мозга
                tempQuat.set(0, 0, 0, 1);          // без вращения
                tempScale.set(1, 1, 1);            // нормальный размер
                tempMat.compose(tempPos, tempQuat, tempScale);
                mesh.setMatrixAt(i, tempMat);
              }
              mesh.instanceMatrix.needsUpdate = true;
            }
            setInitialBrainShape();
            // === ScrollTrigger — теперь без дубликата ===
            gsap.timeline({
              scrollTrigger: {
                trigger: wrapRef.current,
                start: "top top",
                end: "bottom bottom",
                scrub: 1,
                pin: true,
                pinSpacing: false,
                anticipatePin: 1,
              },
            })
            .to(proxy, { t: 1, onUpdate: updateInstances });


            // === Камера (эффект поворота головы) ===
            const MAX_YAW = 0.25;                             // максимальный «рысканье» (влево/вправо)
            const MAX_PITCH = 0.15;                           // максимальный «тангаж» (вверх/вниз)
            let targetYaw = 0,                                // целевой угол поворота по горизонтали
                targetPitch = 0,                              // целевой угол по вертикали
                curYaw = 0,                                   // текущий угол (с сглаживанием)
                curPitch = 0;

            window.addEventListener("mousemove", (e) => {     // слушаем движение мыши
              const ndcX = (e.clientX / innerWidth - 0.5) * 2; // нормализуем в [-1..1]
              const ndcY = (e.clientY / innerHeight - 0.5) * 2;
              targetYaw = ndcX * MAX_YAW;                     // целевой поворот по Yaw
              targetPitch = ndcY * MAX_PITCH;                 // целевой поворот по Pitch
            });

            const animate = () => {                           // основной рендер-цикл
              requestAnimationFrame(animate);                 // рекурсивный вызов на каждый кадр
              curYaw += (targetYaw - curYaw) * 0.08;          // плавное приближение к цели (сглаживание)
              curPitch += (targetPitch - curPitch) * 0.08;

              const x = Math.sin(curYaw) * ORBIT_RADIUS;      // рассчитываем позицию камеры по окружности
              const y = Math.sin(curPitch) * ORBIT_RADIUS * 0.2; // небольшое вертикальное смещение
              const z = Math.cos(curYaw) * ORBIT_RADIUS;

              camera.position.set(x, y, z);                   // применяем позицию камеры
              camera.lookAt(0, 0, 0);                         // камера смотрит в центр сцены
              light.position.copy(camera.position);           // двигаем свет вместе с камерой (подсветка спереди)
              renderer.render(scene, camera);                 // рендерим сцену
            };
            animate();                                        // запускаем анимационный цикл
          }
        });
      },
      undefined,                                             // onProgress — не используем
      (err) => console.error("Ошибка загрузки brain.glb:", err) // onError — выводим ошибку
    );

    return () => {                                           // очистка при размонтировании компонента
      if (mountRef.current) mountRef.current.removeChild(renderer.domElement); // убираем canvas из DOM
    };
  }, []);                                                    // пустой массив зависимостей — эффект запускается один раз

  return (
    <div ref={wrapRef} style={{ height: "300vh", position: "relative" }}>   {/* большая по высоте секция под скролл-сцену */}
      <div
        ref={mountRef}                                                     // сюда монтируется canvas three.js
        style={{
          position: "fixed",                                              // «прилипает» к верху экрана
          top: 0,                                                          // приколот к верхней границе
          width: "100vw",                                                  // во всю ширину окна
          height: "100vh",                                                 // и на полный экран по высоте
          overflow: "hidden",                                              // скрыть возможные артефакты по краям
          background: "transparent",                                       // прозрачный фон
        }}
      />
    </div>
  );                                                                       // JSX-разметка компонента
}
