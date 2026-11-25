// Main game controller: aiming, drag-to-shoot, cue stick animation, ball-in-hand placement,
// camera angles, HUD updates, and fixed-timestep physics loop

import { TABLE, BALL, BALL_COLORS } from './constants.js';
import { clamp, raycastHorizontalPlane, projectToScreen } from './math.js';
import { BilliardsPhysics, BALL_STATE, computeAimPrediction } from './physics.js';
import { BilliardsRenderer } from './renderer.js';
import { CameraController, CAMERA_MODES } from './camera.js';
import { BilliardsAudio } from './audio.js';

const PHASE = {
  AIMING: 'AIMING',
  STRIKING: 'STRIKING',
  ROLLING: 'ROLLING',
  PLACING_CUE: 'PLACING_CUE'
};

class BilliardsGame {
  constructor() {
    this.canvas = document.getElementById('billiards-canvas');
    this.physics = new BilliardsPhysics();
    this.renderer = new BilliardsRenderer(this.canvas);
    this.camera = new CameraController();
    this.audio = new BilliardsAudio();

    // Gameplay state
    this.phase = PHASE.AIMING;
    this.shotCount = 0;
    this.scratchedThisTurn = false;
    this.sunkThisTurn = [];
    this.showAimGuide = true;

    // Aiming & Drag-to-shoot state
    this.aimAngle = 0; // Radians in XZ plane (0 = +X toward rack)
    this.power = 0;    // [0..1]
    this.spinX = 0;    // [-1..1] horizontal english
    this.spinY = 0;    // [-1..1] vertical follow/draw

    // Pointer drag tracking
    this.isDraggingShot = false;
    this.dragMode = 'pullback'; // 'slingshot' or 'pullback'
    this.dragStartScreen = [0, 0];
    this.dragStartAimAngle = 0;
    this.dragShotDirScreen = [1, 0];
    this.dragPerpScreen = [0, 1];
    this.isOrbitDragging = false;
    this.lastOrbitPos = [0, 0];

    // Cue stick strike animation state
    this.strikeAnim = {
      timer: 0,
      duration: 0.085,
      followDuration: 0.24,
      startPull: 0,
      power: 0,
      impacted: false
    };

    // Ball-in-hand placement preview
    this.placement = {
      active: false,
      x: TABLE.headSpotX,
      z: 0,
      valid: true
    };

    // Keyboard fine-aim state
    this.keysDown = new Set();
    this.toastTimeout = null;

    this._bindDOM();
    this._bindInput();
    this._updateHUD();
    this._resize();

    this.lastTime = performance.now();
    this._loop(this.lastTime);
  }

