// Multi-angle smooth camera controller: 3D Orbit, Low Cue View, Overhead Top-Down, Corner Broadcast

import { Mat4, clamp, damp, dampAngle } from './math.js';
import { TABLE, BALL } from './constants.js';

export const CAMERA_MODES = {
  ORBIT: 'orbit',
  CUE: 'cue',
  TOP: 'top',
  CORNER: 'corner'
};

export class CameraController {
  constructor() {
    this.mode = CAMERA_MODES.ORBIT;

    // Orbit user parameters (front-left 3/4 view: cue ball on left, rack on right)
    this.orbitYaw = Math.PI * 0.62;
    this.orbitPitch = 0.56;         // ~32 deg elevation
    this.orbitDist = 2.48;

    // Live smoothed camera vectors
    this.eye = [-0.85, 1.32, 1.95];
    this.target = [0, 0.02, 0];
    this.up = [0, 1, 0];
    this.fov = 42 * Math.PI / 180;

    // Smoothed cue view angle
    this.cueCamAngle = 0;

    // Subtle impact shake on hard break shots
    this.shakeAmount = 0;
    this.shakeTime = 0;

    // Output matrices
    this.viewMatrix = Mat4.identity();
    this.projMatrix = Mat4.identity();
    this.viewProjMatrix = Mat4.identity();
    this.invViewProjMatrix = Mat4.identity();
  }

  setMode(mode, aimAngle = 0) {
    this.mode = mode;
    if (mode === CAMERA_MODES.CUE) {
      this.cueCamAngle = aimAngle;
    }
  }

  cycleMode(aimAngle = 0) {
    const order = [CAMERA_MODES.ORBIT, CAMERA_MODES.CUE, CAMERA_MODES.TOP, CAMERA_MODES.CORNER];
    const idx = (order.indexOf(this.mode) + 1) % order.length;
    this.setMode(order[idx], aimAngle);
    return this.mode;
  }

  orbitBy(dx, dy) {
    if (this.mode === CAMERA_MODES.TOP) {
      // Automatically switch to orbit if user right-drags in top view
      this.mode = CAMERA_MODES.ORBIT;
    }
    this.orbitYaw -= dx * 0.0055;
    this.orbitPitch = clamp(this.orbitPitch + dy * 0.005, 0.14, 1.42);
  }

  zoomBy(deltaY) {
    const factor = 1 + deltaY * 0.0012;
    this.orbitDist = clamp(this.orbitDist * factor, 1.15, 3.85);
  }

  triggerShake(intensity) {
    this.shakeAmount = Math.max(this.shakeAmount, clamp(intensity, 0, 1));
  }

