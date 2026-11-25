// 3D math utilities: Vec3, Quat, Mat4, and ray intersection helpers

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

export function dampAngle(a, b, lambda, dt) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * (1 - Math.exp(-lambda * dt));
}

export const Vec3 = {
  create(x = 0, y = 0, z = 0) {
    return [x, y, z];
  },
  clone(a) {
    return [a[0], a[1], a[2]];
  },
  set(out, x, y, z) {
    out[0] = x; out[1] = y; out[2] = z;
    return out;
  },
  add(out, a, b) {
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    out[2] = a[2] + b[2];
    return out;
  },
  sub(out, a, b) {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    out[2] = a[2] - b[2];
    return out;
  },
  scale(out, a, s) {
    out[0] = a[0] * s;
    out[1] = a[1] * s;
    out[2] = a[2] * s;
    return out;
  },
  dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  },
  cross(out, a, b) {
    const ax = a[0], ay = a[1], az = a[2];
    const bx = b[0], by = b[1], bz = b[2];
    out[0] = ay * bz - az * by;
    out[1] = az * bx - ax * bz;
    out[2] = ax * by - ay * bx;
    return out;
  },
  len(a) {
    return Math.hypot(a[0], a[1], a[2]);
  },
  normalize(out, a) {
    const l = Math.hypot(a[0], a[1], a[2]);
    if (l > 1e-9) {
      out[0] = a[0] / l;
      out[1] = a[1] / l;
      out[2] = a[2] / l;
    } else {
      out[0] = 0; out[1] = 0; out[2] = 0;
    }
    return out;
  }
};

export const Quat = {
  identity() {
    return [0, 0, 0, 1];
  },
  normalize(q) {
    const l = Math.hypot(q[0], q[1], q[2], q[3]);
    if (l > 1e-9) {
      q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
    } else {
      q[0] = 0; q[1] = 0; q[2] = 0; q[3] = 1;
    }
    return q;
  },
  // Multiply a * b into out
  mul(out, a, b) {
    const ax = a[0], ay = a[1], az = a[2], aw = a[3];
    const bx = b[0], by = b[1], bz = b[2], bw = b[3];
    out[0] = aw * bx + ax * bw + ay * bz - az * by;
    out[1] = aw * by - ax * bz + ay * bw + az * bx;
    out[2] = aw * bz + ax * by - ay * bx + az * bw;
    out[3] = aw * bw - ax * bx - ay * by - az * bz;
    return out;
  },
  // Integrate quaternion by world-space angular velocity w over dt
  integrate(q, wx, wy, wz, dt) {
    const speed = Math.hypot(wx, wy, wz);
    if (speed < 1e-8) return q;
    const halfAngle = 0.5 * speed * dt;
    const s = Math.sin(halfAngle) / speed;
    const dq = [wx * s, wy * s, wz * s, Math.cos(halfAngle)];
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    // q_new = dq * q (world-space rotation)
    q[0] = dq[3] * qx + dq[0] * qw + dq[1] * qz - dq[2] * qy;
    q[1] = dq[3] * qy - dq[0] * qz + dq[1] * qw + dq[2] * qx;
    q[2] = dq[3] * qz + dq[0] * qy - dq[1] * qx + dq[2] * qw;
    q[3] = dq[3] * qw - dq[0] * qx - dq[1] * qy - dq[2] * qz;
    return Quat.normalize(q);
  },
  fromAxisAngle(axis, angle) {
    const half = angle * 0.5;
    const s = Math.sin(half);
    const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    return [axis[0] / l * s, axis[1] / l * s, axis[2] / l * s, Math.cos(half)];
  },
  random() {
    // Uniform random orientation on SO(3)
    const u1 = Math.random();
    const u2 = Math.random() * Math.PI * 2;
    const u3 = Math.random() * Math.PI * 2;
    const s1 = Math.sqrt(1 - u1);
    const s2 = Math.sqrt(u1);
    return [
      s1 * Math.sin(u2),
      s1 * Math.cos(u2),
      s2 * Math.sin(u3),
      s2 * Math.cos(u3)
    ];
  }
};

