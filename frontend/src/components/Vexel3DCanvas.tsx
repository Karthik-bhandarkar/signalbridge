import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface Vexel3DCanvasProps {
  className?: string;
  interactive?: boolean;
}

export const Vexel3DCanvas: React.FC<Vexel3DCanvasProps> = ({
  className = '',
  interactive = true,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || 600;
    let height = container.clientHeight || 500;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 8.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // 2. Lighting setup inspired by PeachWorlds / Vexel AI
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x0083ff, 3.0);
    dirLight1.position.set(5, 7, 6);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 2.2);
    dirLight2.position.set(-6, -4, 4);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0x0284c7, 2.5, 20);
    pointLight.position.set(0, 0, 4);
    scene.add(pointLight);

    // 3. Electric Blue Material
    const blueMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#0070f3'),
      emissive: new THREE.Color('#002661'),
      emissiveIntensity: 0.25,
      roughness: 0.18,
      metalness: 0.85,
    });

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    let mixer: THREE.AnimationMixer | null = null;
    let fallbackMeshGroup: THREE.Group | null = null;
    let isDisposed = false;

    // Helper: Build procedural nested kinetic wave torus as immediate fallback
    const createProceduralFallback = () => {
      const group = new THREE.Group();
      const ringCount = 24;
      for (let i = 0; i < ringCount; i++) {
        const radius = 0.6 + i * 0.12;
        const tube = 0.024 + (i / ringCount) * 0.015;
        const geom = new THREE.TorusGeometry(radius, tube, 16, 64);
        const ring = new THREE.Mesh(geom, blueMaterial);
        ring.rotation.x = (i * Math.PI) / ringCount;
        ring.rotation.y = (i * Math.PI) / (ringCount * 1.5);
        ring.userData = { ringIndex: i, baseRadius: radius };
        group.add(ring);
      }
      return group;
    };

    // 4. Load Vexel 3D Model
    const loader = new GLTFLoader();
    loader.load(
      '/assets-3d/model.glb',
      (gltf) => {
        if (isDisposed) return;
        const model = gltf.scene;

        // Apply our electric blue material across meshes
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.material = blueMaterial;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });

        // Set scale & center
        model.scale.set(1.65, 1.65, 1.65);
        model.rotation.set(0.2, 0.4, 0);

        // Setup GLTF animation loop if available
        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(model);
          const action = mixer.clipAction(gltf.animations[0]);
          action.setDuration(8);
          action.play();
        }

        // Remove fallback if present
        if (fallbackMeshGroup) {
          rootGroup.remove(fallbackMeshGroup);
          fallbackMeshGroup = null;
        }

        rootGroup.add(model);
      },
      undefined,
      (err) => {
        console.warn('[Vexel3DCanvas] Using procedural kinetic torus fallback:', err);
        if (!fallbackMeshGroup && !isDisposed) {
          fallbackMeshGroup = createProceduralFallback();
          rootGroup.add(fallbackMeshGroup);
        }
      }
    );

    // Initial fallback while model loads
    fallbackMeshGroup = createProceduralFallback();
    rootGroup.add(fallbackMeshGroup);

    // 5. Interactive Mouse Parallax
    let mouseX = 0;
    let mouseY = 0;
    let targetRotationX = 0;
    let targetRotationY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      if (!interactive) return;
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      targetRotationY = x * 0.9;
      targetRotationX = y * 0.7;
    };

    if (interactive) {
      window.addEventListener('mousemove', handleMouseMove);
    }

    // 6. Responsive Resize
    const handleResize = () => {
      if (!container || isDisposed) return;
      width = container.clientWidth || 600;
      height = container.clientHeight || 500;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // 7. Animation Loop
    const clock = new THREE.Clock();
    let animId: number;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      if (mixer) {
        mixer.update(delta);
      }

      // Smooth kinetic rotation & mouse parallax lerp
      mouseX += (targetRotationX - mouseX) * 0.05;
      mouseY += (targetRotationY - mouseY) * 0.05;

      rootGroup.rotation.y += delta * 0.25;
      rootGroup.rotation.x = mouseX + Math.sin(time * 0.5) * 0.08;
      rootGroup.rotation.z = mouseY * 0.5 + Math.cos(time * 0.4) * 0.06;

      // Animate fallback rings if active
      if (fallbackMeshGroup) {
        fallbackMeshGroup.children.forEach((child, i) => {
          child.rotation.z += delta * (0.2 + (i % 5) * 0.04);
          child.rotation.x += delta * (0.15 + (i % 3) * 0.03);
          const scaleOffset = 1 + Math.sin(time * 2 + i * 0.25) * 0.04;
          child.scale.set(scaleOffset, scaleOffset, scaleOffset);
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    // 8. Cleanup
    return () => {
      isDisposed = true;
      cancelAnimationFrame(animId);
      if (interactive) {
        window.removeEventListener('mousemove', handleMouseMove);
      }
      resizeObserver.disconnect();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      blueMaterial.dispose();
    };
  }, [interactive]);

  return (
    <div
      ref={mountRef}
      className={`vexel-3d-container ${className}`}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '380px',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    />
  );
};