  update(dt, aspect, cueBall, aimAngle, isAiming, isShooting) {
    let desiredEye;
    let desiredTarget;
    let desiredUp = [0, 1, 0];
    let desiredFov = 42 * Math.PI / 180;

    if (this.mode === CAMERA_MODES.TOP) {
      // Fit full 2.54m x 1.42m outer table cleanly into viewport regardless of aspect ratio
      const tableSpanX = (TABLE.halfL + TABLE.railWidth) * 2.18;
      const tableSpanZ = (TABLE.halfW + TABLE.railWidth) * 2.38;
      desiredFov = 36 * Math.PI / 180;
      const tanHalfFov = Math.tan(desiredFov * 0.5);
      const distForZ = (tableSpanZ * 0.5) / tanHalfFov;
      const distForX = (tableSpanX * 0.5) / (tanHalfFov * Math.max(aspect, 0.5));
      const height = Math.max(distForZ, distForX);

      desiredEye = [0, height, 0.001];
      desiredTarget = [0, 0, 0];
      desiredUp = [0, 0, -1];
    } else if (this.mode === CAMERA_MODES.CUE && cueBall) {
      // Follow smoothly behind the cue ball along the aim line
      this.cueCamAngle = dampAngle(this.cueCamAngle, aimAngle, isShooting ? 2.5 : 8.5, dt);
      const distBack = 0.88;
      const height = 0.34;
      const dirX = Math.cos(this.cueCamAngle);
      const dirZ = Math.sin(this.cueCamAngle);

      desiredEye = [
        cueBall.x - dirX * distBack,
        BALL.radius + height,
        cueBall.z - dirZ * distBack
      ];
      desiredTarget = [
        cueBall.x + dirX * 0.52,
        BALL.radius + 0.02,
        cueBall.z + dirZ * 0.52
      ];
      desiredFov = 46 * Math.PI / 180;
    } else if (this.mode === CAMERA_MODES.CORNER) {
      // Dramatic low corner parlor perspective showcasing rails, pockets & glossy balls
      desiredEye = [-1.72, 0.78, 1.18];
      const focusX = cueBall ? clamp(cueBall.x * 0.22, -0.25, 0.25) : 0;
      const focusZ = cueBall ? clamp(cueBall.z * 0.22, -0.12, 0.12) : 0;
      desiredTarget = [focusX + 0.12, 0.02, focusZ];
      desiredFov = 40 * Math.PI / 180;
    } else {
      // Default 3D Orbit Perspective (auto-scales gracefully on narrower viewports so full table fits)
      const aspectBoost = aspect < 1.35 ? clamp(1.35 / Math.max(aspect, 0.6), 1.0, 1.55) : 1.0;
      const dist = this.orbitDist * aspectBoost;
      const cosP = Math.cos(this.orbitPitch);
      const sinP = Math.sin(this.orbitPitch);
      const x = Math.cos(this.orbitYaw) * cosP * dist;
      const z = Math.sin(this.orbitYaw) * cosP * dist;
      const y = sinP * dist;
      desiredEye = [x, y, z];
      desiredTarget = [0, -0.02, 0];
      desiredFov = 42 * Math.PI / 180;
    }

    const smooth = 7.5;
    this.eye[0] = damp(this.eye[0], desiredEye[0], smooth, dt);
    this.eye[1] = damp(this.eye[1], desiredEye[1], smooth, dt);
    this.eye[2] = damp(this.eye[2], desiredEye[2], smooth, dt);

    this.target[0] = damp(this.target[0], desiredTarget[0], smooth, dt);
    this.target[1] = damp(this.target[1], desiredTarget[1], smooth, dt);
    this.target[2] = damp(this.target[2], desiredTarget[2], smooth, dt);

    this.up[0] = damp(this.up[0], desiredUp[0], smooth, dt);
    this.up[1] = damp(this.up[1], desiredUp[1], smooth, dt);
    this.up[2] = damp(this.up[2], desiredUp[2], smooth, dt);
    const upLen = Math.hypot(this.up[0], this.up[1], this.up[2]) || 1;
    this.up[0] /= upLen; this.up[1] /= upLen; this.up[2] /= upLen;

    this.fov = damp(this.fov, desiredFov, smooth, dt);

    // Apply subtle impact micro-shake
    let sx = 0, sy = 0, sz = 0;
    if (this.shakeAmount > 0.001) {
      this.shakeTime += dt * 55;
      const amp = this.shakeAmount * 0.012;
      sx = Math.sin(this.shakeTime * 1.7) * amp;
      sy = Math.cos(this.shakeTime * 2.3) * amp;
      sz = Math.sin(this.shakeTime * 1.3) * amp;
      this.shakeAmount *= Math.exp(-14 * dt);
    } else {
      this.shakeAmount = 0;
    }

    const finalEye = [this.eye[0] + sx, this.eye[1] + sy, this.eye[2] + sz];
    const finalTarget = [this.target[0] + sx * 0.4, this.target[1] + sy * 0.4, this.target[2] + sz * 0.4];

    Mat4.lookAt(this.viewMatrix, finalEye, finalTarget, this.up);
    Mat4.perspective(this.projMatrix, this.fov, Math.max(aspect, 0.1), 0.05, 30.0);
    Mat4.mul(this.viewProjMatrix, this.projMatrix, this.viewMatrix);
    Mat4.invert(this.invViewProjMatrix, this.viewProjMatrix);
  }
}
