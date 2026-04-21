'use strict'

var FluidParticles = (function () {
    var FOV = Math.PI / 3;

    var State = {
        EDITING: 0,
        SIMULATING: 1
    };

    var GRID_WIDTH = 40,
        GRID_HEIGHT = 20,
        GRID_DEPTH = 20;

    var PARTICLES_PER_CELL = 10;

    // Tool type names for overlays
    var TOOL_NAMES = ['None', 'Vortex', 'Wind', 'Repel', 'Black Hole', 'Fountain', 'Turbulence', 'Wave', 'Magnet'];
    var TOOL_EMOJIS = ['', '🌀', '💨', '🔵', '🕳️', '⛲', '🌊', '〰️', '🧲'];
    var TOOL_COLORS = [
        'rgba(255,255,255,0.5)',    // none
        'rgba(147,112,219,0.9)',    // vortex - purple
        'rgba(100,200,255,0.9)',    // wind - light blue
        'rgba(50,150,255,0.9)',     // repel - blue
        'rgba(180,50,255,0.9)',     // black hole - dark purple
        'rgba(80,220,200,0.9)',     // fountain - teal
        'rgba(255,165,50,0.9)',     // turbulence - orange
        'rgba(50,200,100,0.9)',     // wave - green
        'rgba(255,80,80,0.9)'      // magnet - red
    ];

    function FluidParticles () {

        var canvas = this.canvas = document.getElementById('canvas');
        var wgl = this.wgl = new WrappedGL(canvas);

        window.wgl = wgl;

        this.projectionMatrix = Utilities.makePerspectiveMatrix(new Float32Array(16), FOV, this.canvas.width / this.canvas.height, 0.1, 100.0);
        this.camera = new Camera(this.canvas, [GRID_WIDTH / 2, GRID_HEIGHT / 3, GRID_DEPTH / 2]);

        var boxEditorLoaded = false,
            simulatorRendererLoaded = false;

        this.boxEditor = new BoxEditor.BoxEditor(this.canvas, this.wgl, this.projectionMatrix, this.camera, [GRID_WIDTH, GRID_HEIGHT, GRID_DEPTH], (function () {
            boxEditorLoaded = true;
            if (boxEditorLoaded && simulatorRendererLoaded) {
                start.call(this);
            }
        }).bind(this),
        (function () {
            this.redrawUI(); 
        }).bind(this));

        this.simulatorRenderer = new SimulatorRenderer(this.canvas, this.wgl, this.projectionMatrix, this.camera, [GRID_WIDTH, GRID_HEIGHT, GRID_DEPTH], (function () {
            simulatorRendererLoaded = true;
            if (boxEditorLoaded && simulatorRendererLoaded) {
                start.call(this);
            }
        }).bind(this));

        function start(programs) {
            this.state = State.EDITING;

            // Setup overlay canvas
            this.overlayCanvas = document.getElementById('overlay-canvas');
            this.overlayCtx = this.overlayCanvas ? this.overlayCanvas.getContext('2d') : null;

            this.startButton = document.getElementById('start-button');

            this.startButton.addEventListener('click', (function () {
                if (this.state === State.EDITING) {
                    if (this.boxEditor.boxes.length > 0) {
                        this.startSimulation();
                    }
                    this.redrawUI();
                } else if (this.state === State.SIMULATING) {
                    this.stopSimulation();
                    this.redrawUI();
                }
            }).bind(this));

            this.currentPresetIndex = 0;
            this.editedSinceLastPreset = false;
            var PRESETS = [
                [
                    new BoxEditor.AABB([0, 0, 0], [15, 20, 20]) 
                ],
                [
                    new BoxEditor.AABB([0, 0, 0], [40, 7, 20]),
                    new BoxEditor.AABB([12, 12, 5], [28, 20, 15]) 
                ],
                [
                    new BoxEditor.AABB([0, 0, 0], [10, 20, 15]),
                    new BoxEditor.AABB([30, 0, 5], [40, 20, 20]) 
                ],
            ];
            
            this.presetButton = document.getElementById('preset-button');
            this.presetButton.addEventListener('click', (function () {
                this.editedSinceLastPreset = false;
                this.boxEditor.boxes.length = 0;
                var preset = PRESETS[this.currentPresetIndex];
                for (var i = 0; i < preset.length; ++i) {
                    this.boxEditor.boxes.push(preset[i].clone());
                }
                this.currentPresetIndex = (this.currentPresetIndex + 1) % PRESETS.length; 
                this.redrawUI();
            }).bind(this));


            ////////////////////////////////////////////////////////
            // parameters/sliders

            this.gridCellDensity = 1.0;
            this.timeStep = 1.0 / 60.0;

            this.densitySlider = new Slider(document.getElementById('density-slider'), this.gridCellDensity, 0.2, 3.0, (function (value) {
                this.gridCellDensity = value; 
                this.redrawUI();
            }).bind(this));

            this.flipnessSlider = new Slider(document.getElementById('fluidity-slider'), this.simulatorRenderer.simulator.flipness, 0.5, 0.99, (function (value) {
                this.simulatorRenderer.simulator.flipness = value;
            }).bind(this));

            this.speedSlider = new Slider(document.getElementById('speed-slider'), this.timeStep, 0.0, 1.0 / 60.0, (function (value) {
                this.timeStep = value;
            }).bind(this));

            this.explodeStrength = 1500.0;
            this.explodeSlider = new Slider(document.getElementById('explode-slider'), this.explodeStrength, 10.0, 30000.0, (function (value) {
                this.explodeStrength = value;
                this.simulatorRenderer.simulator.explodeStrength = value;
            }).bind(this));

            // Source strength slider
            this.sourceStrength = 1.0;
            this.strengthSlider = new Slider(document.getElementById('strength-slider'), this.sourceStrength, 0.1, 3.0, (function (value) {
                this.sourceStrength = value;
            }).bind(this));


            this.redrawUI();

            this.presetButton.click();

            this.colorPicker = document.getElementById('color-picker');
            this.explodeButton = document.getElementById('explode-button');
            this.gravityButton = document.getElementById('gravity-button');

            this.colorPicker.addEventListener('input', (function (e) {
                var hex = e.target.value;
                var r = parseInt(hex.substring(1, 3), 16) / 255.0;
                var g = parseInt(hex.substring(3, 5), 16) / 255.0;
                var b = parseInt(hex.substring(5, 7), 16) / 255.0;
                this.simulatorRenderer.particleColor = [r, g, b];
            }).bind(this));

            this.explodeButton.addEventListener('click', (function () {
                this.simulatorRenderer.simulator.explode = true;
            }).bind(this));
            
            this.toolButtons = {
                none: document.getElementById('tool-none-button'),
                vortex: document.getElementById('tool-vortex-button'),
                wind: document.getElementById('tool-wind-button'),
                repel: document.getElementById('tool-repel-button'),
                blackhole: document.getElementById('tool-blackhole-button'),
                fountain: document.getElementById('tool-fountain-button'),
                turbulence: document.getElementById('tool-turbulence-button'),
                wave: document.getElementById('tool-wave-button'),
                magnet: document.getElementById('tool-magnet-button')
            };
            this.clearSourcesButton = document.getElementById('clear-sources-button');
            this.sourceCountBadge = document.getElementById('source-count-badge');

            this.gravityMode = 0;
            this.activeTool = 0;
            this.toolTypes = { none: 0, vortex: 1, wind: 2, repel: 3, blackhole: 4, fountain: 5, turbulence: 6, wave: 7, magnet: 8 };
            
            // Wind drag state
            this.windDragStart = null;       // {screenX, screenY, worldPos}
            this.windDragCurrent = null;     // {screenX, screenY}
            this.isDraggingWind = false;

            var setTool = (function(toolName) {
                this.activeTool = this.toolTypes[toolName];
                for (var key in this.toolButtons) {
                    this.toolButtons[key].classList.remove('active-tool');
                }
                if (this.toolButtons[toolName]) {
                    this.toolButtons[toolName].classList.add('active-tool');
                }
            }).bind(this);
            
            this.toolButtons.none.addEventListener('click', function() { setTool('none'); });
            this.toolButtons.vortex.addEventListener('click', function() { setTool('vortex'); });
            this.toolButtons.wind.addEventListener('click', function() { setTool('wind'); });
            this.toolButtons.repel.addEventListener('click', function() { setTool('repel'); });
            this.toolButtons.blackhole.addEventListener('click', function() { setTool('blackhole'); });
            this.toolButtons.fountain.addEventListener('click', function() { setTool('fountain'); });
            this.toolButtons.turbulence.addEventListener('click', function() { setTool('turbulence'); });
            this.toolButtons.wave.addEventListener('click', function() { setTool('wave'); });
            this.toolButtons.magnet.addEventListener('click', function() { setTool('magnet'); });
            
            this.clearSourcesButton.addEventListener('click', (function() {
                this.simulatorRenderer.simulator.sources = [];
                this.updateSourceBadge();
            }).bind(this));

            this.gravityButton.addEventListener('click', (function () {
                this.gravityMode = (this.gravityMode + 1) % 3;
                var gravityValue = -40.0;
                if (this.gravityMode === 0) {
                    this.gravityButton.textContent = "Gravity: Normal";
                    gravityValue = -40.0;
                } else if (this.gravityMode === 1) {
                    this.gravityButton.textContent = "Gravity: Zero";
                    gravityValue = 0.0;
                } else if (this.gravityMode === 2) {
                    this.gravityButton.textContent = "Gravity: Reverse";
                    gravityValue = 40.0;
                }
                this.simulatorRenderer.simulator.gravityY = gravityValue;
            }).bind(this));

            ///////////////////////////////////////////////////////
            // interaction state stuff

            canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
            canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
            document.addEventListener('mouseup', this.onMouseUp.bind(this));

            canvas.addEventListener('touchmove', this.onMouseMove.bind(this), {passive: false});
            canvas.addEventListener('touchstart', this.onMouseDown.bind(this), {passive: false});
            document.addEventListener('touchend', this.onMouseUp.bind(this));

            document.addEventListener('keydown', this.onKeyDown.bind(this));
            document.addEventListener('keyup', this.onKeyUp.bind(this));

            window.addEventListener('resize', this.onResize.bind(this));
            this.onResize();


            ////////////////////////////////////////////////////
            // start the update loop

            var lastTime = 0;
            var update = (function (currentTime) {
                var deltaTime = currentTime - lastTime || 0;
                lastTime = currentTime;

                this.update(deltaTime);

                requestAnimationFrame(update);
            }).bind(this);
            update();

        }
    }

    // Project a 3D world position to 2D screen coordinates
    FluidParticles.prototype.projectToScreen = function(worldPos) {
        var viewMatrix = this.camera.getViewMatrix();
        var projMatrix = this.projectionMatrix;
        
        // View transform
        var vx = viewMatrix[0]*worldPos[0] + viewMatrix[4]*worldPos[1] + viewMatrix[8]*worldPos[2] + viewMatrix[12];
        var vy = viewMatrix[1]*worldPos[0] + viewMatrix[5]*worldPos[1] + viewMatrix[9]*worldPos[2] + viewMatrix[13];
        var vz = viewMatrix[2]*worldPos[0] + viewMatrix[6]*worldPos[1] + viewMatrix[10]*worldPos[2] + viewMatrix[14];
        var vw = viewMatrix[3]*worldPos[0] + viewMatrix[7]*worldPos[1] + viewMatrix[11]*worldPos[2] + viewMatrix[15];
        
        // Projection transform
        var px = projMatrix[0]*vx + projMatrix[4]*vy + projMatrix[8]*vz + projMatrix[12]*vw;
        var py = projMatrix[1]*vx + projMatrix[5]*vy + projMatrix[9]*vz + projMatrix[13]*vw;
        var pw = projMatrix[3]*vx + projMatrix[7]*vy + projMatrix[11]*vz + projMatrix[15]*vw;
        
        if (Math.abs(pw) < 0.001) return null;
        
        // NDC
        var ndcX = px / pw;
        var ndcY = py / pw;
        
        // Screen coords
        var screenX = (ndcX * 0.5 + 0.5) * this.canvas.clientWidth;
        var screenY = (1.0 - (ndcY * 0.5 + 0.5)) * this.canvas.clientHeight;
        
        return { x: screenX, y: screenY, depth: vz };
    };

    // Cast a ray from screen coordinates and find hit on Y plane
    FluidParticles.prototype.screenToWorld = function(screenX, screenY) {
        var normalizedX = screenX / this.canvas.clientWidth;
        var normalizedY = screenY / this.canvas.clientHeight;

        var mouseX = normalizedX * 2.0 - 1.0;
        var mouseY = (1.0 - normalizedY) * 2.0 - 1.0;
        
        var fov = 2.0 * Math.atan(1.0 / this.projectionMatrix[5]);
        var viewSpaceMouseRay = [
            mouseX * Math.tan(fov / 2.0) * (this.canvas.width / this.canvas.height),
            mouseY * Math.tan(fov / 2.0),
            -1.0
        ];
        
        var inverseViewMatrix = Utilities.invertMatrix([], this.camera.getViewMatrix());
        var worldSpaceMouseRay = Utilities.transformDirectionByMatrix([], viewSpaceMouseRay, inverseViewMatrix);
        Utilities.normalizeVector(worldSpaceMouseRay, worldSpaceMouseRay);
        
        var cameraPosition = this.camera.getPosition();
        
        var planeY = GRID_HEIGHT / 2.0;
        var t = (planeY - cameraPosition[1]) / worldSpaceMouseRay[1];
        
        if (t > 0) {
            var hitPos = [
                cameraPosition[0] + worldSpaceMouseRay[0] * t,
                cameraPosition[1] + worldSpaceMouseRay[1] * t,
                cameraPosition[2] + worldSpaceMouseRay[2] * t
            ];
            
            hitPos[0] = Math.max(0, Math.min(GRID_WIDTH, hitPos[0]));
            hitPos[2] = Math.max(0, Math.min(GRID_DEPTH, hitPos[2]));
            
            return { pos: hitPos, ray: worldSpaceMouseRay };
        }
        return null;
    };

    FluidParticles.prototype.updateSourceBadge = function() {
        if (this.sourceCountBadge) {
            var count = this.simulatorRenderer.simulator.sources.length;
            this.sourceCountBadge.textContent = count;
            if (count === 0) {
                this.sourceCountBadge.classList.add('empty');
            } else {
                this.sourceCountBadge.classList.remove('empty');
            }
        }
    };

    // Draw overlay with source indicators
    FluidParticles.prototype.drawOverlay = function(time) {
        if (!this.overlayCtx || this.state !== State.SIMULATING) return;
        
        var ctx = this.overlayCtx;
        var oc = this.overlayCanvas;
        
        // Resize overlay canvas to match display
        var dpr = window.devicePixelRatio || 1;
        if (oc.width !== this.canvas.clientWidth * dpr || oc.height !== this.canvas.clientHeight * dpr) {
            oc.width = this.canvas.clientWidth * dpr;
            oc.height = this.canvas.clientHeight * dpr;
            oc.style.width = this.canvas.clientWidth + 'px';
            oc.style.height = this.canvas.clientHeight + 'px';
            ctx.scale(dpr, dpr);
        }
        
        ctx.clearRect(0, 0, oc.width / dpr, oc.height / dpr);
        
        var sources = this.simulatorRenderer.simulator.sources;
        var t = (time || 0) / 1000.0;
        
        for (var i = 0; i < sources.length; i++) {
            var source = sources[i];
            var screenPos = this.projectToScreen(source.pos);
            if (!screenPos || screenPos.depth > 0) continue; // behind camera
            
            var x = screenPos.x;
            var y = screenPos.y;
            var type = source.type;
            var color = TOOL_COLORS[type] || TOOL_COLORS[0];
            
            ctx.save();
            ctx.translate(x, y);
            
            if (type === 1) {
                // VORTEX - spinning spiral
                this.drawVortexIcon(ctx, t, color);
            } else if (type === 2) {
                // WIND - arrow in direction
                this.drawWindIcon(ctx, t, color, source.dir);
            } else if (type === 3) {
                // REPEL - expanding circles
                this.drawRepelIcon(ctx, t, color);
            } else if (type === 4) {
                // BLACK HOLE - pulsing ring
                this.drawBlackHoleIcon(ctx, t, color);
            } else if (type === 5) {
                // FOUNTAIN - upward chevrons
                this.drawFountainIcon(ctx, t, color);
            } else if (type === 6) {
                // TURBULENCE - chaotic squiggles
                this.drawTurbulenceIcon(ctx, t, color);
            } else if (type === 7) {
                // WAVE - concentric ripples
                this.drawWaveIcon(ctx, t, color);
            } else if (type === 8) {
                // MAGNET - attract indicator
                this.drawMagnetIcon(ctx, t, color);
            }
            
            ctx.restore();
        }
        
        // Draw wind drag preview line
        if (this.isDraggingWind && this.windDragStart && this.windDragCurrent) {
            this.drawWindDragPreview(ctx, t);
        }
        
        // Update source badge
        this.updateSourceBadge();
    };

    // ====== Individual Source Icon Drawing Functions ======

    FluidParticles.prototype.drawVortexIcon = function(ctx, t, color) {
        var angle = t * 3.0;
        var radius = 18;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.85;
        
        // Draw spiral
        ctx.beginPath();
        for (var a = 0; a < Math.PI * 4; a += 0.1) {
            var r = 3 + a * 1.5;
            if (r > radius) break;
            var px = Math.cos(a + angle) * r;
            var py = Math.sin(a + angle) * r;
            if (a === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
        
        // Center dot
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    };

    FluidParticles.prototype.drawWindIcon = function(ctx, t, color, dir) {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.9;
        
        // Arrow direction (project 3D dir to 2D screen-space approximation)
        var angle = Math.atan2(-dir[2], dir[0]); // XZ plane
        
        ctx.rotate(angle);
        
        var len = 28;
        var pulse = Math.sin(t * 4.0) * 3;
        
        // Arrow shaft
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(len + pulse, 0);
        ctx.stroke();
        
        // Arrow head
        ctx.beginPath();
        ctx.moveTo(len + pulse, 0);
        ctx.lineTo(len + pulse - 8, -5);
        ctx.lineTo(len + pulse - 8, 5);
        ctx.closePath();
        ctx.fill();
        
        // Wind lines
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        for (var i = 0; i < 3; i++) {
            var offset = (t * 40 + i * 15) % 30 - 5;
            var yOff = (i - 1) * 8;
            ctx.beginPath();
            ctx.moveTo(offset - 6, yOff);
            ctx.lineTo(offset + 8, yOff);
            ctx.stroke();
        }
        
        ctx.globalAlpha = 1.0;
    };

    FluidParticles.prototype.drawRepelIcon = function(ctx, t, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        
        // Expanding circles
        for (var i = 0; i < 3; i++) {
            var phase = (t * 1.5 + i * 0.33) % 1.0;
            var radius = phase * 22;
            ctx.globalAlpha = (1.0 - phase) * 0.7;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // Center
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    };

    FluidParticles.prototype.drawBlackHoleIcon = function(ctx, t, color) {
        var pulse = 0.85 + Math.sin(t * 3) * 0.15;
        var radius = 16 * pulse;
        
        // Outer ring
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Inner ring
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        
        // Dark center
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Spin indicators
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        for (var i = 0; i < 4; i++) {
            var a = t * 2 + i * Math.PI / 2;
            ctx.beginPath();
            ctx.arc(0, 0, radius * 0.75, a, a + 0.5);
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
    };

    FluidParticles.prototype.drawFountainIcon = function(ctx, t, color) {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.85;
        
        // Upward chevrons
        for (var i = 0; i < 3; i++) {
            var phase = (t * 2 + i * 0.33) % 1.0;
            var yOff = -phase * 30;
            ctx.globalAlpha = (1.0 - phase) * 0.8;
            ctx.beginPath();
            ctx.moveTo(-8, yOff + 6);
            ctx.lineTo(0, yOff);
            ctx.lineTo(8, yOff + 6);
            ctx.stroke();
        }
        
        // Base
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(0, 4, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    };

    FluidParticles.prototype.drawTurbulenceIcon = function(ctx, t, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.75;
        
        // Chaotic squiggly lines
        for (var i = 0; i < 5; i++) {
            var seed = i * 73.37;
            ctx.beginPath();
            for (var j = 0; j < 12; j++) {
                var px = (Math.sin(seed + j * 1.7 + t * 3) * 12);
                var py = (Math.cos(seed + j * 2.3 + t * 2.5) * 12);
                if (j === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
        }
        
        // Center
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    };

    FluidParticles.prototype.drawWaveIcon = function(ctx, t, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        
        // Concentric expanding ripples
        for (var i = 0; i < 4; i++) {
            var phase = (t * 1.2 + i * 0.25) % 1.0;
            var radius = phase * 24;
            ctx.globalAlpha = (1.0 - phase) * 0.6;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // Center dot
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    };

    FluidParticles.prototype.drawMagnetIcon = function(ctx, t, color) {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.85;
        
        // Converging arrows (inward)
        for (var i = 0; i < 6; i++) {
            var angle = (i / 6) * Math.PI * 2 + t * 0.5;
            var phase = (t * 1.5 + i * 0.17) % 1.0;
            var dist = 22 - phase * 14;
            ctx.globalAlpha = phase * 0.7;
            
            var px = Math.cos(angle) * dist;
            var py = Math.sin(angle) * dist;
            var size = 3;
            
            ctx.beginPath();
            ctx.moveTo(px + Math.cos(angle) * size, py + Math.sin(angle) * size);
            ctx.lineTo(px - Math.cos(angle + 0.5) * size, py - Math.sin(angle + 0.5) * size);
            ctx.lineTo(px - Math.cos(angle - 0.5) * size, py - Math.sin(angle - 0.5) * size);
            ctx.closePath();
            ctx.fill();
        }
        
        // Center
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    };

    FluidParticles.prototype.drawWindDragPreview = function(ctx, t) {
        var sx = this.windDragStart.screenX;
        var sy = this.windDragStart.screenY;
        var ex = this.windDragCurrent.screenX;
        var ey = this.windDragCurrent.screenY;
        
        var dx = ex - sx;
        var dy = ey - sy;
        var len = Math.sqrt(dx * dx + dy * dy);
        
        if (len < 5) return;
        
        // Line
        ctx.strokeStyle = 'rgba(100,200,255,0.8)';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Arrow head at end
        var angle = Math.atan2(dy, dx);
        ctx.fillStyle = 'rgba(100,200,255,0.9)';
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 12 * Math.cos(angle - 0.3), ey - 12 * Math.sin(angle - 0.3));
        ctx.lineTo(ex - 12 * Math.cos(angle + 0.3), ey - 12 * Math.sin(angle + 0.3));
        ctx.closePath();
        ctx.fill();
        
        // Start dot
        ctx.fillStyle = 'rgba(100,200,255,0.7)';
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.globalAlpha = 1.0;
    };

    FluidParticles.prototype.onResize = function (event) {
        var dpr = window.devicePixelRatio || 1;
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';

        Utilities.makePerspectiveMatrix(this.projectionMatrix, FOV, this.canvas.width / this.canvas.height, 0.1, 100.0);

        this.simulatorRenderer.onResize(event);
    }

    FluidParticles.prototype.onMouseMove = function (event) {
        event.preventDefault();

        if (this.state === State.EDITING) {
            this.boxEditor.onMouseMove(event);

            if (this.boxEditor.interactionState !== null) {
                this.editedSinceLastPreset = true;
            }
        } else if (this.state === State.SIMULATING) {
            this.simulatorRenderer.onMouseMove(event);
            
            // Update wind drag current position
            if (this.isDraggingWind) {
                var position = Utilities.getMousePosition(event, this.canvas);
                this.windDragCurrent = { screenX: position.x, screenY: position.y };
            }
        }
    };

    FluidParticles.prototype.onMouseDown = function (event) {
        event.preventDefault();

        var target = event.target;
        if (target.closest('#ui') || target.closest('#right-bar')) {
            return;
        }

        if (this.state === State.EDITING) {
            this.boxEditor.onMouseDown(event);
        } else if (this.state === State.SIMULATING) {
            
            // If no tool active, check if clicking near a source to delete it, otherwise rotate camera
            if (this.activeTool === 0) {
                // Check for source deletion
                var position = Utilities.getMousePosition(event, this.canvas);
                var clickedSourceIndex = this.findSourceNearScreen(position.x, position.y, 30);
                
                if (clickedSourceIndex >= 0) {
                    this.simulatorRenderer.simulator.sources.splice(clickedSourceIndex, 1);
                    this.updateSourceBadge();
                    return;
                }
                
                this.simulatorRenderer.onMouseDown(event);
                return;
            }
            
            var position = Utilities.getMousePosition(event, this.canvas);
            
            // Wind tool: start drag for direction
            if (this.activeTool === 2) {
                var hit = this.screenToWorld(position.x, position.y);
                if (hit) {
                    this.isDraggingWind = true;
                    this.windDragStart = {
                        screenX: position.x,
                        screenY: position.y,
                        worldPos: hit.pos,
                        ray: hit.ray
                    };
                    this.windDragCurrent = { screenX: position.x, screenY: position.y };
                }
                return;
            }
            
            // All other tools: place immediately on click
            this.placeSource(position.x, position.y, this.activeTool, null);
        }
    };

    FluidParticles.prototype.onMouseUp = function (event) {
        event.preventDefault();

        if (this.state === State.EDITING) {
            this.boxEditor.onMouseUp(event);
        } else if (this.state === State.SIMULATING) {
            // Wind tool: finish drag and place source with direction
            if (this.isDraggingWind && this.windDragStart) {
                var position = Utilities.getMousePosition(event, this.canvas);
                var dx = position.x - this.windDragStart.screenX;
                var dy = position.y - this.windDragStart.screenY;
                var screenLen = Math.sqrt(dx * dx + dy * dy);
                
                var dir = [1.0, 0.0, 0.0];
                if (screenLen > 10) {
                    // Map screen drag to world XZ direction
                    var endHit = this.screenToWorld(position.x, position.y);
                    if (endHit && this.windDragStart.worldPos) {
                        var wx = endHit.pos[0] - this.windDragStart.worldPos[0];
                        var wz = endHit.pos[2] - this.windDragStart.worldPos[2];
                        var wLen = Math.sqrt(wx * wx + wz * wz);
                        if (wLen > 0.01) {
                            dir = [wx / wLen, 0.0, wz / wLen];
                        }
                    }
                } else {
                    // Short drag: use camera direction
                    dir = [this.windDragStart.ray[0], 0.0, this.windDragStart.ray[2]];
                    var len = Math.sqrt(dir[0]*dir[0] + dir[2]*dir[2]);
                    if (len > 0.001) {
                        dir[0] /= len;
                        dir[2] /= len;
                    } else {
                        dir = [1.0, 0.0, 0.0];
                    }
                }
                
                this.simulatorRenderer.simulator.sources.push({
                    pos: this.windDragStart.worldPos,
                    type: 2,
                    dir: dir,
                    strength: this.sourceStrength
                });
                
                if (this.simulatorRenderer.simulator.sources.length > 8) {
                    this.simulatorRenderer.simulator.sources.shift();
                }
                
                this.isDraggingWind = false;
                this.windDragStart = null;
                this.windDragCurrent = null;
                this.updateSourceBadge();
                return;
            }
            
            this.simulatorRenderer.onMouseUp(event);
        }
    };

    FluidParticles.prototype.placeSource = function(screenX, screenY, toolType, customDir) {
        var hit = this.screenToWorld(screenX, screenY);
        if (!hit) return;
        
        var dir = customDir || [1.0, 0.0, 0.0];
        
        this.simulatorRenderer.simulator.sources.push({
            pos: hit.pos,
            type: toolType,
            dir: dir,
            strength: this.sourceStrength
        });

        if (this.simulatorRenderer.simulator.sources.length > 8) {
            this.simulatorRenderer.simulator.sources.shift();
        }
        
        this.updateSourceBadge();
    };

    FluidParticles.prototype.findSourceNearScreen = function(screenX, screenY, threshold) {
        var sources = this.simulatorRenderer.simulator.sources;
        var bestDist = threshold;
        var bestIndex = -1;
        
        for (var i = 0; i < sources.length; i++) {
            var sp = this.projectToScreen(sources[i].pos);
            if (!sp) continue;
            var dx = sp.x - screenX;
            var dy = sp.y - screenY;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < bestDist) {
                bestDist = dist;
                bestIndex = i;
            }
        }
        return bestIndex;
    };

    FluidParticles.prototype.onKeyDown = function (event) {
        if (this.state === State.EDITING) {
            this.boxEditor.onKeyDown(event);
        }
    };

    FluidParticles.prototype.onKeyUp = function (event) {
        if (this.state === State.EDITING) {
            this.boxEditor.onKeyUp(event);
        }
    };

    FluidParticles.prototype.redrawUI = function () {

        var simulatingElements = document.querySelectorAll('.simulating-ui');
        var editingElements = document.querySelectorAll('.editing-ui');


        if (this.state === State.SIMULATING) {
            for (var i = 0; i < simulatingElements.length; ++i) {
                simulatingElements[i].style.display = 'block';
            }

            for (var i = 0; i < editingElements.length; ++i) {
                editingElements[i].style.display = 'none';
            }


            this.startButton.textContent = 'Edit';
            this.startButton.className = 'start-button-active';
        } else if (this.state === State.EDITING) {
            for (var i = 0; i < simulatingElements.length; ++i) {
                simulatingElements[i].style.display = 'none';
            }

            for (var i = 0; i < editingElements.length; ++i) {
                editingElements[i].style.display = 'block';
            }

            document.getElementById('particle-count').innerHTML = this.getParticleCount().toFixed(0) + ' particles';

            if (this.boxEditor.boxes.length >= 2 ||
                this.boxEditor.boxes.length === 1 && (this.boxEditor.interactionState === null || this.boxEditor.interactionState.mode !== BoxEditor.InteractionMode.EXTRUDING && this.boxEditor.interactionState.mode !== BoxEditor.InteractionMode.DRAWING)) { 
                this.startButton.className = 'start-button-active';
            } else {
                this.startButton.className = 'start-button-inactive';
            }

            this.startButton.textContent = 'Start';

            if (this.editedSinceLastPreset) {
                this.presetButton.innerHTML = 'Use Preset';
            } else {
                this.presetButton.innerHTML = 'Next Preset';
            }
        }

        this.flipnessSlider.redraw();
        this.densitySlider.redraw();
        this.speedSlider.redraw();
        this.explodeSlider.redraw();
        if (this.strengthSlider) this.strengthSlider.redraw();
    }


    FluidParticles.prototype.getParticleCount = function () {
        var boxEditor = this.boxEditor;

        var gridCells = GRID_WIDTH * GRID_HEIGHT * GRID_DEPTH * this.gridCellDensity;

        var gridResolutionY = Math.ceil(Math.pow(gridCells / 2, 1.0 / 3.0));
        var gridResolutionZ = gridResolutionY * 1;
        var gridResolutionX = gridResolutionY * 2;

        var totalGridCells = gridResolutionX * gridResolutionY * gridResolutionZ;


        var totalVolume = 0;
        var cumulativeVolume = [];

        for (var i = 0; i < boxEditor.boxes.length; ++i) {
            var box = boxEditor.boxes[i];
            var volume = box.computeVolume();
            totalVolume += volume;
            cumulativeVolume[i] = totalVolume;
        }

        var fractionFilled = totalVolume / (GRID_WIDTH * GRID_HEIGHT * GRID_DEPTH);
        var desiredParticleCount = fractionFilled * totalGridCells * PARTICLES_PER_CELL;

        return desiredParticleCount;
    }

    FluidParticles.prototype.startSimulation = function () {
        this.state = State.SIMULATING;

        var desiredParticleCount = this.getParticleCount();
        var particlesWidth = 512;
        var particlesHeight = Math.ceil(desiredParticleCount / particlesWidth);
        var particleCount = particlesWidth * particlesHeight;
        var particlePositions = [];
        
        var boxEditor = this.boxEditor;

        var totalVolume = 0;
        for (var i = 0; i < boxEditor.boxes.length; ++i) {
            totalVolume += boxEditor.boxes[i].computeVolume();
        }

        var particlesCreatedSoFar = 0;
        for (var i = 0; i < boxEditor.boxes.length; ++i) {
            var box = boxEditor.boxes[i];
            
            var particlesInBox = 0;
            if (i < boxEditor.boxes.length - 1) { 
                particlesInBox = Math.floor(particleCount * box.computeVolume() / totalVolume);
            } else {
                particlesInBox = particleCount - particlesCreatedSoFar;
            }

            for (var j = 0; j < particlesInBox; ++j) {
                var position = box.randomPoint();
                particlePositions.push(position);
            }

            particlesCreatedSoFar += particlesInBox;
        }

        var gridCells = GRID_WIDTH * GRID_HEIGHT * GRID_DEPTH * this.gridCellDensity;

        var gridResolutionY = Math.ceil(Math.pow(gridCells / 2, 1.0 / 3.0));
        var gridResolutionZ = gridResolutionY * 1;
        var gridResolutionX = gridResolutionY * 2;

        var gridSize = [GRID_WIDTH, GRID_HEIGHT, GRID_DEPTH];
        var gridResolution = [gridResolutionX, gridResolutionY, gridResolutionZ];

        var sphereRadius = 7.0 / gridResolutionX;
        this.simulatorRenderer.reset(particlesWidth, particlesHeight, particlePositions, gridSize, gridResolution, PARTICLES_PER_CELL, sphereRadius);

        this.camera.setBounds(0, Math.PI / 2);
    }

    FluidParticles.prototype.stopSimulation = function () {
        this.state = State.EDITING;
        this.camera.setBounds(-Math.PI / 4, Math.PI / 4);
    }

    FluidParticles.prototype.update = function (deltaTime) {
        if (this.state === State.EDITING) {
            this.boxEditor.draw();
        } else if (this.state === State.SIMULATING) {
            this.simulatorRenderer.update(this.timeStep);
            this.drawOverlay(performance.now());
        }
    }

    return FluidParticles;
}());
