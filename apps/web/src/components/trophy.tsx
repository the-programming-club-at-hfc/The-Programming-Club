// A live 3D Golden Keycap you can spin. The model (public/trophy/golden-keycap.glb) is exported from the
// trophy's Blender build, so it matches what gets 3D printed. three.js loads only when this mounts.
import type { MeshStandardMaterial } from "three";
import { useEffect, useRef, useState } from "react";

export function TrophyViewer({ className = "" }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = host.current!;
    const life = { done: false };
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
      const gltf = await new GLTFLoader().loadAsync("/trophy/golden-keycap.glb");
      if (life.done) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = 1.25;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      el.appendChild(renderer.domElement);

      // A product-photo studio for the gold to reflect: a dim navy room with three softboxes,
      // plus one warm key light that casts the shadow.
      const room = new THREE.Scene();
      room.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ color: 0x6f7a96, side: THREE.BackSide })));
      const softbox = (w: number, hh: number, x: number, y: number, z: number, glow: number) => {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(w, hh),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.88).multiplyScalar(glow), side: THREE.DoubleSide }),
        );
        m.position.set(x, y, z);
        m.lookAt(0, 0, 0);
        room.add(m);
      };
      softbox(5, 3, -5, 5, 2, 3); // large, upper left
      softbox(1.2, 6, 6, 1.5, 1, 4); // tall strip, right
      softbox(5, 1, 0, 3, -6, 2.5); // rim light from behind
      softbox(7, 2.5, 1.5, -1, 6, 1.6); // low bounce card in front, so faces toward the viewer glow
      const pmrem = new THREE.PMREMGenerator(renderer);
      const studio = pmrem.fromScene(room, 0.03).texture;
      const scene = new THREE.Scene();
      scene.environment = studio;

      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -box.min.y, -center.z);
      model.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.castShadow = o.receiveShadow = true;
        // Polished gold catches the studio; satin black PLA barely does.
        const m = o.material as MeshStandardMaterial;
        // (envMapIntensity only applies when the material has its own envMap.)
        if (m.name === "gold") Object.assign(m, { envMap: studio, roughness: 0.26, envMapIntensity: 1 }), m.color.setRGB(1, 0.6, 0.18);
        if (m.name === "black") Object.assign(m, { envMap: studio, roughness: 0.6, envMapIntensity: 0.35 });
        if (m.name === "white") Object.assign(m, { envMap: studio, envMapIntensity: 0.4 });
      });
      scene.add(model);

      const h = size.y;
      const key = new THREE.DirectionalLight(0xfff1dc, 2);
      key.position.set(-h * 2.6, h * 2.4, h * 0.4);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.radius = 6;
      Object.assign(key.shadow.camera, { left: -h, right: h, top: h, bottom: -h, near: 1, far: h * 6 });
      scene.add(key, new THREE.HemisphereLight(0xdde6ff, 0x141a2a, 1.2)); // soft fill for the plaque and black parts
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(h * 8, h * 8), new THREE.ShadowMaterial({ opacity: 0.35 }));
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      const camera = new THREE.PerspectiveCamera(28, 1, h / 20, h * 30);
      camera.position.set(h * 1.7, h * 0.85, h * 3.1);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, h * 0.47, 0);
      controls.enableDamping = true;
      controls.enablePan = controls.enableZoom = false; // keep page scrolling
      controls.minPolarAngle = 0.35;
      controls.maxPolarAngle = 1.45;
      controls.autoRotate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
      controls.autoRotateSpeed = 1.2;
      renderer.domElement.style.touchAction = "pan-y"; // sideways drags spin, vertical swipes still scroll

      const fit = () => {
        const { clientWidth: w, clientHeight: hh } = el;
        renderer.setSize(w, hh);
        camera.aspect = w / hh;
        camera.updateProjectionMatrix();
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(el);
      // Only draw while on screen.
      const loop = () => {
        controls.update();
        renderer.render(scene, camera);
      };
      const io = new IntersectionObserver(([e]) => renderer.setAnimationLoop(e.isIntersecting ? loop : null));
      io.observe(el);
      setReady(true);

      cleanup = () => {
        renderer.setAnimationLoop(null);
        ro.disconnect();
        io.disconnect();
        controls.dispose();
        pmrem.dispose();
        scene.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch((e: unknown) => console.warn("Trophy preview unavailable:", e));
    return () => {
      life.done = true;
      cleanup();
    };
  }, []);

  return (
    <div className={`relative overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,#24314f,#0b1222_70%)] ${className}`}>
      {/* The Blender render stands in until the live model is ready (or if WebGL isn't available). */}
      <img
        src="/trophy/poster.jpg"
        alt="The Golden Keycap trophy: a gold keycap on a black switch and plinth with the club plaque"
        className={`absolute inset-0 size-full object-cover transition-opacity duration-700 ${ready ? "opacity-0" : "opacity-100"}`}
      />
      <div
        ref={host}
        className={`absolute inset-0 cursor-grab transition-opacity duration-700 active:cursor-grabbing ${ready ? "opacity-100" : "opacity-0"}`}
      />
      {ready && <p className="pointer-events-none absolute bottom-3 left-0 w-full text-center text-xs text-white/55">Drag to spin</p>}
    </div>
  );
}
