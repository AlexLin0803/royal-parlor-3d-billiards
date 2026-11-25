// Realistic 3D billiards physics engine:
// - Sub-stepped rigid-sphere collisions with restitution & tangential throw
// - Sliding-to-rolling cloth friction transition (exact solid-sphere inertia I = 2/5 mR^2)
// - Authentic follow (topspin), draw (backspin), stun, and english (side-spin)
// - Angled pocket jaws, slate lip roll-in, and 3D pocket drop animation
// - Exact swept circle-circle & circle-segment aim prediction (ghost ball)

import { TABLE, BALL, PHYSICS, POCKETS, CUSHION_SEGMENTS } from './constants.js';
import { Quat, clamp } from './math.js';

export const BALL_STATE = {
  ACTIVE: 'ACTIVE',
  FALLING: 'FALLING',
  POCKETED: 'POCKETED'
};

export function createBall(num, x, z) {
  const type = num === 0 ? 'cue' : num === 8 ? 'eight' : num < 8 ? 'solid' : 'stripe';
  return {
    id: num,
    num,
    type,
    x,
    y: BALL.radius,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    wx: 0,
    wy: 0,
    wz: 0,
    quat: num === 0 ? Quat.identity() : Quat.random(),
    state: BALL_STATE.ACTIVE,
    pocketId: -1,
    sinkTimer: 0
  };
}

// Create standard 8-ball or 9-ball rack
export function createRack(mode = '8ball') {
  const balls = [];
  // Cue ball at head spot
  balls.push(createBall(0, TABLE.headSpotX, 0));

  const R = BALL.radius;
  // Tiny micro-gap (0.15 mm) for deterministic clean rack impulses without initial overlap
  const spacing = BALL.diameter + 0.00025;
  const rowDx = spacing * Math.sqrt(3) * 0.5;
  const apexX = TABLE.footSpotX;

  if (mode === '9ball') {
    // 9-ball diamond rack: 1 at apex, 9 in center
    const layout = [
      [0, 0, 1],
      [1, -0.5, 2], [1, 0.5, 3],
      [2, -1, 4],   [2, 0, 9],   [2, 1, 5],
      [3, -0.5, 6], [3, 0.5, 7],
      [4, 0, 8]
    ];
    for (const [col, row, num] of layout) {
      const bx = apexX + col * rowDx;
      const bz = row * spacing;
      balls.push(createBall(num, bx, bz));
    }
  } else {
    // Official 8-ball triangle rack:
    // - 1-ball (or solid) at apex, 8-ball in exact center (row 2, col 1)
    // - One solid and one stripe in the two back corners
    const rackOrder = [
      [1],
      [9, 2],
      [3, 8, 10],
      [11, 4, 12, 5],
      [6, 13, 7, 14, 15]
    ];
    for (let col = 0; col < rackOrder.length; col++) {
      const rowNums = rackOrder[col];
      const count = rowNums.length;
      for (let i = 0; i < count; i++) {
        const bx = apexX + col * rowDx;
        const bz = (i - (count - 1) * 0.5) * spacing;
        balls.push(createBall(rowNums[i], bx, bz));
      }
    }
  }

  return balls;
}

export class BilliardsPhysics {
  constructor() {
    this.balls = createRack('8ball');
    this.mode = '8ball';
    this.pocketedOrder = [];
  }

  reset(mode = this.mode) {
    this.mode = mode;
    this.balls = createRack(mode);
    this.pocketedOrder = [];
  }

  getCueBall() {
    return this.balls[0];
  }

  areBallsMoving() {
    for (const b of this.balls) {
      if (b.state === BALL_STATE.FALLING) return true;
      if (b.state === BALL_STATE.ACTIVE) {
        const v2 = b.vx * b.vx + b.vz * b.vz;
        const w2 = b.wx * b.wx + b.wy * b.wy + b.wz * b.wz;
        if (v2 > PHYSICS.stopSpeed * PHYSICS.stopSpeed || w2 > PHYSICS.stopSpin * PHYSICS.stopSpin) {
          return true;
        }
      }
    }
    return false;
  }

