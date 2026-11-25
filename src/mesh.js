// Procedural 3D mesh builders for the pool table, pockets, cushions, rails, brass castings,
// inlaid diamond sights, legs, billiard balls, detailed cue stick, and aim guides

import { TABLE, BALL, POCKETS } from './constants.js';

// Helper to accumulate triangles into flat typed arrays: pos(3), normal(3), uv(2)
class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.indices = [];
  }

  addVertex(x, y, z, nx, ny, nz, u = 0, v = 0) {
    const idx = this.positions.length / 3;
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    this.uvs.push(u, v);
    return idx;
  }

  addTri(a, b, c) {
    this.indices.push(a, b, c);
  }

  // Add a flat quad (CCW winding from front)
  addQuad(p0, p1, p2, p3, uv0 = [0, 0], uv1 = [1, 0], uv2 = [1, 1], uv3 = [0, 1]) {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;

    const i0 = this.addVertex(p0[0], p0[1], p0[2], nx, ny, nz, uv0[0], uv0[1]);
    const i1 = this.addVertex(p1[0], p1[1], p1[2], nx, ny, nz, uv1[0], uv1[1]);
    const i2 = this.addVertex(p2[0], p2[1], p2[2], nx, ny, nz, uv2[0], uv2[1]);
    const i3 = this.addVertex(p3[0], p3[1], p3[2], nx, ny, nz, uv3[0], uv3[1]);
    this.indices.push(i0, i1, i2, i0, i2, i3);
  }

  // Add axis-aligned box with clean outward normals and world-scaled UVs
  addBox(x0, y0, z0, x1, y1, z1, uvScale = 1.0) {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const minZ = Math.min(z0, z1), maxZ = Math.max(z0, z1);
    const sx = (maxX - minX) * uvScale;
    const sy = (maxY - minY) * uvScale;
    const sz = (maxZ - minZ) * uvScale;

    // +Y top
    this.addQuad(
      [minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ],
      [0, 0], [sx, 0], [sx, sz], [0, sz]
    );
    // -Y bottom
    this.addQuad(
      [minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ],
      [0, 0], [sx, 0], [sx, sz], [0, sz]
    );
    // +Z front
    this.addQuad(
      [minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ],
      [0, 0], [sx, 0], [sx, sy], [0, sy]
    );
    // -Z back
    this.addQuad(
      [maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ],
      [0, 0], [sx, 0], [sx, sy], [0, sy]
    );
    // +X right
    this.addQuad(
      [maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ],
      [0, 0], [sz, 0], [sz, sy], [0, sy]
    );
    // -X left
    this.addQuad(
      [minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ],
      [0, 0], [sz, 0], [sz, sy], [0, sy]
    );
  }

  // Add a tapered cylinder / frustum along Y axis
  addFrustumY(cx, cz, y0, y1, r0, r1, segs = 24, capTop = true, capBottom = true) {
    const startIdx = this.positions.length / 3;
    const slope = (r0 - r1) / Math.max(1e-5, y1 - y0);
    const nLen = Math.hypot(1, slope);

    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = ca / nLen, ny = slope / nLen, nz = sa / nLen;
      const u = i / segs;
      this.addVertex(cx + ca * r0, y0, cz + sa * r0, nx, ny, nz, u, 0);
      this.addVertex(cx + ca * r1, y1, cz + sa * r1, nx, ny, nz, u, 1);
    }
    for (let i = 0; i < segs; i++) {
      const a = startIdx + i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      this.indices.push(a, b, d, a, d, c);
    }

    if (capTop && r1 > 1e-5) {
      const center = this.addVertex(cx, y1, cz, 0, 1, 0, 0.5, 0.5);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        this.addVertex(cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1, 0, 1, 0, 0.5, 0.5);
      }
      for (let i = 0; i < segs; i++) {
        this.indices.push(center, center + 1 + i + 1, center + 1 + i);
      }
    }
    if (capBottom && r0 > 1e-5) {
      const center = this.addVertex(cx, y0, cz, 0, -1, 0, 0.5, 0.5);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        this.addVertex(cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0, 0, -1, 0, 0.5, 0.5);
      }
      for (let i = 0; i < segs; i++) {
        this.indices.push(center, center + 1 + i, center + 1 + i + 1);
      }
    }
  }

  // Add an inward-facing hollow cylinder (for pocket interior wells)
  addInnerCylinderY(cx, cz, yBottom, yTop, radius, segs = 28) {
    const startIdx = this.positions.length / 3;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      this.addVertex(cx + ca * radius, yBottom, cz + sa * radius, -ca, 0, -sa, i / segs, 0);
      this.addVertex(cx + ca * radius, yTop, cz + sa * radius, -ca, 0, -sa, i / segs, 1);
    }
    for (let i = 0; i < segs; i++) {
      const a = startIdx + i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      this.indices.push(a, d, b, a, c, d);
    }
    // Dark cup floor
    const floorCenter = this.addVertex(cx, yBottom, cz, 0, 1, 0, 0.5, 0.5);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      this.addVertex(cx + Math.cos(a) * radius, yBottom, cz + Math.sin(a) * radius, 0, 1, 0, 0.5, 0.5);
    }
    for (let i = 0; i < segs; i++) {
      this.indices.push(floorCenter, floorCenter + 1 + i + 1, floorCenter + 1 + i);
    }
  }

  // Add a beveled flat ring (for leather pocket collar lip)
  addRingY(cx, cz, yOuter, yInner, rInner, rOuter, segs = 28, startAngle = 0, endAngle = Math.PI * 2) {
    const startIdx = this.positions.length / 3;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const a = startAngle + (endAngle - startAngle) * t;
      const ca = Math.cos(a), sa = Math.sin(a);
      const slope = (yOuter - yInner) / Math.max(1e-4, rOuter - rInner);
      const nl = Math.hypot(1, slope);
      const nx = -ca * slope / nl, ny = 1 / nl, nz = -sa * slope / nl;
      this.addVertex(cx + ca * rInner, yInner, cz + sa * rInner, nx, ny, nz, t, 0);
      this.addVertex(cx + ca * rOuter, yOuter, cz + sa * rOuter, nx, ny, nz, t, 1);
    }
    for (let i = 0; i < segs; i++) {
      const a = startIdx + i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      this.indices.push(a, d, b, a, c, d);
    }
  }

  // Add a tapered tube along +Z axis (for the cue stick)
  addFrustumZ(z0, z1, r0, r1, segs = 24, capStart = false, capEnd = false) {
    const startIdx = this.positions.length / 3;
    const slope = (r0 - r1) / Math.max(1e-5, z1 - z0);
    const nLen = Math.hypot(1, slope);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = ca / nLen, ny = sa / nLen, nz = slope / nLen;
      const u = i / segs;
      this.addVertex(ca * r0, sa * r0, z0, nx, ny, nz, u, 0);
      this.addVertex(ca * r1, sa * r1, z1, nx, ny, nz, u, 1);
    }
    for (let i = 0; i < segs; i++) {
      const a = startIdx + i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      this.indices.push(a, d, b, a, c, d);
    }
    if (capStart) {
      const cIdx = this.addVertex(0, 0, z0, 0, 0, -1, 0.5, 0.5);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        this.addVertex(Math.cos(a) * r0, Math.sin(a) * r0, z0, 0, 0, -1, 0.5, 0.5);
      }
      for (let i = 0; i < segs; i++) {
        this.indices.push(cIdx, cIdx + 1 + i + 1, cIdx + 1 + i);
      }
    }
    if (capEnd) {
      const cIdx = this.addVertex(0, 0, z1, 0, 0, 1, 0.5, 0.5);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        this.addVertex(Math.cos(a) * r1, Math.sin(a) * r1, z1, 0, 0, 1, 0.5, 0.5);
      }
      for (let i = 0; i < segs; i++) {
        this.indices.push(cIdx, cIdx + 1 + i, cIdx + 1 + i + 1);
      }
    }
  }

  build() {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      indices: this.positions.length / 3 > 65535
        ? new Uint32Array(this.indices)
        : new Uint16Array(this.indices)
    };
  }
}

