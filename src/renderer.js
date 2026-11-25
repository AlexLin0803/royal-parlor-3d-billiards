// Custom WebGL2 PBR Renderer with:
// - 3-lamp overhead billiard chandelier lighting & specular clearcoat reflections
// - Analytical soft ball shadows + grounded contact AO directly on the wool felt
// - Procedural textures for all 16 balls, woven felt, mahogany wood, and parlor floor
// - Crisp aim guide overlays (dotted line, ghost ball ring, deflection arrows, chalk particles)

import { Mat4, clamp } from './math.js';
import { TABLE, BALL, FELT_THEMES } from './constants.js';
import { BALL_STATE } from './physics.js';
import { createSphereMesh, createTableMeshes, createCueStickMeshes } from './mesh.js';
import {
  createBallTextureCanvas,
  createFeltTextureCanvas,
  createWoodTextureCanvas,
  createFloorTextureCanvas
} from './textures.js';

const PBR_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;

uniform mat4 uModel;
uniform mat4 uViewProj;
uniform mat3 uNormalMatrix;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUV;

void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorldPos = world.xyz;
  vNormal = normalize(uNormalMatrix * aNormal);
  vUV = aUV;
  gl_Position = uViewProj * world;
}
`;

const PBR_FS = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;

uniform sampler2D uAlbedoMap;
uniform float uUseTexture;
uniform vec3 uBaseColor;
uniform float uRoughness;
uniform float uMetallic;
uniform float uClearcoat;
uniform float uFeltSheen;
uniform float uReceiveShadows;
uniform float uIsFloor;
uniform vec3 uFeltBounce;
uniform vec3 uCameraPos;

// 16 balls: xyz = world center, w = shadow alpha (1 = active on felt, fades as ball falls)
uniform vec4 uBalls[16];
uniform float uBallRadius;

out vec4 fragColor;

const float PI = 3.14159265359;

// Three overhead warm billiard parlor lamps above the table
const vec3 LIGHT_POS[3] = vec3[3](
  vec3(-0.72, 1.38, 0.0),
  vec3( 0.00, 1.42, 0.0),
  vec3( 0.72, 1.38, 0.0)
);
const vec3 LIGHT_COL[3] = vec3[3](
  vec3(1.00, 0.95, 0.86) * 2.55,
  vec3(1.00, 0.97, 0.90) * 2.85,
  vec3(1.00, 0.95, 0.86) * 2.55
);

float D_GGX(float NdotH, float rough) {
  float a = rough * rough;
  float a2 = a * a;
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-5);
}

float G_Schlick(float NdotV, float NdotL, float rough) {
  float k = (rough + 1.0);
  k = (k * k) / 8.0;
  float gv = NdotV / (NdotV * (1.0 - k) + k);
  float gl = NdotL / (NdotL * (1.0 - k) + k);
  return gv * gl;
}

vec3 F_Schlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// Soft analytical shadow cast by 16 spherical balls onto the felt from a lamp position
float computeLampShadow(vec3 p, vec3 lightPos) {
  vec3 toL = lightPos - p;
  float distL = length(toL);
  vec3 dir = toL / max(distL, 1e-4);
  float visibility = 1.0;
  float r = uBallRadius;

  for (int i = 0; i < 16; i++) {
    float alpha = uBalls[i].w;
    if (alpha <= 0.01) continue;
    vec3 oc = uBalls[i].xyz - p;
    float t = dot(oc, dir);
    if (t <= 0.0 || t >= distL) continue;
    vec3 closest = p + dir * t;
    float d = length(uBalls[i].xyz - closest);
    // Soft penumbra widens with distance from ball
    float penumbra = 0.008 + t * 0.14;
    float occ = 1.0 - smoothstep(r * 0.72, r + penumbra, d);
    visibility *= (1.0 - occ * 0.52 * alpha);
  }
  return visibility;
}

// Grounded contact ambient occlusion right beneath each ball on the felt
float computeContactAO(vec3 p) {
  float ao = 1.0;
  float r = uBallRadius;
  for (int i = 0; i < 16; i++) {
    float alpha = uBalls[i].w;
    if (alpha <= 0.01) continue;
    vec2 d = p.xz - uBalls[i].xz;
    float dist = length(d);
    float heightAbove = max(0.0, uBalls[i].y - r);
    float spread = r * (1.32 + heightAbove * 4.0);
    float occ = (1.0 - smoothstep(r * 0.25, spread, dist)) * alpha;
    ao *= (1.0 - occ * 0.72);
  }
  return ao;
}

// ACES Filmic tone mapping
vec3 acesToneMap(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos - vWorldPos);
  float NdotV = max(dot(N, V), 0.001);

  vec3 texCol = uUseTexture > 0.5 ? texture(uAlbedoMap, vUV).rgb : vec3(1.0);
  // Convert sRGB texture/base color to linear space
  vec3 albedo = pow(texCol * uBaseColor, vec3(2.2));

  // Floor radial parlor spotlight falloff & soft under-table shadow
  float tableShadow = 1.0;
  if (uIsFloor > 0.5) {
    vec2 boxD = abs(vWorldPos.xz) - vec2(1.22, 0.66);
    float outside = length(max(boxD, 0.0));
    tableShadow = smoothstep(0.0, 0.72, outside) * 0.85 + 0.15;
    float vignette = 1.0 - smoothstep(1.2, 5.2, length(vWorldPos.xz));
    albedo *= (0.32 + 0.68 * vignette);
  }

  float rough = clamp(uRoughness, 0.04, 0.98);
  vec3 F0 = mix(vec3(0.04), albedo, uMetallic);

  vec3 Lo = vec3(0.0);

  for (int i = 0; i < 3; i++) {
    vec3 Lvec = LIGHT_POS[i] - vWorldPos;
    float dist = length(Lvec);
    vec3 L = Lvec / max(dist, 1e-4);
    float NdotL = max(dot(N, L), 0.0);
    if (NdotL <= 0.0) continue;

    // Gentle downward spotlight cone from classic shaded pool table lamps
    float cone = clamp(dot(-L, vec3(0.0, -1.0, 0.0)), 0.0, 1.0);
    float spot = smoothstep(0.28, 0.82, cone);
    float atten = spot / (1.0 + 0.24 * dist * dist);

    float shadow = 1.0;
    if (uReceiveShadows > 0.5) {
      shadow = computeLampShadow(vWorldPos, LIGHT_POS[i]);
    }
    shadow *= tableShadow;

    vec3 H = normalize(V + L);
    float NdotH = max(dot(N, H), 0.0);
    float HdotV = max(dot(H, V), 0.0);

    float D = D_GGX(NdotH, rough);
    float G = G_Schlick(NdotV, NdotL, rough);
    vec3 F = F_Schlick(HdotV, F0);

    vec3 kD = (1.0 - F) * (1.0 - uMetallic);
    vec3 diffuse = kD * albedo / PI;
    vec3 spec = (D * G * F) / max(4.0 * NdotV * NdotL, 1e-4);

    // Clearcoat layer for glossy phenolic resin billiard balls & lacquered wood
    vec3 coatSpec = vec3(0.0);
    if (uClearcoat > 0.01) {
      float coatD = D_GGX(NdotH, 0.055);
      float coatF = 0.045 + 0.955 * pow(1.0 - HdotV, 5.0);
      coatSpec = vec3(coatD * coatF * 0.28 * uClearcoat);
    }

    // Subtle wool felt grazing sheen
    vec3 sheen = vec3(0.0);
    if (uFeltSheen > 0.01) {
      float rim = pow(1.0 - NdotV, 3.0);
      sheen = albedo * rim * 0.22 * uFeltSheen;
    }

    Lo += (diffuse + spec + coatSpec + sheen) * LIGHT_COL[i] * NdotL * atten * shadow;
  }

  // Soft billiard parlor ambient + green felt bounce light on lower hemispheres (balls & cushions)
  float hemi = N.y * 0.5 + 0.5;
  vec3 skyAmbient = vec3(0.24, 0.22, 0.19);
  vec3 groundAmbient = mix(vec3(0.05, 0.04, 0.04), uFeltBounce, 0.85);
  vec3 ambient = mix(groundAmbient, skyAmbient, hemi) * albedo * (1.0 - uMetallic * 0.55);

  // Subtle metallic & clearcoat environment reflection (simulating overhead warm parlor light strip)
  if (uClearcoat > 0.05 || uMetallic > 0.2) {
    vec3 R = reflect(-V, N);
    float envUp = smoothstep(0.15, 0.92, R.y);
    float strip = smoothstep(0.55, 0.96, R.y) * smoothstep(0.55, 0.0, abs(R.z));
    vec3 envColor = mix(groundAmbient * 1.4, vec3(0.52, 0.48, 0.42), envUp) + vec3(0.68, 0.63, 0.55) * strip;
    float fresnel = 0.04 + 0.96 * pow(1.0 - NdotV, 4.0);
    vec3 envSpec = mix(vec3(fresnel * uClearcoat * 0.42), albedo * 0.55, uMetallic);
    ambient += envColor * envSpec;
  }

  // Apply grounded contact AO under balls on the felt
  if (uReceiveShadows > 0.5) {
    float ao = computeContactAO(vWorldPos);
    ambient *= ao;
    Lo *= (0.35 + 0.65 * ao);
  }

  vec3 color = ambient + Lo;
  color = acesToneMap(color);
  color = pow(color, vec3(1.0 / 2.2));
  fragColor = vec4(color, 1.0);
}
`;