  // Apply cue strike to the cue ball
  // dirX, dirZ: unit horizontal shot direction
  // power: [0..1]
  // spinX: [-1..1] horizontal english (+1 = right english, -1 = left english)
  // spinY: [-1..1] vertical tip offset (+1 = topspin/follow, -1 = backspin/draw)
  strikeCueBall(dirX, dirZ, power, spinX = 0, spinY = 0) {
    const cue = this.getCueBall();
    if (!cue || cue.state !== BALL_STATE.ACTIVE) return 0;

    const p = clamp(power, 0, 1);
    // Slightly curved power curve so soft touch shots have great precision while 100% is a crisp break
    const speed = PHYSICS.minShotSpeed + (PHYSICS.maxShotSpeed - PHYSICS.minShotSpeed) * Math.pow(p, 1.32);

    cue.vx = dirX * speed;
    cue.vz = dirZ * speed;

    // Right-hand tangent vector perpendicular to shot direction
    // Shot dir = (dirX, 0, dirZ). For forward roll (topspin), ω_roll = (dirZ, 0, -dirX) * (speed / R)
    const R = BALL.radius;
    const baseOmega = speed / R;

    // Vertical tip offset adds topspin (+spinY) or backspin (-spinY) relative to stun (0)
    // Max realistic tip offset gives ~1.45x natural rolling angular speed
    const rollSpin = spinY * baseOmega * 1.45;
    cue.wx = dirZ * rollSpin;
    cue.wz = -dirX * rollSpin;

    // Horizontal english (side spin around Y axis)
    cue.wy = -spinX * baseOmega * 1.15;

    return speed;
  }

  // Check if a candidate (x, z) is a valid cue ball placement (no overlaps, inside rails)
  isValidCuePosition(x, z, behindHeadString = false) {
    const margin = BALL.radius + 0.008;
    const maxX = behindHeadString ? TABLE.headSpotX : TABLE.halfL - margin;
    if (x < -TABLE.halfL + margin || x > maxX) return false;
    if (z < -TABLE.halfW + margin || z > TABLE.halfW - margin) return false;

    // Must not overlap any pocket drop zone
    for (const p of POCKETS) {
      if (Math.hypot(x - p.x, z - p.z) < p.dropRadius + BALL.radius * 0.5) return false;
    }

    // Must not overlap any active ball
    const minDist = BALL.diameter + 0.004;
    for (let i = 1; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (b.state !== BALL_STATE.ACTIVE) continue;
      if (Math.hypot(x - b.x, z - b.z) < minDist) return false;
    }
    return true;
  }