// Column-major 4x4 matrices (WebGL standard)
export const Mat4 = {
  identity(out = new Float32Array(16)) {
    out.fill(0);
    out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
    return out;
  },
  mul(out, a, b) {
    const r = out === a || out === b ? new Float32Array(16) : out;
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4 + 0];
      const b1 = b[c * 4 + 1];
      const b2 = b[c * 4 + 2];
      const b3 = b[c * 4 + 3];
      r[c * 4 + 0] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      r[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      r[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      r[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    if (r !== out) out.set(r);
    return out;
  },
  perspective(out, fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = 2 * far * near * nf;
    return out;
  },
  lookAt(out, eye, target, up) {
    let zx = eye[0] - target[0];
    let zy = eye[1] - target[1];
    let zz = eye[2] - target[2];
    let zl = Math.hypot(zx, zy, zz);
    if (zl < 1e-8) { zz = 1; zl = 1; }
    zx /= zl; zy /= zl; zz /= zl;

    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    let xl = Math.hypot(xx, xy, xz);
    if (xl < 1e-8) {
      // Fallback up vector when looking straight down
      xx = 0; xy = 0; xz = -1;
      const alt = [0, 0, -1];
      xx = alt[1] * zz - alt[2] * zy;
      xy = alt[2] * zx - alt[0] * zz;
      xz = alt[0] * zy - alt[1] * zx;
      xl = Math.hypot(xx, xy, xz) || 1;
    }
    xx /= xl; xy /= xl; xz /= xl;

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    out[0] = xx; out[4] = xy; out[8] = xz;  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[1] = yx; out[5] = yy; out[9] = yz;  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[2] = zx; out[6] = zy; out[10] = zz; out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[3] = 0;  out[7] = 0;  out[11] = 0;  out[15] = 1;
    return out;
  },
  fromRotationTranslationScale(out, q, t, s) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const sx = s[0], sy = s[1], sz = s[2];

    out[0] = (1 - (yy + zz)) * sx;
    out[1] = (xy + wz) * sx;
    out[2] = (xz - wy) * sx;
    out[3] = 0;

    out[4] = (xy - wz) * sy;
    out[5] = (1 - (xx + zz)) * sy;
    out[6] = (yz + wx) * sy;
    out[7] = 0;

    out[8] = (xz + wy) * sz;
    out[9] = (yz - wx) * sz;
    out[10] = (1 - (xx + yy)) * sz;
    out[11] = 0;

    out[12] = t[0];
    out[13] = t[1];
    out[14] = t[2];
    out[15] = 1;
    return out;
  },
  fromTranslation(out, x, y, z) {
    Mat4.identity(out);
    out[12] = x; out[13] = y; out[14] = z;
    return out;
  },
  fromYawPitchTranslation(out, yaw, pitch, tx, ty, tz) {
    // Rotates local -Z forward by pitch around X, then yaw around Y, then translates
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);

    out[0] = cy;       out[4] = sy * sp; out[8] = sy * cp;  out[12] = tx;
    out[1] = 0;        out[5] = cp;      out[9] = -sp;      out[13] = ty;
    out[2] = -sy;      out[6] = cy * sp; out[10] = cy * cp; out[14] = tz;
    out[3] = 0;        out[7] = 0;       out[11] = 0;       out[15] = 1;
    return out;
  },
  invert(out, m) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (Math.abs(det) < 1e-12) return null;
    det = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  },
  transformPoint(m, x, y, z) {
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    const invW = Math.abs(w) > 1e-9 ? 1 / w : 1;
    return [
      (m[0] * x + m[4] * y + m[8] * z + m[12]) * invW,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) * invW,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) * invW
    ];
  }
};

// Unproject NDC (x, y in [-1, 1]) to a world-space ray intersecting horizontal plane y = planeY
export function raycastHorizontalPlane(ndcX, ndcY, invViewProj, planeY) {
  const nearPt = Mat4.transformPoint(invViewProj, ndcX, ndcY, -1);
  const farPt = Mat4.transformPoint(invViewProj, ndcX, ndcY, 1);
  const dx = farPt[0] - nearPt[0];
  const dy = farPt[1] - nearPt[1];
  const dz = farPt[2] - nearPt[2];
  if (Math.abs(dy) < 1e-6) return null;
  const t = (planeY - nearPt[1]) / dy;
  if (t < 0) return null;
  return [nearPt[0] + dx * t, planeY, nearPt[2] + dz * t];
}

// Project a 3D world point to screen pixels (width, height)
export function projectToScreen(worldPt, viewProj, width, height) {
  const x = worldPt[0], y = worldPt[1], z = worldPt[2];
  const clipX = viewProj[0] * x + viewProj[4] * y + viewProj[8] * z + viewProj[12];
  const clipY = viewProj[1] * x + viewProj[5] * y + viewProj[9] * z + viewProj[13];
  const clipW = viewProj[3] * x + viewProj[7] * y + viewProj[11] * z + viewProj[15];
  if (clipW <= 1e-5) return null;
  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  return [
    (ndcX * 0.5 + 0.5) * width,
    (0.5 - ndcY * 0.5) * height
  ];
}