const OVERLAY_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec4 aColor;

uniform mat4 uViewProj;
out vec4 vColor;

void main() {
  vColor = aColor;
  gl_Position = uViewProj * vec4(aPosition, 1.0);
}
`;

const OVERLAY_FS = `#version 300 es
precision highp float;

in vec4 vColor;
out vec4 fragColor;

void main() {
  fragColor = vColor;
}
`;

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile error: ' + log);
  }
  return sh;
}

function createProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    throw new Error('Program link error: ' + log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function uploadMesh(gl, data) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data.positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  const normBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data.normals, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  const uvBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data.uvs, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

  const idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);

  gl.bindVertexArray(null);
  return {
    vao,
    indexCount: data.indices.length,
    indexType: data.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT
  };
}

function uploadTexture(gl, canvas, repeat = false) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  const ext = gl.getExtension('EXT_texture_filter_anisotropic');
  if (ext) {
    const maxAniso = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
    gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, maxAniso));
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

// Compute upper-left 3x3 normal matrix from column-major mat4 (uniform/rigid transforms)
function mat4ToNormalMat3(out, m) {
  out[0] = m[0]; out[1] = m[1]; out[2] = m[2];
  out[3] = m[4]; out[4] = m[5]; out[5] = m[6];
  out[6] = m[8]; out[7] = m[9]; out[8] = m[10];
  return out;
}

export class BilliardsRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    if (!gl) {
      throw new Error('WebGL2 is not supported in this browser.');
    }
    this.gl = gl;
    this.feltTheme = 'emerald';

    this._initShaders();
    this._initResources();
    this._initOverlayBuffers();

    this.identityMat = Mat4.identity();
    this.tempModel = Mat4.identity();
    this.tempNorm3 = new Float32Array(9);
    this.ballUniformData = new Float32Array(16 * 4);
    this.particles = [];
  }

  _initShaders() {
    const gl = this.gl;
    this.pbrProg = createProgram(gl, PBR_VS, PBR_FS);
    this.uPbr = {
      model: gl.getUniformLocation(this.pbrProg, 'uModel'),
      viewProj: gl.getUniformLocation(this.pbrProg, 'uViewProj'),
      normalMatrix: gl.getUniformLocation(this.pbrProg, 'uNormalMatrix'),
      albedoMap: gl.getUniformLocation(this.pbrProg, 'uAlbedoMap'),
      useTexture: gl.getUniformLocation(this.pbrProg, 'uUseTexture'),
      baseColor: gl.getUniformLocation(this.pbrProg, 'uBaseColor'),
      roughness: gl.getUniformLocation(this.pbrProg, 'uRoughness'),
      metallic: gl.getUniformLocation(this.pbrProg, 'uMetallic'),
      clearcoat: gl.getUniformLocation(this.pbrProg, 'uClearcoat'),
      feltSheen: gl.getUniformLocation(this.pbrProg, 'uFeltSheen'),
      receiveShadows: gl.getUniformLocation(this.pbrProg, 'uReceiveShadows'),
      isFloor: gl.getUniformLocation(this.pbrProg, 'uIsFloor'),
      feltBounce: gl.getUniformLocation(this.pbrProg, 'uFeltBounce'),
      cameraPos: gl.getUniformLocation(this.pbrProg, 'uCameraPos'),
      balls: gl.getUniformLocation(this.pbrProg, 'uBalls'),
      ballRadius: gl.getUniformLocation(this.pbrProg, 'uBallRadius')
    };

    this.overlayProg = createProgram(gl, OVERLAY_VS, OVERLAY_FS);
    this.uOverlayViewProj = gl.getUniformLocation(this.overlayProg, 'uViewProj');
  }

  _initResources() {
    const gl = this.gl;

    // Meshes
    const tableRaw = createTableMeshes();
    this.meshes = {
      feltBed: uploadMesh(gl, tableRaw.feltBed),
      cushions: uploadMesh(gl, tableRaw.cushions),
      woodFrame: uploadMesh(gl, tableRaw.woodFrame),
      brassTrim: uploadMesh(gl, tableRaw.brassTrim),
      diamondSights: uploadMesh(gl, tableRaw.diamondSights),
      pocketWells: uploadMesh(gl, tableRaw.pocketWells),
      floor: uploadMesh(gl, tableRaw.floor),
      sphere: uploadMesh(gl, createSphereMesh(BALL.radius, 28, 40))
    };

    const cueRaw = createCueStickMeshes();
    this.cueMeshes = {
      tip: uploadMesh(gl, cueRaw.tip),
      ferrule: uploadMesh(gl, cueRaw.ferrule),
      shaft: uploadMesh(gl, cueRaw.shaft),
      brassJoint: uploadMesh(gl, cueRaw.brassJoint),
      buttWood: uploadMesh(gl, cueRaw.buttWood),
      wrap: uploadMesh(gl, cueRaw.wrap)
    };

    // Textures
    this.ballTextures = [];
    for (let i = 0; i < 16; i++) {
      this.ballTextures.push(uploadTexture(gl, createBallTextureCanvas(i), true));
    }
    this.feltTexture = uploadTexture(gl, createFeltTextureCanvas(this.feltTheme), false);
    this.woodTexture = uploadTexture(gl, createWoodTextureCanvas(), true);
    this.floorTexture = uploadTexture(gl, createFloorTextureCanvas(), true);
  }

  setFeltTheme(themeKey) {
    if (!FELT_THEMES[themeKey]) return;
    this.feltTheme = themeKey;
    const gl = this.gl;
    gl.deleteTexture(this.feltTexture);
    this.feltTexture = uploadTexture(gl, createFeltTextureCanvas(themeKey), false);
  }

  _initOverlayBuffers() {
    const gl = this.gl;
    this.overlayVao = gl.createVertexArray();
    gl.bindVertexArray(this.overlayVao);

    this.overlayPosBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayPosBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    this.overlayColBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayColBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  // Spawn subtle chalk dust burst at cue strike impact
  spawnChalkBurst(x, y, z, dirX, dirZ, power) {
    const count = Math.floor(8 + power * 18);
    for (let i = 0; i < count; i++) {
      const spread = 0.25 + Math.random() * 0.45;
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x: x - dirX * BALL.radius * 0.9,
        y: y + (Math.random() - 0.3) * 0.012,
        z: z - dirZ * BALL.radius * 0.9,
        vx: dirX * (0.15 + power * 0.5) + Math.cos(a) * spread * 0.28,
        vy: 0.08 + Math.random() * 0.24,
        vz: dirZ * (0.15 + power * 0.5) + Math.sin(a) * spread * 0.28,
        size: 0.003 + Math.random() * 0.0045,
        life: 0,
        maxLife: 0.32 + Math.random() * 0.35
      });
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= Math.exp(-4.5 * dt);
      p.vz *= Math.exp(-4.5 * dt);
      p.vy -= 0.45 * dt;
      if (p.y < 0.002) p.y = 0.002;
    }
  }

  resize(width, height, dpr) {
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }

  _drawMesh(mesh, modelMat, mat) {
    const gl = this.gl;
    const u = this.uPbr;

    gl.uniformMatrix4fv(u.model, false, modelMat);
    mat4ToNormalMat3(this.tempNorm3, modelMat);
    gl.uniformMatrix3fv(u.normalMatrix, false, this.tempNorm3);

    if (mat.texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mat.texture);
      gl.uniform1i(u.albedoMap, 0);
      gl.uniform1f(u.useTexture, 1.0);
    } else {
      gl.uniform1f(u.useTexture, 0.0);
    }

    gl.uniform3fv(u.baseColor, mat.color || [1, 1, 1]);
    gl.uniform1f(u.roughness, mat.roughness ?? 0.5);
    gl.uniform1f(u.metallic, mat.metallic ?? 0.0);
    gl.uniform1f(u.clearcoat, mat.clearcoat ?? 0.0);
    gl.uniform1f(u.feltSheen, mat.feltSheen ?? 0.0);
    gl.uniform1f(u.receiveShadows, mat.receiveShadows ? 1.0 : 0.0);
    gl.uniform1f(u.isFloor, mat.isFloor ? 1.0 : 0.0);

    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0);
  }

  render(camera, balls, cueVisual, aimPrediction, placementState, showAimGuide) {
    const gl = this.gl;

    // Warm dark billiard parlor lounge backdrop
    gl.clearColor(0.085, 0.068, 0.058, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // Pack 16 ball positions & shadow visibility factors
    this.ballUniformData.fill(0);
    for (let i = 0; i < Math.min(balls.length, 16); i++) {
      const b = balls[i];
      let alpha = 0;
      if (b.state === BALL_STATE.ACTIVE) {
        alpha = 1.0;
      } else if (b.state === BALL_STATE.FALLING) {
        alpha = clamp((b.y + 0.03) / (BALL.radius + 0.03), 0, 1);
      }
      this.ballUniformData[i * 4 + 0] = b.x;
      this.ballUniformData[i * 4 + 1] = b.y;
      this.ballUniformData[i * 4 + 2] = b.z;
      this.ballUniformData[i * 4 + 3] = alpha;
    }

    const theme = FELT_THEMES[this.feltTheme] || FELT_THEMES.emerald;
    const cushionTint = this.feltTheme === 'tournament'
      ? [0.11, 0.35, 0.54]
      : this.feltTheme === 'burgundy'
      ? [0.42, 0.11, 0.16]
      : [0.09, 0.41, 0.25];

    gl.useProgram(this.pbrProg);
    gl.uniformMatrix4fv(this.uPbr.viewProj, false, camera.viewProjMatrix);
    gl.uniform3fv(this.uPbr.cameraPos, camera.eye);
    gl.uniform3fv(this.uPbr.feltBounce, theme.bounce);
    gl.uniform4fv(this.uPbr.balls, this.ballUniformData);
    gl.uniform1f(this.uPbr.ballRadius, BALL.radius);

    // 1. Parlor hardwood floor
    this._drawMesh(this.meshes.floor, this.identityMat, {
      texture: this.floorTexture,
      color: [1.15, 1.02, 0.90],
      roughness: 0.58,
      isFloor: true
    });

    // 2. Deep dark pocket wells & leather collars
    this._drawMesh(this.meshes.pocketWells, this.identityMat, {
      color: [0.07, 0.06, 0.055],
      roughness: 0.78
    });

    // 3. Woven felt playing bed (with analytical soft shadows & contact AO!)
    this._drawMesh(this.meshes.feltBed, this.identityMat, {
      texture: this.feltTexture,
      color: [1.0, 1.0, 1.0],
      roughness: 0.88,
      feltSheen: 1.0,
      receiveShadows: true
    });

    // 4. Beveled felt-wrapped cushions
    this._drawMesh(this.meshes.cushions, this.identityMat, {
      color: cushionTint,
      roughness: 0.82,
      feltSheen: 0.85
    });

    // 5. Mahogany hardwood outer rails, cabinet apron & tapered legs
    this._drawMesh(this.meshes.woodFrame, this.identityMat, {
      texture: this.woodTexture,
      color: [1.0, 0.96, 0.92],
      roughness: 0.28,
      clearcoat: 0.45
    });

    // 6. Brushed antique brass corner/side pocket castings & leg ferrules
    this._drawMesh(this.meshes.brassTrim, this.identityMat, {
      color: [0.92, 0.74, 0.36],
      roughness: 0.24,
      metallic: 0.90
    });

    // 7. Inlaid mother-of-pearl diamond sights
    this._drawMesh(this.meshes.diamondSights, this.identityMat, {
      color: [0.95, 0.92, 0.84],
      roughness: 0.18,
      clearcoat: 0.7
    });

    // 8. Billiard balls (ACTIVE and FALLING — visibly dropping inside pocket wells!)
    for (const b of balls) {
      if (b.state === BALL_STATE.POCKETED) continue;
      Mat4.fromRotationTranslationScale(
        this.tempModel,
        b.quat,
        [b.x, b.y, b.z],
        [1, 1, 1]
      );
      this._drawMesh(this.meshes.sphere, this.tempModel, {
        texture: this.ballTextures[b.num],
        color: [1.0, 1.0, 1.0],
        roughness: 0.085,
        clearcoat: 1.0
      });
    }

    // 9. Detailed 3D Cue Stick
    if (cueVisual && cueVisual.visible) {
      const { tipX, tipY, tipZ, aimAngle, pitch } = cueVisual;
      // Local cue extends from tip (0,0,0) along +Z to butt (0,0,1.47).
      // We want local -Z to point along shot direction (cos(aimAngle), 0, sin(aimAngle)),
      // so local +Z points backward behind the cue ball: (-cos(aimAngle), sin(pitch), -sin(aimAngle))
      // In Mat4.fromYawPitchTranslation: local +Z maps to (sin(yaw)*cos(pitch), -sin(pitch), cos(yaw)*cos(pitch))
      // Setting yaw = atan2(-cos(aimAngle), -sin(aimAngle)) and pitch = -elevationAngle maps +Z cleanly backward & upward!
      const yaw = Math.atan2(-Math.cos(aimAngle), -Math.sin(aimAngle));
      Mat4.fromYawPitchTranslation(this.tempModel, yaw, -pitch, tipX, tipY, tipZ);

      this._drawMesh(this.cueMeshes.tip, this.tempModel, {
        color: [0.22, 0.45, 0.74], // Blue Master chalked leather tip
        roughness: 0.85
      });
      this._drawMesh(this.cueMeshes.ferrule, this.tempModel, {
        color: [0.94, 0.91, 0.85],
        roughness: 0.22,
        clearcoat: 0.4
      });
      this._drawMesh(this.cueMeshes.shaft, this.tempModel, {
        color: [0.89, 0.76, 0.56], // Warm maple shaft
        roughness: 0.26,
        clearcoat: 0.35
      });
      this._drawMesh(this.cueMeshes.brassJoint, this.tempModel, {
        color: [0.88, 0.74, 0.38],
        roughness: 0.24,
        metallic: 0.88
      });
      this._drawMesh(this.cueMeshes.buttWood, this.tempModel, {
        color: [0.26, 0.11, 0.07], // Deep ebony/rosewood butt
        roughness: 0.18,
        clearcoat: 0.85
      });
      this._drawMesh(this.cueMeshes.wrap, this.tempModel, {
        color: [0.11, 0.11, 0.12], // Black Irish linen grip wrap
        roughness: 0.88
      });
    }

    // 10. Translucent Aim Guide, Ghost Ball, Ball-in-Hand Ring & Chalk Dust Particles
    this._renderOverlays(camera, aimPrediction, placementState, showAimGuide);
  }

  _renderOverlays(camera, aim, placement, showAimGuide) {
    const gl = this.gl;
    const positions = [];
    const colors = [];

    const pushTri = (p0, p1, p2, c) => {
      positions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
      colors.push(c[0], c[1], c[2], c[3], c[0], c[1], c[2], c[3], c[0], c[1], c[2], c[3]);
    };

    // Helper: draw crisp horizontal ribbon segment at height y
    const pushSegment = (x1, z1, x2, z2, y, halfW, c) => {
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      if (len < 1e-5) return;
      const px = (-dz / len) * halfW;
      const pz = (dx / len) * halfW;
      const a = [x1 + px, y, z1 + pz];
      const b = [x1 - px, y, z1 - pz];
      const d = [x2 - px, y, z2 - pz];
      const e = [x2 + px, y, z2 + pz];
      pushTri(a, b, d, c);
      pushTri(a, d, e, c);
    };

    // Helper: draw dashed line ribbon
    const pushDashedLine = (x1, z1, x2, z2, y, halfW, dashLen, gapLen, c) => {
      const dx = x2 - x1, dz = z2 - z1;
      const total = Math.hypot(dx, dz);
      if (total < 1e-4) return;
      const ux = dx / total, uz = dz / total;
      let d = 0.015;
      while (d < total) {
        const end = Math.min(total, d + dashLen);
        pushSegment(x1 + ux * d, z1 + uz * d, x1 + ux * end, z1 + uz * end, y, halfW, c);
        d += dashLen + gapLen;
      }
    };

    // Helper: draw horizontal ring on felt
    const pushRing = (cx, cz, y, rInner, rOuter, segs, c) => {
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        const c1 = Math.cos(a1), s1 = Math.sin(a1);
        const i0 = [cx + c0 * rInner, y, cz + s0 * rInner];
        const o0 = [cx + c0 * rOuter, y, cz + s0 * rOuter];
        const i1 = [cx + c1 * rInner, y, cz + s1 * rInner];
        const o1 = [cx + c1 * rOuter, y, cz + s1 * rOuter];
        pushTri(i0, o0, o1, c);
        pushTri(i0, o1, i1, c);
      }
    };

    const guideY = 0.003;

    if (showAimGuide && aim) {
      // Main dashed aim line from cue ball to ghost ball impact point
      const dist = aim.distance;
      if (dist > BALL.radius * 0.5) {
        const ux = (aim.ghostX - aim.startX) / dist;
        const uz = (aim.ghostZ - aim.startZ) / dist;
        const startOff = BALL.radius * 1.05;
        const endOff = Math.max(startOff, dist - BALL.radius * 0.92);
        if (endOff > startOff) {
          pushDashedLine(
            aim.startX + ux * startOff,
            aim.startZ + uz * startOff,
            aim.startX + ux * endOff,
            aim.startZ + uz * endOff,
            guideY,
            0.0028,
            0.024,
            0.018,
            [1.0, 0.98, 0.90, 0.72]
          );
        }
      }

      // Ghost ball ring at exact impact point
      const ghostCol = aim.hitType === 'ball'
        ? [1.0, 0.95, 0.78, 0.85]
        : aim.hitType === 'pocket'
        ? [1.0, 0.45, 0.35, 0.85]
        : [0.92, 0.96, 1.0, 0.55];
      pushRing(aim.ghostX, aim.ghostZ, guideY + 0.0005, BALL.radius - 0.0032, BALL.radius + 0.001, 32, ghostCol);

      // Subtle translucent fill inside ghost ball ring
      pushRing(aim.ghostX, aim.ghostZ, guideY, 0.0, BALL.radius - 0.0032, 24, [ghostCol[0], ghostCol[1], ghostCol[2], 0.14]);

      // Predicted object ball trajectory line + arrowhead (clamped cleanly inside table rails)
      if (aim.hitType === 'ball' && aim.objectDir && aim.hitBall) {
        const [ox, oz] = aim.objectDir;
        const bx = aim.hitBall.x;
        const bz = aim.hitBall.z;
        const maxX = TABLE.halfL - BALL.radius * 0.5;
        const maxZ = TABLE.halfW - BALL.radius * 0.5;
        let maxLen = 0.36;
        if (Math.abs(ox) > 1e-4) {
          const tx = (ox > 0 ? maxX - bx : -maxX - bx) / ox;
          if (tx > 0) maxLen = Math.min(maxLen, tx);
        }
        if (Math.abs(oz) > 1e-4) {
          const tz = (oz > 0 ? maxZ - bz : -maxZ - bz) / oz;
          if (tz > 0) maxLen = Math.min(maxLen, tz);
        }
        const lineLen = Math.max(0.04, maxLen - 0.02);
        const startOff = Math.min(BALL.radius, lineLen * 0.5);
        const ex = bx + ox * lineLen;
        const ez = bz + oz * lineLen;
        const objCol = [0.38, 0.96, 0.65, 0.82];
        pushSegment(bx + ox * startOff, bz + oz * startOff, ex, ez, guideY + 0.0008, 0.003, objCol);

        // Arrowhead tip
        const px = -oz, pz = ox;
        const tip = [ex + ox * 0.022, guideY + 0.0008, ez + oz * 0.022];
        const lWing = [ex - ox * 0.009 + px * 0.013, guideY + 0.0008, ez - oz * 0.009 + pz * 0.013];
        const rWing = [ex - ox * 0.009 - px * 0.013, guideY + 0.0008, ez - oz * 0.009 - pz * 0.013];
        pushTri(tip, lWing, rWing, objCol);
      }

      // Cue ball post-impact tangent / cushion reflection preview
      if (aim.cueDeflectDir && aim.cueDeflectStrength > 0.08) {
        const [dx, dz] = aim.cueDeflectDir;
        const len = 0.14 + aim.cueDeflectStrength * 0.18;
        pushDashedLine(
          aim.ghostX,
          aim.ghostZ,
          aim.ghostX + dx * len,
          aim.ghostZ + dz * len,
          guideY + 0.0004,
          0.0022,
          0.016,
          0.014,
          [0.85, 0.92, 1.0, 0.45]
        );
      }
    }

    // Ball-in-hand cue placement ring
    if (placement && placement.active) {
      const col = placement.valid
        ? [0.30, 0.95, 0.60, 0.90]
        : [0.98, 0.32, 0.28, 0.90];
      pushRing(placement.x, placement.z, guideY + 0.001, BALL.radius + 0.006, BALL.radius + 0.014, 36, col);
      pushRing(placement.x, placement.z, guideY + 0.0005, 0.0, BALL.radius + 0.005, 24, [col[0], col[1], col[2], 0.16]);
    }

    // Chalk dust particles (camera-facing billboard triangles)
    if (this.particles.length > 0) {
      const rx = camera.viewMatrix[0], ry = camera.viewMatrix[4], rz = camera.viewMatrix[8];
      const ux = camera.viewMatrix[1], uy = camera.viewMatrix[5], uz = camera.viewMatrix[9];
      for (const p of this.particles) {
        const alpha = (1 - p.life / p.maxLife) * 0.65;
        const s = p.size * (1 + p.life * 2.5);
        const col = [0.78, 0.89, 1.0, alpha];
        const a = [p.x - rx * s - ux * s, p.y - ry * s - uy * s, p.z - rz * s - uz * s];
        const b = [p.x + rx * s - ux * s, p.y + ry * s - uy * s, p.z + rz * s - uz * s];
        const c = [p.x + rx * s + ux * s, p.y + ry * s + uy * s, p.z + rz * s + uz * s];
        const d = [p.x - rx * s + ux * s, p.y - ry * s + uy * s, p.z - rz * s + uz * s];
        pushTri(a, b, c, col);
        pushTri(a, c, d, col);
      }
    }

    if (positions.length === 0) return;

    gl.useProgram(this.overlayProg);
    gl.uniformMatrix4fv(this.uOverlayViewProj, false, camera.viewProjMatrix);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);

    gl.bindVertexArray(this.overlayVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayColBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, positions.length / 3);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null);
  }
}
