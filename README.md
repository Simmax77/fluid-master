# 🔬 Particle Lab WebGL Simulations

A high-performance, real-time 3D particle simulation and rendering engine built using WebGL. Experience the mesmerizing physics of fluids, volumetric turbulence, and magnetic fields directly in your browser. All simulations feature a unified, modern glassmorphism UI for a premium interactive experience.

---

## ✨ Features & Simulations

### 💧 Fluid Simulation (FLIP Solver)
Interactive 3D fluid dynamics. Draw custom volumes directly on walls to create new collision boxes and use advanced physics tools to manipulate the flow.
*   **Physics Tools:** Vortex, Wind, Black Hole, Fountain, Turbulence, Wave, Magnet, and Explode tools.
*   **Interactive Box Editor:** Draw, resize, and translate bounding boxes for dynamic environments.
*   **Visual Customization:** Real-time sliders for Density, Fluidity, Speed, Tool Strength, and dynamic color picking.

### 🌊 Volumetric Flow
Mesmerizing 3D particle flow driven by curl-noise turbulence.
*   **High Particle Count:** Simulates and renders up to 2 million particles simultaneously.
*   **Volumetric Lighting:** Advanced rendering techniques including GPU sorting and shadow mapping.
*   **Interactive Parameters:** Real-time control over turbulence, velocity, color modes (e.g., Velocity, Density, Solid), and background appearance.

### 🧲 Magnetic Field
A physical iron filing simulation with placeable magnetic dipoles.
*   **Interactive Magnets:** Place and orient Horseshoe magnets that directly attract and align particles.
*   **Iron Filing Physics:** Watch particles form intricate, branching structures as they align along magnetic field lines.
*   **Fine-Tuning:** Use sliders to control the Magnetization force and ambient Friction.

---

## 🎨 Global Aesthetics

The entire platform boasts a unified, premium **Glassmorphism UI**:
*   Frosted glass panels, dynamic blur, and sleek shadows.
*   Modern typography utilizing **Orbitron** and **Inter** from Google Fonts.
*   Customized sliders and toggle buttons for all simulation controls.

---

## 🎮 Controls

### Global / Sandbox Navigation
*   Start at the universal **Particle Lab Dashboard** (`index.html`) to launch any simulation.
*   Use the navigation controls within each simulation to quickly jump between the Fluid, Flow, and Magnetism modules.

### Simulator-Specific Controls
*   **Fluid Lab:** Combine `Space` + Drag for camera rotation in Editor mode. Left click to place force tools or drag wall faces to create/resize boxes.
*   **Flow & Magnetic Labs:** Click and drag the scene to rotate the camera. Scroll to zoom. Select UI buttons to drop magnets or toggle particle properties.

---

## 🚀 Getting Started

Since this is a static WebGL project, you don't need any complex installation.

### Prerequisites
*   A modern web browser with WebGL 2.0 support (or WebGL 1.0 with robust extension support).
*   The following WebGL extensions are leveraged for optimal performance:
    *   `ANGLE_instanced_arrays`
    *   `WEBGL_depth_texture`
    *   `OES_texture_float`
    *   `OES_texture_half_float`

### Local Development
1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/fluid-master.git
    ```
2.  Open `index.html` in your browser.
    *   *Note: Some browsers may require a local server (e.g., `npx serve .` or Live Server extension in VS Code) for certain assets or shader loading due to CORS policies.*

---

## 🛠️ Technology Stack

*   **Logic:** Native JavaScript (ES5/ES6)
*   **Graphics:** WebGL (Custom GL wrapper: `wrappedgl.js`)
*   **Styling:** Vanilla CSS (Glassmorphism design, native variables, Flexbox/Grid)
*   **Simulation Algorithms:** 
    *   Particle-based fluid dynamics (FLIP/PBF-inspired)
    *   Curl-noise volumetric turbulence
    *   Dipole vector field calculations

---
*   Inspired by david.li's fluid simulation
*Enjoy the flow! 🌊*
