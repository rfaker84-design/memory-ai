"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/* ============================================================
   忆见 MemoryAI — SplashScreen V2
   Three.js cinematic opening. Real 3D stars, real glow.
   ============================================================ */

interface SplashScreenV2Props { onComplete: () => void }
const TOTAL_S = 6.2;

export default function SplashScreenV2({ onComplete }: SplashScreenV2Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // ── Scene ──
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#020108");
    scene.fog = new THREE.FogExp2("#020108", 0.00015);

    // ── Camera ──
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 800);
    camera.position.set(0, 0, 200);
    camera.lookAt(0, 0, 0);

    // ── Ambient light ──
    const ambient = new THREE.AmbientLight("#1a1028", 0.3);
    scene.add(ambient);

    // ═══ S T A R   F I E L D ═══
    const starCount = 4000;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);
    const starPhases = new Float32Array(starCount);
    const starSpeeds = new Float32Array(starCount);
    const starDepths = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const depth = Math.random();
      const r = 120 + depth * 300;
      starPositions[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
      starPositions[i * 3 + 1] = Math.sin(theta) * Math.sin(phi) * r * 0.5;
      starPositions[i * 3 + 2] = Math.cos(phi) * r;
      starSizes[i] = 0.3 + depth * 3.5;
      starPhases[i] = Math.random() * Math.PI * 2;
      starSpeeds[i] = 1.5 + Math.random() * 5;
      starDepths[i] = depth;
    }

    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute("size", new THREE.BufferAttribute(starSizes, 1));

    // Star shader — real twinkling with warm color
    const starMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float size;
        varying float vSize;
        varying vec3 vPos;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (250.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
          vSize = size;
          vPos = position;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vSize;
        varying vec3 vPos;
        uniform float uTime;
        uniform float uAlpha;
        float hash(float n) { return fract(sin(n) * 43758.5453); }
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float alpha = 1.0 - smoothstep(0.0, 1.0, d);
          alpha = pow(alpha, 2.0);
          float id = hash(vPos.x * 13.7 + vPos.y * 27.1 + vPos.z * 43.3);
          float twinkle = sin(uTime * (2.0 + id * 4.0) + id * 6.28) * 0.5 + 0.5;
          twinkle = twinkle * twinkle;
          float brightness = 0.25 + twinkle * 0.65;
          vec3 color = mix(vec3(1.0, 0.92, 0.78), vec3(1.0, 0.97, 0.9), brightness);
          float a = alpha * brightness * uAlpha;
          if (a < 0.015) discard;
          gl_FragColor = vec4(color, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // ═══ D O O R   G R O U P ═══
    const doorGroup = new THREE.Group();
    scene.add(doorGroup);

    // Door glow sphere (soft ambient)
    const glowGeo = new THREE.SphereGeometry(1, 32, 32);
    const glowMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vPos = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vPos;
        uniform float uTime;
        uniform float uAlpha;
        void main() {
          float fresnel = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
          fresnel = pow(fresnel, 3.0);
          float breathe = sin(uTime * 1.4 + 1.2) * 0.5 + 0.5;
          float alpha = fresnel * 0.35 * uAlpha * (0.7 + breathe * 0.3);
          vec3 color = mix(vec3(1.0, 0.65, 0.25), vec3(1.0, 0.85, 0.55), fresnel);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glowSphere = new THREE.Mesh(glowGeo, glowMat);
    glowSphere.scale.setScalar(35);
    glowSphere.position.set(0, -5, -40);
    doorGroup.add(glowSphere);

    // Door ring (torus)
    const ringGeo = new THREE.TorusGeometry(22, 0.3, 32, 64);
    const ringMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vPos = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vPos;
        uniform float uTime;
        uniform float uAlpha;
        void main() {
          float breathe = sin(uTime * 1.8) * 0.5 + 0.5;
          float alpha = uAlpha * (0.5 + breathe * 0.4);
          vec3 color = vec3(1.0, 0.78, 0.45);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const doorRing = new THREE.Mesh(ringGeo, ringMat);
    doorRing.rotation.x = Math.PI * 0.5;
    doorRing.position.set(0, 35, -40);
    doorGroup.add(doorRing);

    // Door pillars (thin cylinders)
    for (const side of [-1, 1]) {
      const pillarGeo = new THREE.CylinderGeometry(0.5, 0.5, 70, 16);
      const pillarMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vPos;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vPos = mv.xyz;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vPos;
          uniform float uTime;
          uniform float uAlpha;
          void main() {
            float breathe = sin(uTime * 1.6) * 0.5 + 0.5;
            float alpha = uAlpha * (0.4 + breathe * 0.35);
            vec3 color = vec3(1.0, 0.75, 0.4);
            gl_FragColor = vec4(color, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(side * 22, 0, -40);
      pillar.userData = { side };
      doorGroup.add(pillar);
    }

    // ═══ S I L H O U E T T E   G R O U P ═══
    const silGroup = new THREE.Group();
    silGroup.visible = false;
    scene.add(silGroup);

    // Father silhouette (simplified humanoid with capsule-like shapes)
    function createSilhouette(height: number, width: number, yOffset: number) {
      const group = new THREE.Group();

      // Head
      const headGeo = new THREE.SphereGeometry(width * 0.9, 16, 16);
      const headMat = new THREE.MeshBasicMaterial({ color: "#050310", transparent: true, opacity: 0.9 });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = height * 0.85;
      group.add(head);

      // Body
      const bodyGeo = new THREE.CapsuleGeometry(width, height * 0.55, 8, 16);
      const body = new THREE.Mesh(bodyGeo, headMat);
      body.position.y = height * 0.3;
      group.add(body);

      // Edge glow line
      const edgeGeo = new THREE.TorusGeometry(width * 1.05, 0.15, 8, 16);
      const edgeMat = new THREE.MeshBasicMaterial({ color: "#ffc878", transparent: true, opacity: 0.3 });
      const edge = new THREE.Mesh(edgeGeo, edgeMat);
      edge.position.y = height * 0.3;
      group.add(edge);

      group.position.y = yOffset;
      return group;
    }

    const fatherSil = createSilhouette(50, 10, -15);
    fatherSil.position.set(10, 0, -30);
    silGroup.add(fatherSil);

    const childSil = createSilhouette(30, 6, -25);
    childSil.position.set(-25, 0, -25);
    silGroup.add(childSil);

    // ═══ A N I M A T I O N   L O O P ═══
    const startTime = performance.now();
    let completed = false;

    function animate(now: number) {
      const t = (now - startTime) / 1000;
      if (t >= TOTAL_S) {
        if (!completed) {
          completed = true;
          setTimeout(() => {
            renderer.dispose();
            scene.clear();
            if (container && renderer.domElement.parentNode) container?.removeChild(renderer.domElement);
            onComplete();
          }, 200);
        }
        return;
      }

      // ── Stars fade in ──
      const starsAlpha = Math.min(1, t / 2.0);
      starMat.uniforms.uAlpha.value = starsAlpha;
      starMat.uniforms.uTime.value = t;

      // Slow camera drift
      camera.position.x = Math.sin(t * 0.15) * 8;
      camera.position.y = Math.cos(t * 0.12) * 5;
      camera.position.z = 200 + Math.sin(t * 0.1) * 15;
      camera.lookAt(0, Math.sin(t * 0.08) * 5, 0);

      // ── Door phase (1.1 - 3.2s) ──
      const doorProgress = t < 1.1 ? 0 : t > 3.2 ? 1 : (t - 1.1) / 2.1;
      if (doorProgress > 0) {
        doorGroup.visible = true;
        // Update all shader materials in door group
        doorGroup.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
            child.material.uniforms.uAlpha.value = doorProgress;
            child.material.uniforms.uTime.value = t;
          }
        });
        // Door breathing scale
        const breatheScale = 1 + Math.sin(t * 1.4) * 0.04;
        doorGroup.scale.setScalar(0.1 + doorProgress * 0.9 * breatheScale);
      } else {
        doorGroup.visible = false;
      }

      // ── Silhouette phase (2.9 - 5.0s) ──
      const silProgress = t < 2.9 ? 0 : t > 5.0 ? 1 : (t - 2.9) / 2.1;
      if (silProgress > 0) {
        silGroup.visible = true;
        const pull = silProgress;
        silGroup.position.z = (1 - pull) * -60;
        silGroup.children.forEach((child, i) => {
          if (child instanceof THREE.Mesh) {
            child.material.opacity = 0.3 + pull * 0.7;
          }
        });
      } else {
        silGroup.visible = false;
      }

      // ── Bloom (4.6 - 5.8s) ──
      const bloomProgress = t < 4.6 ? 0 : t > 5.8 ? 1 : (t - 4.6) / 1.2;
      renderer.toneMappingExposure = 1.0 + bloomProgress * 2.5;

      // ── White out (5.6 - 6.2s) ──
      const whiteProgress = t < 5.6 ? 0 : t > 6.2 ? 1 : (t - 5.6) / 0.6;
      if (whiteProgress > 0.01) {
        scene.background = new THREE.Color(
          `rgb(${Math.floor(2 + whiteProgress * 253)},${Math.floor(8 + whiteProgress * 247)},${Math.floor(20 + whiteProgress * 235)})`
        );
        scene.fog = null;
      }

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);

    // ── Resize handler ──
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        if (container && renderer.domElement.parentNode) container?.removeChild(renderer.domElement);
      }
    };
  }, [onComplete]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "#020108",
      }}
    />
  );
}