// High-resolution smooth UV sphere for billiard balls
export function createSphereMesh(radius = BALL.radius, latSegs = 28, lonSegs = 40) {
  const b = new MeshBuilder();
  for (let lat = 0; lat <= latSegs; lat++) {
    const v = lat / latSegs;
    const theta = v * Math.PI;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    for (let lon = 0; lon <= lonSegs; lon++) {
      // u decreases with phi so textures read left-to-right from the outside of the sphere
      const u = 1.0 - lon / lonSegs;
      const phi = (lon / lonSegs) * Math.PI * 2;
      const nx = sinT * Math.cos(phi);
      const ny = cosT;
      const nz = sinT * Math.sin(phi);
      b.addVertex(nx * radius, ny * radius, nz * radius, nx, ny, nz, u, v);
    }
  }
  const stride = lonSegs + 1;
  for (let lat = 0; lat < latSegs; lat++) {
    for (let lon = 0; lon < lonSegs; lon++) {
      const a = lat * stride + lon;
      const c = a + stride;
      b.indices.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  return b.build();
}

// Playing surface felt mesh WITH true geometric circular cutouts at all 6 pockets
function createFeltBedMesh() {
  const b = new MeshBuilder();
  const HL = TABLE.halfL;
  const HW = TABLE.halfW;
  const pad = 0.065; // Extends underneath cushion rails so there are zero gaps
  const xMin = -HL - pad, xMax = HL + pad;
  const zMin = -HW - pad, zMax = HW + pad;

  const cols = 120;
  const rows = 60;
  const grid = [];

  for (let r = 0; r <= rows; r++) {
    const tz = r / rows;
    const zBase = zMin + (zMax - zMin) * tz;
    for (let c = 0; c <= cols; c++) {
      const tx = c / cols;
      const xBase = xMin + (xMax - xMin) * tx;
      let x = xBase;
      let z = zBase;

      // Snap vertices close to any pocket circle cleanly onto the pocket rim
      for (const p of POCKETS) {
        const dx = x - p.x;
        const dz = z - p.z;
        const d = Math.hypot(dx, dz);
        const rimR = p.radius - 0.002;
        if (d > 1e-5 && Math.abs(d - rimR) < 0.011) {
          x = p.x + (dx / d) * rimR;
          z = p.z + (dz / d) * rimR;
          break;
        }
      }

      // Map UV so u = 0..1 corresponds exactly to [-HL, +HL] and v = 0..1 to [-HW, +HW]
      const u = (x + HL) / (HL * 2);
      const v = (z + HW) / (HW * 2);
      grid.push({
        x, z,
        idx: b.addVertex(x, 0, z, 0, 1, 0, u, v)
      });
    }
  }

  const isInsidePocket = (mx, mz) => {
    for (const p of POCKETS) {
      if (Math.hypot(mx - p.x, mz - p.z) < p.radius - 0.003) return true;
    }
    return false;
  };

  const stride = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v00 = grid[r * stride + c];
      const v10 = grid[r * stride + c + 1];
      const v01 = grid[(r + 1) * stride + c];
      const v11 = grid[(r + 1) * stride + c + 1];

      // Triangle 1: v00, v01, v11
      const c1x = (v00.x + v01.x + v11.x) / 3;
      const c1z = (v00.z + v01.z + v11.z) / 3;
      if (!isInsidePocket(c1x, c1z)) {
        b.addTri(v00.idx, v01.idx, v11.idx);
      }

      // Triangle 2: v00, v11, v10
      const c2x = (v00.x + v11.x + v10.x) / 3;
      const c2z = (v00.z + v11.z + v10.z) / 3;
      if (!isInsidePocket(c2x, c2z)) {
        b.addTri(v00.idx, v11.idx, v10.idx);
      }
    }
  }

  return b.build();
}