  // Find nearest valid cue ball spot (starting from preferred x, z)
  findSafeCuePosition(prefX = TABLE.headSpotX, prefZ = 0, behindHeadString = false) {
    const margin = BALL.radius + 0.01;
    const maxX = behindHeadString ? TABLE.headSpotX : TABLE.halfL - margin;
    const cx = clamp(prefX, -TABLE.halfL + margin, maxX);
    const cz = clamp(prefZ, -TABLE.halfW + margin, TABLE.halfW - margin);
    if (this.isValidCuePosition(cx, cz, behindHeadString)) return [cx, cz];

    // Spiral outward search
    for (let r = 0.02; r < 0.8; r += 0.02) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
        const tx = clamp(cx + Math.cos(a) * r, -TABLE.halfL + margin, maxX);
        const tz = clamp(cz + Math.sin(a) * r, -TABLE.halfW + margin, TABLE.halfW - margin);
        if (this.isValidCuePosition(tx, tz, behindHeadString)) return [tx, tz];
      }
    }
    return [TABLE.headSpotX, 0];
  }

  respawnCueBall(x = TABLE.headSpotX, z = 0) {
    const cue = this.getCueBall();
    const [sx, sz] = this.findSafeCuePosition(x, z, false);
    cue.x = sx;
    cue.y = BALL.radius;
    cue.z = sz;
    cue.vx = cue.vy = cue.vz = 0;
    cue.wx = cue.wy = cue.wz = 0;
    cue.state = BALL_STATE.ACTIVE;
    cue.pocketId = -1;
    cue.sinkTimer = 0;
  }

  // Main physics advance over frame dt (seconds), returning collision/pocket events
  step(dt) {
    const events = {
      ballHits: [],
      cushionHits: [],
      pocketDrops: [],
      pocketed: []
    };

    const clampedDt = Math.min(dt, 1 / 25);
    const substeps = 10;
    const subDt = clampedDt / substeps;
    const R = BALL.radius;
    const g = PHYSICS.gravity;

    for (let s = 0; s < substeps; s++) {
      // 1. Integrate positions for ACTIVE and FALLING balls
      for (const b of this.balls) {
        if (b.state === BALL_STATE.ACTIVE) {
          b.x += b.vx * subDt;
          b.z += b.vz * subDt;
          b.y = R;
        } else if (b.state === BALL_STATE.FALLING) {
          this._stepFallingBall(b, subDt, events);
        }
      }

      // 2. Check pocket lip tipping & entry for ACTIVE balls
      for (const b of this.balls) {
        if (b.state !== BALL_STATE.ACTIVE) continue;
        for (const p of POCKETS) {
          const dx = p.x - b.x;
          const dz = p.z - b.z;
          const dist = Math.hypot(dx, dz);

          if (dist < p.dropRadius) {
            // Ball center crossed slate pocket lip -> start realistic drop!
            b.state = BALL_STATE.FALLING;
            b.pocketId = p.id;
            b.sinkTimer = 0;
            // Slight downward impulse as ball tips over the curved edge
            b.vy = -0.35;
            // Pull gently toward pocket interior so it clears the slate edge cleanly
            if (dist > 1e-4) {
              b.vx = b.vx * 0.65 + (dx / dist) * 0.45;
              b.vz = b.vz * 0.65 + (dz / dist) * 0.45;
            }
            events.pocketDrops.push({ ball: b, pocket: p });
            break;
          } else if (dist < p.dropRadius + 0.012) {
            // Subtle slate lip gravity slope right on the edge of the pocket
            const slopeFactor = (1 - (dist - p.dropRadius) / 0.012);
            const pull = 3.2 * slopeFactor * subDt;
            b.vx += (dx / dist) * pull;
            b.vz += (dz / dist) * pull;
          }
        }
      }

      // 3. Multi-pass collision resolution (balls + cushions) for crisp break chains
      const activeBalls = [];
      for (const b of this.balls) {
        if (b.state === BALL_STATE.ACTIVE) activeBalls.push(b);
      }

      for (let iter = 0; iter < 3; iter++) {
        // Ball-to-ball collisions
        const count = activeBalls.length;
        for (let i = 0; i < count; i++) {
          const a = activeBalls[i];
          for (let j = i + 1; j < count; j++) {
            const b = activeBalls[j];
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const dist2 = dx * dx + dz * dz;
            const minDist = R * 2;
            if (dist2 < minDist * minDist && dist2 > 1e-12) {
              const dist = Math.sqrt(dist2);
              const nx = dx / dist;
              const nz = dz / dist;
              const overlap = minDist - dist;

              // Symmetrical positional separation
              const corr = overlap * 0.502;
              a.x -= nx * corr;
              a.z -= nz * corr;
              b.x += nx * corr;
              b.z += nz * corr;

              // Relative velocity along line of centers
              const rvx = b.vx - a.vx;
              const rvz = b.vz - a.vz;
              const vn = rvx * nx + rvz * nz;

              if (vn < 0) {
                const jn = -(1 + PHYSICS.ballRestitution) * vn * 0.5;
                a.vx -= jn * nx;
                a.vz -= jn * nz;
                b.vx += jn * nx;
                b.vz += jn * nz;

                // Subtle ball-to-ball tangential friction (collision-induced throw)
                const tx = -nz;
                const tz = nx;
                const vt = (rvx * tx + rvz * tz) - (a.wy + b.wy) * R * 0.15;
                const maxJt = Math.abs(jn) * PHYSICS.ballFriction;
                const jt = clamp(-vt * 0.12, -maxJt, maxJt);
                a.vx -= jt * tx;
                a.vz -= jt * tz;
                b.vx += jt * tx;
                b.vz += jt * tz;

                // Slight spin transfer on glance
                const spinTransfer = jt / R * 0.35;
                a.wy -= spinTransfer;
                b.wy -= spinTransfer;

                if (iter === 0 && -vn > 0.03) {
                  events.ballHits.push({
                    speed: -vn,
                    x: (a.x + b.x) * 0.5,
                    z: (a.z + b.z) * 0.5,
                    a: a.num,
                    b: b.num
                  });
                }
              }
            }
          }
        }

        // Ball-to-cushion & pocket jaw collisions
        for (let i = 0; i < count; i++) {
          const b = activeBalls[i];
          this._resolveCushions(b, iter === 0 ? events : null);
        }
      }

      // 4. Cloth friction, sliding-to-rolling transition, spin decay & quaternion rotation
      for (const b of activeBalls) {
        this._applyClothFriction(b, subDt, R, g);
        Quat.integrate(b.quat, b.wx, b.wy, b.wz, subDt);
      }
    }

    return events;
  }

  _stepFallingBall(b, dt, events) {
    const p = POCKETS[b.pocketId];
    const R = BALL.radius;
    b.sinkTimer += dt;

    // Gravity pulls ball down into the pocket well
    b.vy -= PHYSICS.gravity * 1.15 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;

    // Keep ball inside the dark leather pocket cylinder with soft realistic bounce/rattle
    const dx = b.x - p.x;
    const dz = b.z - p.z;
    const dist = Math.hypot(dx, dz);
    const innerWellR = Math.max(0.012, p.radius - R * 0.55);

    if (dist > innerWellR && dist > 1e-6) {
      const nx = dx / dist;
      const nz = dz / dist;
      b.x = p.x + nx * innerWellR;
      b.z = p.z + nz * innerWellR;
      const vn = b.vx * nx + b.vz * nz;
      if (vn > 0) {
        b.vx -= 1.35 * vn * nx;
        b.vz -= 1.35 * vn * nz;
      }
    }

    // Gentle centering & damping inside the pocket liner
    b.vx *= Math.exp(-3.2 * dt);
    b.vz *= Math.exp(-3.2 * dt);
    b.wx *= Math.exp(-2.0 * dt);
    b.wy *= Math.exp(-2.0 * dt);
    b.wz *= Math.exp(-2.0 * dt);
    Quat.integrate(b.quat, b.wx, b.wy, b.wz, dt);

    if (b.y <= -TABLE.pocketWellDepth) {
      b.y = -TABLE.pocketWellDepth;
      b.vx = b.vy = b.vz = 0;
      b.wx = b.wy = b.wz = 0;
      b.state = BALL_STATE.POCKETED;
      if (b.num !== 0 && !this.pocketedOrder.includes(b.num)) {
        this.pocketedOrder.push(b.num);
      }
      events.pocketed.push({ ball: b, pocket: p });
    }
  }

  _resolveCushions(b, events) {
    const R = BALL.radius;

    for (let i = 0; i < CUSHION_SEGMENTS.length; i++) {
      const seg = CUSHION_SEGMENTS[i];
      const sdx = seg.x2 - seg.x1;
      const sdz = seg.z2 - seg.z1;
      const segLen2 = sdx * sdx + sdz * sdz;

      // Closest point on segment to ball center
      let t = ((b.x - seg.x1) * sdx + (b.z - seg.z1) * sdz) / segLen2;
      t = clamp(t, 0, 1);
      const cx = seg.x1 + sdx * t;
      const cz = seg.z1 + sdz * t;

      const dx = b.x - cx;
      const dz = b.z - cz;
      const dist2 = dx * dx + dz * dz;

      if (dist2 < R * R && dist2 > 1e-12) {
        const dist = Math.sqrt(dist2);
        const nx = dx / dist;
        const nz = dz / dist;

        // Only resolve from the valid side of the cushion (avoid snagging on back face of jaw)
        const sideCheck = nx * seg.nx + nz * seg.nz;
        if (sideCheck < -0.25) continue;

        // Push ball cleanly outside cushion nose
        b.x = cx + nx * (R + 1e-5);
        b.z = cz + nz * (R + 1e-5);

        const vn = b.vx * nx + b.vz * nz;
        if (vn < 0) {
          const e = seg.isJaw ? 0.66 : PHYSICS.cushionRestitution;
          b.vx -= (1 + e) * vn * nx;
          b.vz -= (1 + e) * vn * nz;

          // Tangent along cushion face (right-hand perpendicular to inward normal)
          const tx = -nz;
          const tz = nx;

          // Side-spin (english) throws ball along the cushion!
          const englishVel = b.wy * R * PHYSICS.cushionEnglishFactor;
          b.vx += englishVel * tx;
          b.vz += englishVel * tz;
          b.wy *= 0.62;

          // Slight tangential damping against rubber cloth
          const vt = b.vx * tx + b.vz * tz;
          b.vx -= vt * 0.04 * tx;
          b.vz -= vt * 0.04 * tz;

          if (events && -vn > 0.04) {
            events.cushionHits.push({
              speed: -vn,
              x: cx,
              z: cz,
              isJaw: seg.isJaw
            });
          }
        }
      }
    }
  }

  _applyClothFriction(b, dt, R, g) {
    // Bottom contact point velocity relative to cloth: u = v + w x (0, -R, 0) = (vx + wz*R, 0, vz - wx*R)
    const ux = b.vx + b.wz * R;
    const uz = b.vz - b.wx * R;
    const uMag = Math.hypot(ux, uz);

    const slipThreshold = 0.014;

    if (uMag > slipThreshold) {
      // SLIDING REGIME: kinetic cloth friction decelerates slip velocity u toward 0
      // Notice du/dt = -3.5 * muSlide * g * u_hat
      const maxSlipChange = 3.5 * PHYSICS.muSlide * g * dt;
      const nx = ux / uMag;
      const nz = uz / uMag;

      if (maxSlipChange >= uMag) {
        // Transitions into pure rolling within this substep!
        const dtSlide = uMag / (3.5 * PHYSICS.muSlide * g);
        const ax = -PHYSICS.muSlide * g * nx;
        const az = -PHYSICS.muSlide * g * nz;
        b.vx += ax * dtSlide;
        b.vz += az * dtSlide;
        b.wz = -b.vx / R;
        b.wx = b.vz / R;
      } else {
        const ax = -PHYSICS.muSlide * g * nx;
        const az = -PHYSICS.muSlide * g * nz;
        b.vx += ax * dt;
        b.vz += az * dt;
        // Solid sphere torque: alpha = (5 / (2*R)) * (-az, 0, +ax)
        const alphaScale = 2.5 / R;
        b.wx -= alphaScale * az * dt;
        b.wz += alphaScale * ax * dt;
      }
    } else {
      // PURE ROLLING REGIME: smooth rolling resistance slows ball down naturally
      const speed = Math.hypot(b.vx, b.vz);
      if (speed > PHYSICS.stopSpeed) {
        const decel = PHYSICS.muRoll * g * dt;
        const newSpeed = Math.max(0, speed - decel);
        const scale = newSpeed / speed;
        b.vx *= scale;
        b.vz *= scale;
        b.wz = -b.vx / R;
        b.wx = b.vz / R;
      } else {
        b.vx = 0;
        b.vz = 0;
        b.wx = 0;
        b.wz = 0;
      }
    }

    // Vertical spin (english) pivoting friction decay
    if (Math.abs(b.wy) > PHYSICS.stopSpin) {
      const spinDecel = (5 * PHYSICS.muSpin * g) / (2 * R) * dt;
      if (Math.abs(b.wy) <= spinDecel) {
        b.wy = 0;
      } else {
        b.wy -= Math.sign(b.wy) * spinDecel;
      }
    } else {
      b.wy = 0;
    }
  }
}

