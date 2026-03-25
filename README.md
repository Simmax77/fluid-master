# 🌊 Fluid Particles WebGL Simulation

A high-performance, real-time particle-based 3D fluid simulation and rendering engine built using WebGL. Experience the mesmerizing physics of fluids directly in your browser with advanced interaction tools and a custom box editor.

---

## ✨ Features

### 🌪️ Advanced Physics Tools
*   **Vortex:** Create swirling vortices that pull particles inward.
*   **Wind:** Directional wind forces with clickable drag-to-set vector.
*   **Black Hole:** Intense gravitational and orbital forces.
*   **Fountain:** Columnar upward particle propulsion.
*   **Turbulence:** Chaotic, swirling random force fields.
*   **Wave:** Concentric pulse generation.
*   **Magnet:** Gentle particle attraction.
*   **Explode:** Instantaneous force dispersion.

### 🛠️ Interactive Box Editor
*   **Custom Environments:** Draw directly on walls to create new collision boxes.
*   **Dynamic Resizing:** Drag box faces to resize or translate existing geometry.
*   **Precise Control:** Tailor the simulation space to your preference before starting.

### 🎨 Visual & Physics Customization
*   **Real-time Sliders:** Adjust **Density**, **Fluidity**, **Speed**, and **Tool Strength** on the fly.
*   **Dynamic Coloring:** Change the fluid color using a sleek color picker.
*   **Responsive Rendering:** High-fidelity visuals with support for `devicePixelRatio`.

---

## 🎮 Controls

### Simulation Mode
| Action | Control |
| :--- | :--- |
| **Rotate Camera** | Mouse Left Drag |
| **Zoom** | Scroll Wheel |
| **Interact** | Move mouse to push particles |
| **Place Tool** | Left Click |
| **Set Wind Direction** | Click & Drag (when Wind tool selected) |
| **Delete Source** | Select **🚫 None** and click a source |

### Editor Mode
| Action | Control |
| :--- | :--- |
| **Rotate Camera** | `Space` + Mouse Drag |
| **Create Box** | Draw on walls |
| **Resize Face** | Drag box faces |
| **Move Box** | `Shift` + Drag box faces |

---

## 🚀 Getting Started

Since this is a static WebGL project, you don't need any complex installation.

### Prerequisites
*   A modern web browser with WebGL 1.0/2.0 support.
*   The following WebGL extensions are required for optimal performance:
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
*   **Styling:** Vanilla CSS with **Orbitron** and **Inter** Google Fonts.
*   **Simulation Algorithm:** Particle-based fluid dynamics (PBF-inspired).

---

*Enjoy the flow! 🌊*