// Helper to add a beveled cushion rail prism with angled pocket jaw miters at both ends
// p1 -> p2 along the cushion nose; (nx, nz) points INWARD toward table center
function addCushionSegment(b, x1, z1, x2, z2, nx, nz, backDepth, miter1, miter2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const tx = dx / len, tz = dz / len; // Tangent along rail from 1 to 2

  const hTop = TABLE.cushionHeight;
  const hNose = TABLE.cushionHeight * 0.86;
  const bevelIn = 0.011; // Nose bevel offset

  // Back edge lies outward by backDepth along (-nx, -nz), offset along tangent by miter1/miter2
  const bx1 = x1 - nx * backDepth + tx * miter1;
  const bz1 = z1 - nz * backDepth + tz * miter1;
  const bx2 = x2 - nx * backDepth + tx * miter2;
  const bz2 = z2 - nz * backDepth + tz * miter2;

  // Nose top-inner shoulder (slightly set back from nose tip for rounded K66 feel)
  const sx1 = x1 - nx * bevelIn + tx * (miter1 * 0.25);
  const sz1 = z1 - nz * bevelIn + tz * (miter1 * 0.25);
  const sx2 = x2 - nx * bevelIn + tx * (miter2 * 0.25);
  const sz2 = z2 - nz * bevelIn + tz * (miter2 * 0.25);

  // Bottom inner edge touching felt slightly recessed under cushion overhang
  const fx1 = x1 - nx * 0.014 + tx * (miter1 * 0.3);
  const fz1 = z1 - nz * 0.014 + tz * (miter1 * 0.3);
  const fx2 = x2 - nx * 0.014 + tx * (miter2 * 0.3);
  const fz2 = z2 - nz * 0.014 + tz * (miter2 * 0.3);

  // Top flat face
  b.addQuad([sx1, hTop, sz1], [sx2, hTop, sz2], [bx2, hTop, bz2], [bx1, hTop, bz1]);
  // Upper nose chamfer
  b.addQuad([x1, hNose, z1], [x2, hNose, z2], [sx2, hTop, sz2], [sx1, hTop, sz1]);
  // Lower cushion bevel down to felt
  b.addQuad([fx1, 0, fz1], [fx2, 0, fz2], [x2, hNose, z2], [x1, hNose, z1]);

  // Mitered end cap 1 (pocket jaw face)
  b.addQuad([bx1, 0, bz1], [bx1, hTop, bz1], [sx1, hTop, sz1], [fx1, 0, fz1]);
  b.addQuad([fx1, 0, fz1], [sx1, hTop, sz1], [x1, hNose, z1], [fx1, 0, fz1]);

  // Mitered end cap 2 (pocket jaw face)
  b.addQuad([fx2, 0, fz2], [sx2, hTop, sz2], [bx2, hTop, bz2], [bx2, 0, bz2]);
  b.addQuad([x2, hNose, z2], [sx2, hTop, sz2], [fx2, 0, fz2], [x2, hNose, z2]);
}

