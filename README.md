# Royal Parlor 3D Billiards

A realistic, zero-dependency 3D billiards game powered by a custom WebGL2 PBR engine, authentic rigid-body billiards physics, procedural textures, and synthesized Web Audio sound effects.

## Features

- **Regulation 8-Foot 3D Pool Table**: Woven worsted-wool felt (Emerald, Tournament Blue, and Royal Burgundy themes), beveled K66 cushions, lacquered mahogany rails with 18 mother-of-pearl diamond sights, antique brass corner/side castings, recessed dark pocket wells, and tapered legs.
- **Realistic Billiards Physics**:
  - Sub-stepped ball-to-ball collisions with phenolic restitution and subtle tangential throw.
  - True sliding-to-rolling cloth friction transition ($I = \frac{2}{5}mR^2$), natural rolling resistance, and spin decay.
  - Full **Follow (topspin)**, **Draw (backspin)**, **Stun**, and **Left/Right English** via the interactive Cue Spin pad.
  - Angled pocket jaws, slate-lip tipping, and 3D gravity-driven pocket drop animations.
- **Intuitive Controls & Aiming**:
  - Move mouse to aim with a swept ghost-ball impact guide and clamped target trajectory arrow.
  - Click and drag back (or drag directly from the cue ball slingshot-style) to control shot direction and power.
  - Detailed multi-material 3D cue stick with pull-back, accelerating forward strike, follow-through, automatic pitch clearance over obstructing balls, and chalk dust particles.
- **4 Smooth Camera Angles**: `1` 3D Orbit, `2` Low Cue View, `3` Overhead Top-Down, and `4` Cinematic Corner Broadcast.
- **Game Modes**: Classic **8-Ball** (15-ball triangle) and **9-Ball** (diamond rack), pocketed ball tray, Ball-in-Hand placement after scratches, and instant **Reset Table** (`R`).

## Controls

| Action | Control |
| --- | --- |
| Aim | Move Mouse / Touch |
| Shoot (Direction & Power) | Left-Click & Drag Back (release to shoot) |
| Cancel Shot | Drag back to `0%`, Right-Click, or `Esc` |
| Fine Aim | `←` / `→` or `A` / `D` (hold `Shift` for micro-aim) |
| Orbit Camera | Right-Click & Drag |
| Zoom Camera | Mouse Wheel |
| Switch Camera Angle | `1`–`4` or `C` |
| Toggle Aim Guide | `G` |
| Mute / Unmute Audio | `M` |
| Reset & Re-Rack Table | `R` or **Reset Table** button |

## Tech Stack

- **Rendering**: Custom WebGL2 PBR shader pipeline (3-lamp chandelier lighting, GGX clearcoat specular, analytical soft ball shadows & contact AO)
- **Textures & Geometry**: 100% procedural Canvas2D textures & procedural 3D meshes (zero external assets or CDN dependencies)
- **Audio**: Synthesized Web Audio API billiard acoustics (cue strike, phenolic clacks, cushion thumps, pocket drops)
- **Architecture**: Vanilla HTML5, CSS3, and native ES Modules (`src/*.js`)

## Running Locally

Serve the project folder with any static HTTP server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in any modern WebGL2-capable browser.

## Deployment (GitHub Pages)

This repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically deploys the static site to GitHub Pages on every push to `main`.