  _bindDOM() {
    this.elStatus = document.getElementById('status-text');
    this.elShotCount = document.getElementById('shot-count');
    this.elBallsLeft = document.getElementById('balls-left');
    this.elPocketedCount = document.getElementById('pocketed-count');
    this.elPocketedList = document.getElementById('pocketed-list');
    this.elToast = document.getElementById('toast');
    this.elPowerPanel = document.getElementById('power-panel');
    this.elPowerFill = document.getElementById('power-fill');
    this.elPowerPct = document.getElementById('power-pct');
    this.elSpinPad = document.getElementById('spin-pad');
    this.elSpinDot = document.getElementById('spin-dot');
    this.elSpinLabel = document.getElementById('spin-label');
    this.elSoundBtn = document.getElementById('btn-sound');
    this.elSoundIcon = document.getElementById('sound-icon');
    this.elGuideBtn = document.getElementById('btn-guide');

    // Reset button
    document.getElementById('btn-reset').addEventListener('click', () => {
      this.audio.unlock();
      this.resetGame();
    });

    // Game mode toggle (8-Ball / 9-Ball)
    document.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b === btn));
        this.resetGame(mode);
      });
    });

    // Felt cloth theme picker
    document.querySelectorAll('.felt-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        const felt = dot.dataset.felt;
        document.querySelectorAll('.felt-dot').forEach(d => d.classList.toggle('active', d === dot));
        this.renderer.setFeltTheme(felt);
      });
    });

    // Camera angle buttons
    document.querySelectorAll('.cam-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setCameraMode(btn.dataset.cam);
      });
    });

    // Aim guide toggle
    this.elGuideBtn.addEventListener('click', () => {
      this.showAimGuide = !this.showAimGuide;
      this.elGuideBtn.classList.toggle('active', this.showAimGuide);
    });

    // Sound toggle
    this.elSoundBtn.addEventListener('click', () => {
      const muted = !this.audio.muted;
      this.audio.setMuted(muted);
      this.elSoundBtn.classList.toggle('active', !muted);
      this.elSoundIcon.textContent = muted ? '🔇' : '🔊';
    });

    // Interactive Cue Spin / English Pad
    let spinDragging = false;
    const updateSpinFromEvent = (e) => {
      const rect = this.elSpinPad.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const maxR = rect.width * 0.36;
      let dx = (e.clientX - cx) / maxR;
      let dy = -(e.clientY - cy) / maxR; // Up = topspin (+1)
      const mag = Math.hypot(dx, dy);
      if (mag > 1) {
        dx /= mag;
        dy /= mag;
      }
      this.spinX = Math.abs(dx) < 0.08 ? 0 : dx;
      this.spinY = Math.abs(dy) < 0.08 ? 0 : dy;
      this._updateSpinUI();
    };

    this.elSpinPad.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      spinDragging = true;
      this.elSpinPad.setPointerCapture(e.pointerId);
      updateSpinFromEvent(e);
    });
    this.elSpinPad.addEventListener('pointermove', (e) => {
      if (!spinDragging) return;
      updateSpinFromEvent(e);
    });
    this.elSpinPad.addEventListener('pointerup', () => {
      spinDragging = false;
    });
    document.getElementById('btn-reset-spin').addEventListener('click', () => {
      this.spinX = 0;
      this.spinY = 0;
      this._updateSpinUI();
    });
  }

  _updateSpinUI() {
    const px = 50 + this.spinX * 34;
    const py = 50 - this.spinY * 34;
    this.elSpinDot.style.left = `${px}%`;
    this.elSpinDot.style.top = `${py}%`;

    const parts = [];
    if (this.spinY > 0.18) parts.push('Follow');
    else if (this.spinY < -0.18) parts.push('Draw');
    if (this.spinX > 0.18) parts.push('R-Eng');
    else if (this.spinX < -0.18) parts.push('L-Eng');
    this.elSpinLabel.textContent = parts.length ? parts.join(' + ') : 'Center (Stun)';
  }

  _bindInput() {
    window.addEventListener('resize', () => this._resize());
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('pointerdown', (e) => {
      this.audio.unlock();

      // Right-click or Middle-click: cancel shot if charging, otherwise orbit camera
      if (e.button === 2 || e.button === 1) {
        if (this.isDraggingShot) {
          this._cancelShotDrag();
          return;
        }
        this.isOrbitDragging = true;
        this.lastOrbitPos = [e.clientX, e.clientY];
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }

      if (e.button !== 0) return;

      // Ball-in-hand cue placement confirmation
      if (this.phase === PHASE.PLACING_CUE) {
        this._updatePlacementFromPointer(e);
        if (this.placement.valid) {
          this.physics.respawnCueBall(this.placement.x, this.placement.z);
          this.placement.active = false;
          this.phase = PHASE.AIMING;
          this.elStatus.textContent = 'Aim & drag back to shoot';
          this.showToast('Cue ball placed');
        } else {
          this.showToast('Cannot overlap another ball or pocket');
        }
        return;
      }

      if (this.phase !== PHASE.AIMING) return;

      const cue = this.physics.getCueBall();
      if (!cue || cue.state !== BALL_STATE.ACTIVE) return;

      const worldPt = this._screenToTablePlane(e.clientX, e.clientY);
      this.isDraggingShot = true;
      this.power = 0;
      this.dragStartScreen = [e.clientX, e.clientY];
      this.canvas.setPointerCapture(e.pointerId);

      // Decide between Slingshot Drag (clicked close to cue ball) vs Pull-Back Aim Drag
      const distToCue = worldPt ? Math.hypot(worldPt[0] - cue.x, worldPt[2] - cue.z) : 99;
      if (distToCue < BALL.radius * 5.2) {
        this.dragMode = 'slingshot';
        this.dragStartAimAngle = this.aimAngle;
      } else {
        this.dragMode = 'pullback';
        // Lock initial aim direction toward click point (unless in low Cue View where horizon clicks are better kept steady)
        if (worldPt && this.camera.mode !== CAMERA_MODES.CUE) {
          const dx = worldPt[0] - cue.x;
          const dz = worldPt[2] - cue.z;
          if (Math.hypot(dx, dz) > 0.02) {
            this.aimAngle = Math.atan2(dz, dx);
          }
        }
        this.dragStartAimAngle = this.aimAngle;

        // Compute screen-space unit direction of the shot axis so pull-back works smoothly in EVERY camera angle!
        const rect = this.canvas.getBoundingClientRect();
        const cueScr = projectToScreen([cue.x, BALL.radius, cue.z], this.camera.viewProjMatrix, rect.width, rect.height);
        const aheadScr = projectToScreen(
          [cue.x + Math.cos(this.aimAngle) * 0.35, BALL.radius, cue.z + Math.sin(this.aimAngle) * 0.35],
          this.camera.viewProjMatrix,
          rect.width,
          rect.height
        );
        if (cueScr && aheadScr) {
          let sx = aheadScr[0] - cueScr[0];
          let sy = aheadScr[1] - cueScr[1];
          const sl = Math.hypot(sx, sy);
          if (sl > 1) {
            sx /= sl; sy /= sl;
          } else {
            sx = 0; sy = -1;
          }
          this.dragShotDirScreen = [sx, sy];
          this.dragPerpScreen = [-sy, sx];
        } else {
          this.dragShotDirScreen = [0, -1];
          this.dragPerpScreen = [1, 0];
        }
      }

      this._updatePowerUI();
    });

    this.canvas.addEventListener('pointermove', (e) => {
      // Camera right-drag orbit
      if (this.isOrbitDragging) {
        const dx = e.clientX - this.lastOrbitPos[0];
        const dy = e.clientY - this.lastOrbitPos[1];
        this.lastOrbitPos = [e.clientX, e.clientY];
        this.camera.orbitBy(dx, dy);
        this._syncCameraButtons();
        return;
      }

      // Ball-in-hand cue ball positioning
      if (this.phase === PHASE.PLACING_CUE) {
        this._updatePlacementFromPointer(e);
        return;
      }

      if (this.phase !== PHASE.AIMING) return;
      const cue = this.physics.getCueBall();
      if (!cue || cue.state !== BALL_STATE.ACTIVE) return;

      if (this.isDraggingShot) {
        this._handleShotDragMove(e, cue);
      } else {
        // Mouse hover aiming: smoothly point cue stick toward cursor on the table
        const worldPt = this._screenToTablePlane(e.clientX, e.clientY);
        if (worldPt) {
          const dx = worldPt[0] - cue.x;
          const dz = worldPt[2] - cue.z;
          if (Math.hypot(dx, dz) > 0.015) {
            this.aimAngle = Math.atan2(dz, dx);
          }
        }
      }
    });

    const endPointer = (e) => {
      if (this.isOrbitDragging) {
        this.isOrbitDragging = false;
        return;
      }
      if (this.isDraggingShot) {
        this.isDraggingShot = false;
        if (this.power > 0.025) {
          this._beginStrikeAnimation(this.power);
        } else {
          this.power = 0;
          this._updatePowerUI();
        }
      }
    };

    this.canvas.addEventListener('pointerup', endPointer);
    this.canvas.addEventListener('pointercancel', () => {
      this.isOrbitDragging = false;
      this._cancelShotDrag();
    });

    // Mouse wheel zooms camera
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camera.zoomBy(e.deltaY);
    }, { passive: false });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      this.keysDown.add(e.key);
      if (e.key === 'Escape') {
        this._cancelShotDrag();
      } else if (e.key === 'r' || e.key === 'R') {
        this.resetGame();
      } else if (e.key === '1') {
        this.setCameraMode(CAMERA_MODES.ORBIT);
      } else if (e.key === '2') {
        this.setCameraMode(CAMERA_MODES.CUE);
      } else if (e.key === '3') {
        this.setCameraMode(CAMERA_MODES.TOP);
      } else if (e.key === '4') {
        this.setCameraMode(CAMERA_MODES.CORNER);
      } else if (e.key === 'c' || e.key === 'C') {
        const next = this.camera.cycleMode(this.aimAngle);
        this._syncCameraButtons();
        this.showToast(`Camera: ${this._cameraLabel(next)}`);
      } else if (e.key === 'g' || e.key === 'G') {
        this.showAimGuide = !this.showAimGuide;
        this.elGuideBtn.classList.toggle('active', this.showAimGuide);
      } else if (e.key === 'm' || e.key === 'M') {
        this.elSoundBtn.click();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.key);
    });
  }

  _handleShotDragMove(e, cue) {
    if (this.dragMode === 'slingshot') {
      // Drag opposite desired shot direction from cue ball: controls BOTH direction & power continuously
      const worldPt = this._screenToTablePlane(e.clientX, e.clientY);
      if (worldPt) {
        const dx = cue.x - worldPt[0];
        const dz = cue.z - worldPt[2];
        const dist = Math.hypot(dx, dz);
        if (dist > 0.03) {
          this.aimAngle = Math.atan2(dz, dx);
        }
        this.power = clamp((dist - 0.035) / 0.58, 0, 1);
      }
    } else {
      // Pull-Back Aim & Power Drag (works seamlessly from ANY angle including low Cue View)
      const dx = e.clientX - this.dragStartScreen[0];
      const dy = e.clientY - this.dragStartScreen[1];

      // Component opposite the projected forward shot direction controls power
      const forwardDot = dx * this.dragShotDirScreen[0] + dy * this.dragShotDirScreen[1];
      const pullPixels = Math.max(0, -forwardDot);
      const maxPullPx = Math.min(260, window.innerHeight * 0.34);
      this.power = clamp((pullPixels - 6) / maxPullPx, 0, 1);

      // Lateral drag perpendicular to shot axis smoothly fine-tunes aim direction
      const lateralPx = dx * this.dragPerpScreen[0] + dy * this.dragPerpScreen[1];
      // Holding Shift gives ultra-fine pro aiming precision
      const sens = this.keysDown.has('Shift') ? 0.0012 : 0.0036;
      this.aimAngle = this.dragStartAimAngle + lateralPx * sens;
    }

    this._updatePowerUI();
  }

  _cancelShotDrag() {
    if (!this.isDraggingShot) return;
    this.isDraggingShot = false;
    this.power = 0;
    this._updatePowerUI();
  }

  _updatePowerUI() {
    const active = this.isDraggingShot && this.phase === PHASE.AIMING;
    this.elPowerPanel.classList.toggle('active', active);
    const pct = Math.round(this.power * 100);
    this.elPowerFill.style.width = `${pct}%`;
    this.elPowerPct.textContent = `${pct}%`;
  }

  _beginStrikeAnimation(power) {
    this.phase = PHASE.STRIKING;
    this.elPowerPanel.classList.remove('active');
    this.strikeAnim.timer = 0;
    this.strikeAnim.power = power;
    this.strikeAnim.startPull = 0.025 + power * 0.36;
    // Stronger shots accelerate forward snappier!
    this.strikeAnim.duration = 0.115 - power * 0.052;
    this.strikeAnim.followDuration = 0.22;
    this.strikeAnim.impacted = false;
    this.elStatus.textContent = 'Striking...';
  }

  _updatePlacementFromPointer(e) {
    const pt = this._screenToTablePlane(e.clientX, e.clientY);
    if (!pt) return;
    const margin = BALL.radius + 0.009;
    const x = clamp(pt[0], -TABLE.halfL + margin, TABLE.halfL - margin);
    const z = clamp(pt[2], -TABLE.halfW + margin, TABLE.halfW - margin);
    this.placement.x = x;
    this.placement.z = z;
    this.placement.valid = this.physics.isValidCuePosition(x, z, false);
  }

  _screenToTablePlane(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
    return raycastHorizontalPlane(ndcX, ndcY, this.camera.invViewProjMatrix, BALL.radius);
  }

  setCameraMode(mode) {
    this.camera.setMode(mode, this.aimAngle);
    this._syncCameraButtons();
  }

  _syncCameraButtons() {
    document.querySelectorAll('.cam-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cam === this.camera.mode);
    });
  }

  _cameraLabel(mode) {
    const map = {
      orbit: '3D Orbit',
      cue: 'Cue View',
      top: 'Top-Down',
      corner: 'Corner Broadcast'
    };
    return map[mode] || mode;
  }

  resetGame(mode = this.physics.mode) {
    this.physics.reset(mode);
    this.phase = PHASE.AIMING;
    this.shotCount = 0;
    this.power = 0;
    this.isDraggingShot = false;
    this.scratchedThisTurn = false;
    this.sunkThisTurn = [];
    this.placement.active = false;
    this.aimAngle = 0;
    this.spinX = 0;
    this.spinY = 0;
    this._updateSpinUI();
    this._updatePowerUI();
    this._updateHUD();
    this.elStatus.textContent = 'Aim & drag back to shoot';
    this.showToast(mode === '9ball' ? '9-Ball Diamond Racked!' : '8-Ball Triangle Racked!');
  }

  showToast(msg, duration = 2200) {
    this.elToast.textContent = msg;
    this.elToast.classList.add('visible');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.elToast.classList.remove('visible');
    }, duration);
  }

  _updateHUD() {
    const totalObjectBalls = this.physics.mode === '9ball' ? 9 : 15;
    let remaining = 0;
    for (let i = 1; i < this.physics.balls.length; i++) {
      if (this.physics.balls[i].state !== BALL_STATE.POCKETED) remaining++;
    }

    this.elShotCount.textContent = String(this.shotCount);
    this.elBallsLeft.textContent = String(remaining);
    const pocketed = this.physics.pocketedOrder;
    this.elPocketedCount.textContent = `${pocketed.length} / ${totalObjectBalls}`;

    if (pocketed.length === 0) {
      this.elPocketedList.innerHTML = '<span class="tray-empty">No balls sunk yet</span>';
    } else {
      this.elPocketedList.innerHTML = pocketed.map(num => {
        const info = BALL_COLORS[num];
        const cls = info.stripe ? 'mini-ball stripe' : 'mini-ball';
        return `<div class="${cls}" style="background:${info.color};--ball-col:${info.color}" title="Ball ${num}"><span>${num}</span></div>`;
      }).join('');
    }
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(window.innerWidth, window.innerHeight, dpr);
  }

  _update(dt) {
    // Keyboard micro-aiming with ArrowLeft / ArrowRight
    if (this.phase === PHASE.AIMING && !this.isDraggingShot) {
      const fine = this.keysDown.has('Shift') ? 0.22 : 0.75;
      if (this.keysDown.has('ArrowLeft') || this.keysDown.has('a') || this.keysDown.has('A')) {
        this.aimAngle -= fine * dt;
      }
      if (this.keysDown.has('ArrowRight') || this.keysDown.has('d') || this.keysDown.has('D')) {
        this.aimAngle += fine * dt;
      }
    }

    // Strike animation -> impact -> rolling transition
    if (this.phase === PHASE.STRIKING) {
      this.strikeAnim.timer += dt;
      if (!this.strikeAnim.impacted && this.strikeAnim.timer >= this.strikeAnim.duration) {
        this.strikeAnim.impacted = true;
        const cue = this.physics.getCueBall();
        const dirX = Math.cos(this.aimAngle);
        const dirZ = Math.sin(this.aimAngle);
        const p = this.strikeAnim.power;

        this.physics.strikeCueBall(dirX, dirZ, p, this.spinX, this.spinY);
        this.audio.playCueStrike(p);
        this.renderer.spawnChalkBurst(cue.x, cue.y, cue.z, dirX, dirZ, p);
        if (p > 0.55) {
          this.camera.triggerShake((p - 0.5) * 1.4);
        }

        this.shotCount++;
        this.scratchedThisTurn = false;
        this.sunkThisTurn = [];
        this.power = 0;
        this._updateHUD();
        this.elStatus.textContent = 'Balls in motion...';
      }

      if (this.strikeAnim.timer >= this.strikeAnim.duration + this.strikeAnim.followDuration) {
        this.phase = PHASE.ROLLING;
      }
    }

    // Advance billiards physics whenever striking (after impact) or rolling
    if (this.phase === PHASE.ROLLING || (this.phase === PHASE.STRIKING && this.strikeAnim.impacted)) {
      const events = this.physics.step(dt);

      // Audio feedback for collisions & pockets
      for (const hit of events.ballHits) {
        this.audio.playBallHit(hit.speed);
      }
      for (const cHit of events.cushionHits) {
        this.audio.playCushionHit(cHit.speed);
      }
      for (const drop of events.pocketDrops) {
        this.audio.playPocketDrop();
        if (drop.ball.num === 0) {
          this.scratchedThisTurn = true;
        } else {
          this.sunkThisTurn.push(drop.ball.num);
        }
      }
      if (events.pocketed.length > 0) {
        this._updateHUD();
        for (const ev of events.pocketed) {
          if (ev.ball.num !== 0) {
            this.showToast(`Ball #${ev.ball.num} pocketed!`);
          }
        }
      }

      // Check if all balls have smoothly come to rest
      if (this.phase === PHASE.ROLLING && !this.physics.areBallsMoving()) {
        this._onTurnComplete();
      }
    }

    this.renderer.updateParticles(dt);

    // Update smooth camera
    const cue = this.physics.getCueBall();
    const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    const cueFocus = this.phase === PHASE.PLACING_CUE
      ? { x: this.placement.x, y: BALL.radius, z: this.placement.z }
      : cue;
    this.camera.update(
      dt,
      aspect,
      cueFocus,
      this.aimAngle,
      this.phase === PHASE.AIMING,
      this.phase === PHASE.STRIKING || this.phase === PHASE.ROLLING
    );
  }

  _onTurnComplete() {
    // Check if all object balls have been cleared
    let remaining = 0;
    for (let i = 1; i < this.physics.balls.length; i++) {
      if (this.physics.balls[i].state !== BALL_STATE.POCKETED) remaining++;
    }

    if (remaining === 0) {
      this.showToast(`Table cleared in ${this.shotCount} shots! Click Reset to play again.`, 4500);
      this.elStatus.textContent = `Table cleared in ${this.shotCount} shots!`;
      if (this.scratchedThisTurn) {
        this.physics.respawnCueBall();
      }
      this.phase = PHASE.AIMING;
      return;
    }

    // Scratch -> enter interactive Ball-in-Hand placement
    if (this.scratchedThisTurn || this.physics.getCueBall().state !== BALL_STATE.ACTIVE) {
      const [sx, sz] = this.physics.findSafeCuePosition(TABLE.headSpotX, 0, false);
      this.placement.active = true;
      this.placement.x = sx;
      this.placement.z = sz;
      this.placement.valid = true;
      this.phase = PHASE.PLACING_CUE;
      this.elStatus.textContent = 'Scratch — Click table to place cue ball';
      this.showToast('Scratch! Click anywhere on the felt to place cue ball', 3200);
      return;
    }

    this.phase = PHASE.AIMING;
    this.elStatus.textContent = 'Aim & drag back to shoot';
  }

  // Compute minimum cue elevation pitch so shaft bridges cleanly over any obstructing ball behind the cue ball
  _computeCueClearancePitch(cue, dirX, dirZ, pullBack) {
    let minPitch = 0.058 + this.power * 0.014;
    const R = BALL.radius;
    for (let i = 1; i < this.physics.balls.length; i++) {
      const b = this.physics.balls[i];
      if (b.state !== BALL_STATE.ACTIVE) continue;
      // Vector from cue ball backward along cue shaft (-dirX, -dirZ)
      const dx = b.x - cue.x;
      const dz = b.z - cue.z;
      const alongBack = -(dx * dirX + dz * dirZ);
      if (alongBack < R * 0.5 || alongBack > 1.35) continue;
      const perp = Math.abs(dx * (-dirZ) + dz * dirX);
      if (perp < R + 0.018) {
        // Need cue shaft height at distance `alongBack` to clear top of obstructing ball (2*R + shaft radius)
        const distFromTip = Math.max(0.03, alongBack - (R + pullBack));
        const neededHeight = R + 0.016;
        const reqPitch = Math.atan2(neededHeight, Math.max(0.08, alongBack));
        if (reqPitch > minPitch) minPitch = reqPitch;
      }
    }
    return clamp(minPitch, 0.058, 0.42);
  }

  _computeCueStickVisual() {
    const cue = this.physics.getCueBall();
    if (!cue || cue.state !== BALL_STATE.ACTIVE) return null;

    if (this.phase === PHASE.AIMING) {
      const pullBack = 0.024 + this.power * 0.36;
      const dirX = Math.cos(this.aimAngle);
      const dirZ = Math.sin(this.aimAngle);
      const pitch = this._computeCueClearancePitch(cue, dirX, dirZ, pullBack);
      // Apply small visual tip offset matching selected spin!
      const perpX = -dirZ;
      const perpZ = dirX;
      const offSide = this.spinX * BALL.radius * 0.42;
      const offUp = this.spinY * BALL.radius * 0.42;

      const tipDist = BALL.radius + pullBack;
      return {
        visible: true,
        tipX: cue.x - dirX * tipDist + perpX * offSide,
        tipY: BALL.radius + offUp + pullBack * Math.sin(pitch),
        tipZ: cue.z - dirZ * tipDist + perpZ * offSide,
        aimAngle: this.aimAngle,
        pitch
      };
    }

    if (this.phase === PHASE.STRIKING) {
      const a = this.strikeAnim;
      const dirX = Math.cos(this.aimAngle);
      const dirZ = Math.sin(this.aimAngle);
      const pitch = this._computeCueClearancePitch(cue, dirX, dirZ, 0.04);

      let tipOffset;
      if (a.timer < a.duration) {
        // Fast accelerating forward stroke into the cue ball
        const t = clamp(a.timer / a.duration, 0, 1);
        const eased = t * t * t;
        tipOffset = a.startPull * (1 - eased);
      } else {
        // Satisfying brief follow-through past initial cue ball position, then smooth retract
        const ft = clamp((a.timer - a.duration) / a.followDuration, 0, 1);
        const followDepth = 0.04 + a.power * 0.085;
        if (ft < 0.35) {
          tipOffset = -followDepth * (ft / 0.35);
        } else {
          const retract = (ft - 0.35) / 0.65;
          tipOffset = -followDepth * (1 - retract) + 0.14 * retract;
        }
      }

      // Anchor around the strike point (note cue ball starts moving after impact)
      const anchorX = cue.x - cue.vx * Math.max(0, a.timer - a.duration) * 0.95;
      const anchorZ = cue.z - cue.vz * Math.max(0, a.timer - a.duration) * 0.95;
      const dist = BALL.radius + tipOffset;
      return {
        visible: true,
        tipX: anchorX - dirX * dist,
        tipY: BALL.radius + Math.max(0, tipOffset) * Math.sin(pitch),
        tipZ: anchorZ - dirZ * dist,
        aimAngle: this.aimAngle,
        pitch
      };
    }

    return null;
  }

  _render() {
    const cue = this.physics.getCueBall();
    let aimPred = null;
    if (this.phase === PHASE.AIMING && cue && cue.state === BALL_STATE.ACTIVE) {
      aimPred = computeAimPrediction(
        cue,
        Math.cos(this.aimAngle),
        Math.sin(this.aimAngle),
        this.physics.balls
      );
    }

    const cueVisual = this._computeCueStickVisual();

    // During Ball-in-Hand placement, temporarily show ghost cue ball at cursor position
    let renderBalls = this.physics.balls;
    if (this.phase === PHASE.PLACING_CUE) {
      const previewCue = {
        ...cue,
        x: this.placement.x,
        y: BALL.radius,
        z: this.placement.z,
        state: BALL_STATE.ACTIVE
      };
      renderBalls = [previewCue, ...this.physics.balls.slice(1)];
    }

    this.renderer.render(
      this.camera,
      renderBalls,
      cueVisual,
      aimPred,
      this.placement,
      this.showAimGuide
    );
  }

  _loop(now) {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    this._update(dt);
    this._render();

    requestAnimationFrame((t) => this._loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    window.__billiardsGame = new BilliardsGame();
  } catch (err) {
    console.error(err);
    document.body.innerHTML = `<div style="color:#f4efe6;padding:32px;font-family:sans-serif">
      <h2>Unable to initialize 3D Billiards</h2>
      <p style="margin-top:8px;opacity:0.8">${err.message}</p>
    </div>`;
  }
});