function createCushionsMesh() {
  const b = new MeshBuilder();
  const HL = TABLE.halfL;
  const HW = TABLE.halfW;
  const cJaw = TABLE.cornerPocketJaw;
  const sJaw = TABLE.sidePocketJaw;
  const depth = TABLE.cushionDepth;

  // Top-left long cushion (normal +Z)
  addCushionSegment(b, -HL + cJaw, -HW, -sJaw, -HW, 0, 1, depth, -0.036, 0.013);
  // Top-right long cushion (normal +Z)
  addCushionSegment(b, sJaw, -HW, HL - cJaw, -HW, 0, 1, depth, -0.013, 0.036);
  // Bottom-right long cushion (normal -Z)
  addCushionSegment(b, HL - cJaw, HW, sJaw, HW, 0, -1, depth, -0.036, 0.013);
  // Bottom-left long cushion (normal -Z)
  addCushionSegment(b, -sJaw, HW, -HL + cJaw, HW, 0, -1, depth, -0.013, 0.036);
  // Right short cushion (normal -X)
  addCushionSegment(b, HL, -HW + cJaw, HL, HW - cJaw, -1, 0, depth, -0.036, 0.036);
  // Left short cushion (normal +X)
  addCushionSegment(b, -HL, HW - cJaw, -HL, -HW + cJaw, 1, 0, depth, -0.036, 0.036);

  return b.build();
}