// Compute exact swept ghost-ball impact prediction for the aiming guide
export function computeAimPrediction(cueBall, dirX, dirZ, balls) {
  if (!cueBall || cueBall.state !== BALL_STATE.ACTIVE) return null;

  const R = BALL.radius;
  const twoR = R * 2;
  const twoR2 = twoR * twoR;
  const ox = cueBall.x;
  const oz = cueBall.z;

  let bestT = 10.0;
  let hitType = 'none';
  let hitBall = null;
  let hitNormal = null;

  // 1. Check swept sphere-sphere against all active object balls
  for (let i = 1; i < balls.length; i++) {
    const b = balls[i];
    if (b.state !== BALL_STATE.ACTIVE) continue;

    const fx = ox - b.x;
    const fz = oz - b.z;
    const bCoef = fx * dirX + fz * dirZ;
    if (bCoef >= 0) continue; // Ball is behind ray

    const cCoef = fx * fx + fz * fz - twoR2;
    const disc = bCoef * bCoef - cCoef;
    if (disc < 0) continue;

    const t = -bCoef - Math.sqrt(disc);
    if (t >= 0 && t < bestT) {
      bestT = t;
      hitType = 'ball';
      hitBall = b;
    }
  }

  // 2. Check swept circle against cushion segments (offset inward by R)
  for (let i = 0; i < CUSHION_SEGMENTS.length; i++) {
    const seg = CUSHION_SEGMENTS[i];
    // Ray vs infinite offset line: (P - P1) . n = R
    const denom = dirX * seg.nx + dirZ * seg.nz;
    if (denom >= -1e-6) continue; // Moving away from or parallel to cushion

    const distToLine = (ox - seg.x1) * seg.nx + (oz - seg.z1) * seg.nz;
    const t = (R - distToLine) / denom;
    if (t < 0 || t >= bestT) continue;

    // Check if contact point projects onto the segment
    const gx = ox + dirX * t;
    const gz = oz + dirZ * t;
    const px = gx - seg.nx * R;
    const pz = gz - seg.nz * R;
    const sdx = seg.x2 - seg.x1;
    const sdz = seg.z2 - seg.z1;
    const u = ((px - seg.x1) * sdx + (pz - seg.z1) * sdz) / (sdx * sdx + sdz * sdz);
    if (u >= -0.02 && u <= 1.02) {
      bestT = t;
      hitType = 'cushion';
      hitBall = null;
      hitNormal = [seg.nx, seg.nz];
    }
  }

  // 3. Also cap ray if it aims cleanly straight into a pocket opening
  for (const p of POCKETS) {
    const fx = ox - p.x;
    const fz = oz - p.z;
    const bCoef = fx * dirX + fz * dirZ;
    if (bCoef >= 0) continue;
    const r2 = p.dropRadius * p.dropRadius;
    const cCoef = fx * fx + fz * fz - r2;
    const disc = bCoef * bCoef - cCoef;
    if (disc < 0) continue;
    const t = -bCoef - Math.sqrt(disc);
    if (t >= 0 && t < bestT) {
      bestT = t;
      hitType = 'pocket';
      hitBall = null;
      hitNormal = null;
    }
  }

  const ghostX = ox + dirX * bestT;
  const ghostZ = oz + dirZ * bestT;

  const result = {
    startX: ox,
    startZ: oz,
    ghostX,
    ghostZ,
    distance: bestT,
    hitType,
    hitBall,
    objectDir: null,
    cueDeflectDir: null,
    cueDeflectStrength: 0
  };

  if (hitType === 'ball' && hitBall) {
    // Object ball travels along line of centers from ghost ball to target ball
    const odx = hitBall.x - ghostX;
    const odz = hitBall.z - ghostZ;
    const olen = Math.hypot(odx, odz) || 1;
    const nx = odx / olen;
    const nz = odz / olen;
    result.objectDir = [nx, nz];

    // Cue ball tangent deflection (perpendicular to impact normal, keeping forward component)
    const dot = dirX * nx + dirZ * nz;
    const tx = dirX - dot * nx;
    const tz = dirZ - dot * nz;
    const tlen = Math.hypot(tx, tz);
    if (tlen > 0.05) {
      result.cueDeflectDir = [tx / tlen, tz / tlen];
      result.cueDeflectStrength = clamp(tlen, 0, 1);
    }
  } else if (hitType === 'cushion' && hitNormal) {
    const dot = dirX * hitNormal[0] + dirZ * hitNormal[1];
    const rx = dirX - 2 * dot * hitNormal[0];
    const rz = dirZ - 2 * dot * hitNormal[1];
    result.cueDeflectDir = [rx, rz];
    result.cueDeflectStrength = 0.65;
  }

  return result;
}
