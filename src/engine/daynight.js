import * as THREE from "three";

// =========================================================================
// 4. 日夜 Keyframes 與環境 Shader（天空、水面波光與煙花倒影 Shader）
// =========================================================================
export const DAY_NIGHT_KEYFRAMES = [
  { min: 0,    skyTop: 0x1e2c58, horizon: 0x3f4f80, sunColor: 0xb4c2ff, sunI: 1.15, hemiSky: 0x94a2d8, hemiGround: 0x64566a, hemiI: 1.85, night: 1.0,  water: 0x5a88b2 },
  { min: 300,  skyTop: 0x26365f, horizon: 0x4c5688, sunColor: 0xb8c4ff, sunI: 1.00, hemiSky: 0x96a4da, hemiGround: 0x66586c, hemiI: 1.85, night: 1.0,  water: 0x5c8ab4 },
  { min: 360,  skyTop: 0x7f8fc4, horizon: 0xf6c3a6, sunColor: 0xffb48a, sunI: 1.30, hemiSky: 0xf3c6b5, hemiGround: 0x6b5a5a, hemiI: 1.10, night: 0.55, water: 0x8fb7c4 },
  { min: 450,  skyTop: 0xa9d1ea, horizon: 0xfbe6d3, sunColor: 0xffe2c4, sunI: 2.40, hemiSky: 0xeaf2f6, hemiGround: 0x8a7a68, hemiI: 1.25, night: 0.0,  water: 0x9fcfd6 },
  { min: 720,  skyTop: 0x9fd0ec, horizon: 0xf4eee3, sunColor: 0xfff1de, sunI: 2.90, hemiSky: 0xeef6fa, hemiGround: 0x8f8270, hemiI: 1.35, night: 0.0,  water: 0xa9d8db },
  { min: 960,  skyTop: 0xa6cfe6, horizon: 0xf8e7d2, sunColor: 0xffe3c0, sunI: 2.50, hemiSky: 0xf1efe8, hemiGround: 0x8a7a66, hemiI: 1.25, night: 0.0,  water: 0x9fcbd2 },
  { min: 1065, skyTop: 0x8b8fc4, horizon: 0xf7b98f, sunColor: 0xff9f6a, sunI: 1.80, hemiSky: 0xf6d2bc, hemiGround: 0x7d6660, hemiI: 1.20, night: 0.30, water: 0x93a9bd },
  { min: 1140, skyTop: 0x5a5e9e, horizon: 0xd99aa6, sunColor: 0xff9a7a, sunI: 1.30, hemiSky: 0xc0b2e0, hemiGround: 0x655868, hemiI: 1.35, night: 0.75, water: 0x6a7cab },
  { min: 1260, skyTop: 0x22325f, horizon: 0x445488, sunColor: 0xc0ccff, sunI: 1.20, hemiSky: 0x98a8dc, hemiGround: 0x685a6e, hemiI: 1.90, night: 1.0,  water: 0x5a88b2 },
  { min: 1440, skyTop: 0x1e2c58, horizon: 0x3f4f80, sunColor: 0xb4c2ff, sunI: 1.15, hemiSky: 0x94a2d8, hemiGround: 0x64566a, hemiI: 1.85, night: 1.0,  water: 0x5a88b2 }
];

export function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x9fd0ec) },
      uHorizon: { value: new THREE.Color(0xf4eee3) },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
      uSun: { value: new THREE.Color(0xfff1de) },
      uNight: { value: 0.0 }
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uSunDir;
      uniform vec3 uSun;
      uniform float uNight;
      varying vec3 vWorldPos;

      float hash3(vec3 p) {
        p = fract(p * vec3(443.897, 441.423, 437.195));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      void main() {
        vec3 dir = normalize(vWorldPos);
        float h = smoothstep(-0.02, 0.55, dir.y);
        vec3 col = mix(uHorizon, uTop, h);

        float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
        col += uSun * pow(sunDot, 18.0) * 0.35 * (1.0 - uNight * 0.65);

        if (uNight > 0.01 && dir.y > 0.02) {
          float st = hash3(floor(dir * 180.0));
          if (st > 0.9965) {
            float starBright = smoothstep(0.02, 0.25, dir.y) * uNight;
            col += vec3(0.95, 0.97, 1.0) * starBright * 0.85;
          }
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
}

export function createWaterMaterial(cityCenter, isWall = false) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(0xa4d4da) },
      uDeep: { value: new THREE.Color(0x6fa9b8) },
      uTint: { value: new THREE.Color(0xa9d8db) },
      uCityCenter: { value: cityCenter.clone() },
      uFogColor: { value: new THREE.Color(0xf4eee3) },
      uFogNear: { value: 42.0 },
      uFogFar: { value: 150.0 },
      uFireworkPos: { value: new THREE.Vector3(0, 0, 0) },
      uFireworkColor: { value: new THREE.Color(0xff9f6a) },
      uFireworkGlow: { value: 0.0 }
    },
    polygonOffset: isWall,
    polygonOffsetFactor: isWall ? 1 : 0,
    polygonOffsetUnits: isWall ? 1 : 0,
    vertexShader: `
      varying vec3 vWorldPos;
      varying float vViewDist;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vec4 vp = viewMatrix * wp;
        vViewDist = -vp.z;
        gl_Position = projectionMatrix * vp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uTint;
      uniform vec3 uCityCenter;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform vec3 uFireworkPos;
      uniform vec3 uFireworkColor;
      uniform float uFireworkGlow;
      varying vec3 vWorldPos;
      varying float vViewDist;

      void main() {
        vec2 p = vWorldPos.xz;
        float w1 = sin(p.x * 0.42 + p.y * 0.29 + uTime * 1.05);
        float w2 = sin(p.x * -0.31 + p.y * 0.48 - uTime * 0.78);
        float w3 = cos((p.x + p.y) * 0.85 + uTime * 1.4) * 0.15;
        float wave = (w1 + w2) * 0.25 + w3 + 0.5;

        float distCity = length(p - uCityCenter.xz);
        float depthFactor = clamp(smoothstep(4.5, 48.0, distCity) + wave * 0.16, 0.0, 1.0);

        vec3 baseWater = mix(uShallow, uDeep, depthFactor);
        baseWater = mix(baseWater, uTint, 0.45);

        // 珠江口海面波光高光閃爍
        float spark = sin(p.x * 3.6 + uTime * 2.2) * sin(p.y * 3.9 - uTime * 1.95);
        if (spark > 0.90 && distCity < 46.0) {
          baseWater += vec3(0.16, 0.19, 0.18) * (spark - 0.90) * 11.0;
        }

        // 旅遊塔煙花海面倒影
        if (uFireworkGlow > 0.01) {
          float fwDist = length(p - uFireworkPos.xz);
          float refl = exp(-fwDist * 0.22) * uFireworkGlow * (0.7 + 0.3 * w1);
          baseWater += uFireworkColor * refl * 0.85;
        }

        float fogFactor = smoothstep(uFogNear, uFogFar, vViewDist);
        vec3 finalCol = mix(baseWater, uFogColor, fogFactor);
        gl_FragColor = vec4(finalCol, 1.0);
      }
    `
  });
}