// Mahogany hardwood rails, hollow cabinet apron (clear of pocket wells), and 4 tapered legs
function createWoodFrameMesh() {
  const b = new MeshBuilder();
  const HL = TABLE.halfL;
  const HW = TABLE.halfW;
  const cDepth = TABLE.cushionDepth;
  const rW = TABLE.railWidth;
  const rH = TABLE.railHeight;
  const rBot = -0.028;
  const cCut = TABLE.cornerPocketJaw + 0.008;
  const sCut = TABLE.sidePocketJaw - 0.008;

  const outX = HL + rW;
  const outZ = HW + rW;

  // 4 long rail wooden beams (aligned cleanly with side & corner brass castings)
  // Top-left & top-right
  b.addBox(-HL + cCut, rBot, -outZ, -sCut, rH, -HW - cDepth + 0.004, 0.85);
  b.addBox(sCut, rBot, -outZ, HL - cCut, rH, -HW - cDepth + 0.004, 0.85);
  // Bottom-left & bottom-right
  b.addBox(-HL + cCut, rBot, HW + cDepth - 0.004, -sCut, rH, outZ, 0.85);
  b.addBox(sCut, rBot, HW + cDepth - 0.004, HL - cCut, rH, outZ, 0.85);

  // 2 short rail wooden beams
  b.addBox(-outX, rBot, -HW + cCut, -HL - cDepth + 0.004, rH, HW - cCut, 0.85);
  b.addBox(HL + cDepth - 0.004, rBot, -HW + cCut, outX, rH, HW - cCut, 0.85);

  // Side-pocket outer wooden backing bridges (flush behind side pocket wells)
  b.addBox(-sCut - 0.015, rBot, -outZ, sCut + 0.015, rH, -HW - 0.079, 0.85);
  b.addBox(-sCut - 0.015, rBot, HW + 0.079, sCut + 0.015, rH, outZ, 0.85);

  // Hollow 4-wall mahogany cabinet apron underneath the table (keeps pocket drop wells completely clear!)
  const apTop = -0.026;
  const apBot = -0.175;
  const apX = outX - 0.022;
  const apZ = outZ - 0.022;
  const wallT = 0.036;
  // North & South apron walls (outside the pocket wells)
  b.addBox(-apX, apBot, -apZ, apX, apTop, -apZ + wallT, 0.85);
  b.addBox(-apX, apBot, apZ - wallT, apX, apTop, apZ, 0.85);
  // West & East apron walls
  b.addBox(-apX, apBot, -apZ + wallT, -apX + wallT, apTop, apZ - wallT, 0.85);
  b.addBox(apX - wallT, apBot, -apZ + wallT, apX, apTop, apZ - wallT, 0.85);
  // Solid bottom under-table cabinet floor well below the pocket cups
  b.addBox(-apX, apBot - 0.018, -apZ, apX, apBot, apZ, 0.85);

  // Decorative lower molding trim along apron bottom
  b.addBox(-apX - 0.008, apBot - 0.022, -apZ - 0.008, apX + 0.008, apBot - 0.004, apZ + 0.008, 0.9);

  // 4 sturdy tapered mahogany legs down to floor
  const legOffX = HL - 0.06;
  const legOffZ = HW - 0.04;
  const legPositions = [
    [-legOffX, -legOffZ],
    [ legOffX, -legOffZ],
    [-legOffX,  legOffZ],
    [ legOffX,  legOffZ]
  ];
  const floorY = TABLE.floorY;
  for (const [lx, lz] of legPositions) {
    // Upper leg capital block
    b.addBox(lx - 0.072, apBot - 0.09, lz - 0.072, lx + 0.072, apBot, lz + 0.072, 1.2);
    // Tapered turned column
    b.addFrustumY(lx, lz, floorY + 0.05, apBot - 0.09, 0.042, 0.064, 16, true, true);
  }

  return b.build();
}

