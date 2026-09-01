import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Center } from "@react-three/drei";
import logoFlat from "../assets/brand/logo-vertical-burgundy.png";
import WebglBoundary from "./WebglBoundary";
import "./SpinningLogo3D.css";

// The actual model, auto-rotating on its own — no mouse/drag controls, just a
// slow constant spin so it reads as ambient decoration, not something to
// interact with.
function Model() {
  const { scene } = useGLTF("/brand/heather-harries-logo.glb");
  const groupRef = useRef();

  useFrame((_state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.6; // ~1 turn every ~10s
    }
  });

  return (
    <group ref={groupRef}>
      <Center>
        <primitive object={scene} />
      </Center>
    </group>
  );
}

// Shown instantly while the model loads is handled by Suspense fallback=null
// (nothing flashes in). This flat image is only for when WebGL itself isn't
// available or the model fails to load — the boundary below catches that.
function FlatFallback() {
  return (
    <img
      src={logoFlat}
      alt="Heather Harries Education Hub"
      className="spinning-logo-fallback"
    />
  );
}

export default function SpinningLogo3D() {
  return (
    <div className="spinning-logo-stage">
      <WebglBoundary fallback={<FlatFallback />}>
        <Canvas camera={{ position: [0, 0, 4], fov: 40 }} dpr={[1, 2]}>
          <ambientLight intensity={2.4} />
          <directionalLight position={[3, 4, 5]} intensity={2.6} />
          <directionalLight position={[-3, 2, 4]} intensity={1.8} />
          <directionalLight position={[0, -3, -4]} intensity={1} />
          <pointLight position={[0, 0, 5]} intensity={1.2} color="#f8ecd4" />
          <Suspense fallback={null}>
            <Model />
          </Suspense>
        </Canvas>
      </WebglBoundary>
    </div>
  );
}

// Preload so the model starts fetching as soon as the module is imported,
// rather than waiting for first render.
useGLTF.preload("/brand/heather-harries-logo.glb");