// Brushed antique brass corner & side pocket castings + leg foot ferrules (upward +Y winding!)
function createBrassTrimMesh() {
  const b = new MeshBuilder();
  const HL = TABLE.halfL;
  const HW = TABLE.halfW;
  const rW = TABLE.railWidth;
  const rH = TABLE.railHeight + 0.0025; // Cleanly 2.5mm proud of wood rail
  const rBot = -0.029;
  const outX = HL + rW + 0.002;
  const outZ = HW + rW + 0.002;

  // Curved brass corner castings wrapping neatly around each corner pocket inside rail bounds
  const corners = [
    { sx: -1, sz: -1, p: POCKETS[0] },
    { sx:  1, sz: -1, p: POCKETS[2] },
    { sx: -1, sz:  1, p: POCKETS[3] },
    { sx:  1, sz:  1, p: POCKETS[5] }
  ];

  for (const c of corners) {
    const px = c.p.x;
    const pz = c.p.z;
    const innerR = c.p.radius + 0.001;
    const outerR = rW + 0.048;
    const segs = 22;
    const baseAngle = Math.atan2(c.sz, c.sx);
    const span = Math.PI * 0.66;
    const startA = baseAngle - span;
    const endA = baseAngle + span;

    for (let i = 0; i < segs; i++) {
      const a0 = startA + (endA - startA) * (i / segs);
      const a1 = startA + (endA - startA) * ((i + 1) / segs);

      const ix0 = px + Math.cos(a0) * innerR;
      const iz0 = pz + Math.sin(a0) * innerR;
      const ix1 = px + Math.cos(a1) * innerR;
      const iz1 = pz + Math.sin(a1) * innerR;

      const ox0 = Math.max(-outX, Math.min(outX, px + Math.cos(a0) * outerR));
      const oz0 = Math.max(-outZ, Math.min(outZ, pz + Math.sin(a0) * outerR));
      const ox1 = Math.max(-outX, Math.min(outX, px + Math.cos(a1) * outerR));
      const oz1 = Math.max(-outZ, Math.min(outZ, pz + Math.sin(a1) * outerR));

      // Top face (CCW viewed from +Y -> normal points +Y!)
      b.addQuad([ix0, rH, iz0], [ix1, rH, iz1], [ox1, rH, oz1], [ox0, rH, oz0]);
      // Outer skirt face (normal points outward)
      b.addQuad([ox1, rBot, oz1], [ox0, rBot, oz0], [ox0, rH, oz0], [ox1, rH, oz1]);
      // Inner pocket rim face (normal points inward toward pocket center)
      b.addQuad([ix0, rBot + 0.022, iz0], [ix1, rBot + 0.022, iz1], [ix1, rH, iz1], [ix0, rH, iz0]);
    }
  }

  // Brass side-pocket arches (flush within outer rail edge!)
  const sides = [
    { sz: -1, p: POCKETS[1] },
    { sz:  1, p: POCKETS[4] }
  ];
  for (const s of sides) {
    const px = s.p.x;
    const pz = s.p.z;
    const innerR = s.p.radius + 0.001;
    const outerR = innerR + 0.044;
    const baseAngle = s.sz < 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
    const segs = 18;
    const startA = baseAngle - Math.PI * 0.50;
    const endA = baseAngle + Math.PI * 0.50;

    for (let i = 0; i < segs; i++) {
      const a0 = startA + (endA - startA) * (i / segs);
      const a1 = startA + (endA - startA) * ((i + 1) / segs);
      const ix0 = px + Math.cos(a0) * innerR;
      const iz0 = pz + Math.sin(a0) * innerR;
      const ix1 = px + Math.cos(a1) * innerR;
      const iz1 = pz + Math.sin(a1) * innerR;

      const ox0 = px + Math.cos(a0) * outerR;
      const oz0 = Math.max(-outZ, Math.min(outZ, pz + Math.sin(a0) * outerR));
      const ox1 = px + Math.cos(a1) * outerR;
      const oz1 = Math.max(-outZ, Math.min(outZ, pz + Math.sin(a1) * outerR));

      // Top face (+Y normal!)
      b.addQuad([ix0, rH, iz0], [ix1, rH, iz1], [ox1, rH, oz1], [ox0, rH, oz0]);
      // Outer edge face
      b.addQuad([ox1, rH - 0.012, oz1], [ox0, rH - 0.012, oz0], [ox0, rH, oz0], [ox1, rH, oz1]);
      // Inner pocket rim face
      b.addQuad([ix0, rBot + 0.022, iz0], [ix1, rBot + 0.022, iz1], [ix1, rH, iz1], [ix0, rH, iz0]);
    }
  }

  // Brass leg foot ferrules
  const legOffX = HL - 0.06;
  const legOffZ = HW - 0.04;
  for (const [lx, lz] of [[-legOffX, -legOffZ], [legOffX, -legOffZ], [-legOffX, legOffZ], [legOffX, legOffZ]]) {
    b.addFrustumY(lx, lz, TABLE.floorY, TABLE.floorY + 0.055, 0.046, 0.043, 16, true, true);
  }

  return b.build();
}

// Mother-of-pearl diamond sights inlaid along the wooden rails (18 sights)
function createDiamondSightsMesh() {
  const b = new MeshBuilder();
  const HL = TABLE.halfL;
  const HW = TABLE.halfW;
  const y = TABLE.railHeight + 0.0012;
  const railMidOffset = TABLE.cushionDepth + (TABLE.railWidth - TABLE.cushionDepth) * 0.5;
  const longZ = HW + railMidOffset;
  const shortX = HL + railMidOffset;

  const dLong = 0.011;
  const dShort = 0.0065;

  function addDiamond(cx, cz, alongX) {
    const rx = alongX ? dLong : dShort;
    const rz = alongX ? dShort : dLong;
    const i0 = b.addVertex(cx, y, cz - rz, 0, 1, 0, 0.5, 0);
    const i1 = b.addVertex(cx - rx, y, cz, 0, 1, 0, 0, 0.5);
    const i2 = b.addVertex(cx, y, cz + rz, 0, 1, 0, 0.5, 1);
    const i3 = b.addVertex(cx + rx, y, cz, 0, 1, 0, 1, 0.5);
    b.indices.push(i0, i1, i2, i0, i2, i3);
  }

  // Long rails: 3 sights per half-table (x = ±0.28, ±0.56, ±0.84)
  const xs = [-0.84, -0.56, -0.28, 0.28, 0.56, 0.84];
  for (const x of xs) {
    addDiamond(x, -longZ, true);
    addDiamond(x,  longZ, true);
  }
  // Short rails: 3 sights each (z = -0.28, 0, +0.28)
  const zs = [-0.28, 0, 0.28];
  for (const z of zs) {
    addDiamond(-shortX, z, false);
    addDiamond( shortX, z, false);
  }

  return b.build();
}

// Dark leather pocket liners & deep recessed cylindrical pocket drop wells
function createPocketWellsMesh() {
  const b = new MeshBuilder();
  for (const p of POCKETS) {
    // Deep recessed dark well below the felt plane (full 360 deg below y = 0)
    b.addInnerCylinderY(p.x, p.z, -TABLE.pocketWellDepth - 0.025, 0.001, p.radius, 28);
    // Subtle dark leather bevel collar around the pocket rim
    b.addRingY(p.x, p.z, 0.0012, -0.006, p.radius - 0.003, p.radius + 0.007, 28);

    // Outer backing leather wall rising to rail height ONLY on the outer rail side (not across pocket entrance)
    const baseAngle = p.type === 'corner'
      ? Math.atan2(p.z, p.x)
      : (p.z < 0 ? -Math.PI * 0.5 : Math.PI * 0.5);
    const span = p.type === 'corner' ? Math.PI * 0.65 : Math.PI * 0.52;
    const segs = 16;
    const r = p.radius + 0.002;
    for (let i = 0; i < segs; i++) {
      const a0 = baseAngle - span + (2 * span) * (i / segs);
      const a1 = baseAngle - span + (2 * span) * ((i + 1) / segs);
      const x0 = p.x + Math.cos(a0) * r, z0 = p.z + Math.sin(a0) * r;
      const x1 = p.x + Math.cos(a1) * r, z1 = p.z + Math.sin(a1) * r;
      b.addQuad([x1, 0, z1], [x0, 0, z0], [x0, TABLE.railHeight + 0.001, z0], [x1, TABLE.railHeight + 0.001, z1]);
    }
  }
  return b.build();
}

// Parlor hardwood floor
function createFloorMesh() {
  const b = new MeshBuilder();
  const s = 6.0;
  const y = TABLE.floorY;
  b.addQuad([-s, y, s], [s, y, s], [s, y, -s], [-s, y, -s], [0, 0], [8, 0], [8, 8], [0, 8]);
  return b.build();
}

// Multi-material detailed 3D cue stick (local origin = tip at z = 0, extending toward +Z)
export function createCueStickMeshes() {
  const segs = 20;

  const tip = new MeshBuilder();
  tip.addFrustumZ(0.0, 0.0075, 0.0056, 0.0064, segs, true, false);

  const ferrule = new MeshBuilder();
  ferrule.addFrustumZ(0.0075, 0.027, 0.0064, 0.0066, segs, false, false);

  const shaft = new MeshBuilder();
  shaft.addFrustumZ(0.027, 0.74, 0.0066, 0.0106, segs, false, false);

  const brassJoint = new MeshBuilder();
  brassJoint.addFrustumZ(0.74, 0.758, 0.0106, 0.0109, segs, false, false);
  brassJoint.addFrustumZ(1.345, 1.356, 0.0151, 0.0152, segs, false, false);

  const buttWood = new MeshBuilder();
  buttWood.addFrustumZ(0.758, 1.04, 0.0109, 0.0132, segs, false, false);
  buttWood.addFrustumZ(1.356, 1.455, 0.0152, 0.0158, segs, false, false);

  const wrap = new MeshBuilder();
  wrap.addFrustumZ(1.04, 1.345, 0.0132, 0.0151, segs, false, false);
  wrap.addFrustumZ(1.455, 1.478, 0.0156, 0.0145, segs, false, true);

  return {
    tip: tip.build(),
    ferrule: ferrule.build(),
    shaft: shaft.build(),
    brassJoint: brassJoint.build(),
    buttWood: buttWood.build(),
    wrap: wrap.build()
  };
}

export function createTableMeshes() {
  return {
    feltBed: createFeltBedMesh(),
    cushions: createCushionsMesh(),
    woodFrame: createWoodFrameMesh(),
    brassTrim: createBrassTrimMesh(),
    diamondSights: createDiamondSightsMesh(),
    pocketWells: createPocketWellsMesh(),
    floor: createFloorMesh()
  };
}
