'use strict';

var MagnetParticles = (function () {
    var FOV = Math.PI / 3;

    var GRID_WIDTH = 40,
        GRID_HEIGHT = 1,
        GRID_DEPTH = 30;

    var MAX_MAGNETS = 8;

    // Quality presets: [density per unit area, label]
    var QUALITY_PRESETS = [
        { density: 15, label: 'Low (~18k)' },
        { density: 30, label: 'Medium (~36k)' },
        { density: 60, label: 'High (~72k)' },
        { density: 85, label: 'Ultra (~100k)' }
    ];

    function MagnetParticles() {
        var canvas = this.canvas = document.getElementById('canvas');
        var wgl = this.wgl = new WrappedGL(canvas);
        window.wgl = wgl;

        this.projectionMatrix = Utilities.makePerspectiveMatrix(new Float32Array(16), FOV, this.canvas.width / this.canvas.height, 0.1, 100.0);
        this.camera = new Camera(this.canvas, [GRID_WIDTH / 2, 0.5, GRID_DEPTH / 2]);

        this.simulatorRenderer = new MagnetSimulatorRenderer(this.canvas, this.wgl, this.projectionMatrix, this.camera, [GRID_WIDTH, GRID_HEIGHT, GRID_DEPTH], (function () {
            start.call(this);
        }).bind(this));

        function start() {
            this.overlayCanvas = document.getElementById('overlay-canvas');
            this.overlayCtx = this.overlayCanvas ? this.overlayCanvas.getContext('2d') : null;

            this.timeStep = 1.0 / 60.0;
            this.magnetSize = 6.0;
            this.activeTool = 0;
            this.qualityLevel = 2;  // Default: High

            // Drag-and-drop state
            this.draggingMagnetIndex = -1;
            this.isDragging = false;
            this.lastClickTime = 0;

            // Camera: top-down view
            this.camera.elevation = 1.45;
            this.camera.azimuth = 0.0;
            this.camera.distance = 32.0;
            this.camera.setBounds(0.6, 1.55);
            this.camera.recomputeViewMatrix();

            // Field strength slider
            this.simulatorRenderer.simulator.fieldStrength = 15.0;
            this.fieldStrengthSlider = new Slider(document.getElementById('field-strength-slider'), 15.0, 1.0, 30.0, (function (val) {
                this.simulatorRenderer.simulator.fieldStrength = val;
            }).bind(this));

            // Interaction strength slider
            this.simulatorRenderer.simulator.interactionStrength = 3.0;
            this.interactionSlider = new Slider(document.getElementById('interaction-slider'), 3.0, 0.0, 10.0, (function (val) {
                this.simulatorRenderer.simulator.interactionStrength = val;
            }).bind(this));

            // Particle size slider
            this.sphereRadius = 0.12;
            this.sizeSlider = new Slider(document.getElementById('size-slider'), this.sphereRadius, 0.04, 0.3, (function (val) {
                this.sphereRadius = val;
                this.simulatorRenderer.renderer.sphereRadius = val;
            }).bind(this));

            // Magnet size slider
            this.magnetSizeSlider = new Slider(document.getElementById('magnet-size-slider'), this.magnetSize, 2.0, 14.0, (function (val) {
                this.magnetSize = val;
            }).bind(this));

            // Quality slider (discrete steps)
            this.qualitySlider = new Slider(document.getElementById('quality-slider'), this.qualityLevel, 0, QUALITY_PRESETS.length - 1, (function (val) {
                var newLevel = Math.round(val);
                if (newLevel !== this.qualityLevel) {
                    this.qualityLevel = newLevel;
                    this.updateQualityLabel();
                    this.initSimulation();
                }
            }).bind(this));
            this.updateQualityLabel();

            // Color picker
            this.colorPicker = document.getElementById('color-picker');
            this.colorPicker.addEventListener('input', (function (e) {
                var hex = e.target.value;
                var r = parseInt(hex.substring(1, 3), 16) / 255.0;
                var g = parseInt(hex.substring(3, 5), 16) / 255.0;
                var b = parseInt(hex.substring(5, 7), 16) / 255.0;
                this.simulatorRenderer.particleColor = [r, g, b];
            }).bind(this));

            // Reset button
            this.resetButton = document.getElementById('reset-button');
            this.resetButton.addEventListener('click', (function () {
                this.initSimulation();
            }).bind(this));

            // Tool buttons
            this.toolButtons = {
                none: document.getElementById('tool-none-button'),
                horseshoe: document.getElementById('tool-horseshoe-button')
            };
            this.toolTypes = { none: 0, horseshoe: 1 };

            this.clearButton = document.getElementById('clear-magnets-button');
            this.magnetBadge = document.getElementById('magnet-count-badge');

            var setTool = (function (name) {
                this.activeTool = this.toolTypes[name];
                for (var key in this.toolButtons) {
                    this.toolButtons[key].classList.remove('active-tool');
                }
                if (this.toolButtons[name]) {
                    this.toolButtons[name].classList.add('active-tool');
                }
            }).bind(this);

            for (var key in this.toolButtons) {
                (function (k) {
                    this.toolButtons[k].addEventListener('click', function () { setTool(k); });
                }).bind(this)(key);
            }

            this.clearButton.addEventListener('click', (function () {
                this.simulatorRenderer.simulator.magnets = [];
                this.updateBadge();
            }).bind(this));

            // Initialize simulation
            this.initSimulation();

            // Auto-place a magnet in the center for immediate visual impact
            this.simulatorRenderer.simulator.magnets.push({
                pos: [GRID_WIDTH / 2, 0.5, GRID_DEPTH / 2],
                rotation: 0.0,
                size: this.magnetSize,
                type: 1
            });
            this.updateBadge();

            // Event listeners
            this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
            this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
            document.addEventListener('mouseup', this.onMouseUp.bind(this));
            this.canvas.addEventListener('dblclick', this.onDoubleClick.bind(this));
            window.addEventListener('resize', this.onResize.bind(this));
            this.onResize();

            // Start update loop
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

    MagnetParticles.prototype.updateQualityLabel = function () {
        var label = document.getElementById('quality-label');
        if (label) {
            label.textContent = QUALITY_PRESETS[this.qualityLevel].label;
        }
    };

    MagnetParticles.prototype.initSimulation = function () {
        var particlesWidth = 512;
        var totalArea = GRID_WIDTH * GRID_DEPTH;
        var density = QUALITY_PRESETS[this.qualityLevel].density;
        var particleCount = particlesWidth * Math.ceil((totalArea * density) / particlesWidth);
        var particlesHeight = Math.ceil(particleCount / particlesWidth);
        particleCount = particlesWidth * particlesHeight;

        var particlePositions = [];
        for (var i = 0; i < particleCount; i++) {
            particlePositions.push([
                0.5 + Math.random() * (GRID_WIDTH - 1.0),
                0.3 + Math.random() * 0.4,
                0.5 + Math.random() * (GRID_DEPTH - 1.0)
            ]);
        }

        var gridSize = [GRID_WIDTH, GRID_HEIGHT, GRID_DEPTH];
        this.simulatorRenderer.reset(particlesWidth, particlesHeight, particlePositions, gridSize, this.sphereRadius);
    };

    MagnetParticles.prototype.updateBadge = function () {
        if (this.magnetBadge) {
            var count = this.simulatorRenderer.simulator.magnets.length;
            this.magnetBadge.textContent = count;
            if (count === 0) {
                this.magnetBadge.classList.add('empty');
            } else {
                this.magnetBadge.classList.remove('empty');
            }
        }
    };

    // ─── Projection utilities ───

    MagnetParticles.prototype.projectToScreen = function (worldPos) {
        var viewMatrix = this.camera.getViewMatrix();
        var projMatrix = this.projectionMatrix;
        var vx = viewMatrix[0] * worldPos[0] + viewMatrix[4] * worldPos[1] + viewMatrix[8] * worldPos[2] + viewMatrix[12];
        var vy = viewMatrix[1] * worldPos[0] + viewMatrix[5] * worldPos[1] + viewMatrix[9] * worldPos[2] + viewMatrix[13];
        var vz = viewMatrix[2] * worldPos[0] + viewMatrix[6] * worldPos[1] + viewMatrix[10] * worldPos[2] + viewMatrix[14];
        var vw = viewMatrix[3] * worldPos[0] + viewMatrix[7] * worldPos[1] + viewMatrix[11] * worldPos[2] + viewMatrix[15];
        var px = projMatrix[0] * vx + projMatrix[4] * vy + projMatrix[8] * vz + projMatrix[12] * vw;
        var py = projMatrix[1] * vx + projMatrix[5] * vy + projMatrix[9] * vz + projMatrix[13] * vw;
        var pw = projMatrix[3] * vx + projMatrix[7] * vy + projMatrix[11] * vz + projMatrix[15] * vw;
        if (Math.abs(pw) < 0.001) return null;
        var screenX = ((px / pw) * 0.5 + 0.5) * this.canvas.clientWidth;
        var screenY = (1.0 - ((py / pw) * 0.5 + 0.5)) * this.canvas.clientHeight;
        return { x: screenX, y: screenY, depth: vz };
    };

    MagnetParticles.prototype.screenToWorld = function (screenX, screenY) {
        var normalizedX = screenX / this.canvas.clientWidth;
        var normalizedY = screenY / this.canvas.clientHeight;
        var mouseX = normalizedX * 2.0 - 1.0;
        var mouseY = (1.0 - normalizedY) * 2.0 - 1.0;
        var fov = 2.0 * Math.atan(1.0 / this.projectionMatrix[5]);
        var viewSpaceRay = [
            mouseX * Math.tan(fov / 2.0) * (this.canvas.width / this.canvas.height),
            mouseY * Math.tan(fov / 2.0),
            -1.0
        ];
        var inverseViewMatrix = Utilities.invertMatrix([], this.camera.getViewMatrix());
        var worldRay = Utilities.transformDirectionByMatrix([], viewSpaceRay, inverseViewMatrix);
        Utilities.normalizeVector(worldRay, worldRay);
        var camPos = this.camera.getPosition();
        var planeY = 0.5;
        if (Math.abs(worldRay[1]) < 0.001) return null;
        var t = (planeY - camPos[1]) / worldRay[1];
        if (t > 0) {
            var hitPos = [
                camPos[0] + worldRay[0] * t,
                planeY,
                camPos[2] + worldRay[2] * t
            ];
            hitPos[0] = Math.max(3, Math.min(GRID_WIDTH - 3, hitPos[0]));
            hitPos[2] = Math.max(3, Math.min(GRID_DEPTH - 3, hitPos[2]));
            return hitPos;
        }
        return null;
    };

    MagnetParticles.prototype.findMagnetNearScreen = function (screenX, screenY, threshold) {
        var magnets = this.simulatorRenderer.simulator.magnets;
        var bestDist = threshold;
        var bestIndex = -1;
        for (var i = 0; i < magnets.length; i++) {
            var sp = this.projectToScreen(magnets[i].pos);
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

    // ─── Event handlers ───

    MagnetParticles.prototype.onResize = function () {
        var dpr = window.devicePixelRatio || 1;
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        Utilities.makePerspectiveMatrix(this.projectionMatrix, FOV, this.canvas.width / this.canvas.height, 0.1, 100.0);
        this.simulatorRenderer.onResize();
    };

    MagnetParticles.prototype.onMouseMove = function (event) {
        event.preventDefault();

        // Handle drag-and-drop of magnets
        if (this.isDragging && this.draggingMagnetIndex >= 0) {
            var position = Utilities.getMousePosition(event, this.canvas);
            var worldPos = this.screenToWorld(position.x, position.y);
            if (worldPos) {
                var magnet = this.simulatorRenderer.simulator.magnets[this.draggingMagnetIndex];
                if (magnet) {
                    magnet.pos = worldPos;
                }
            }
            // Set grab cursor
            this.canvas.style.cursor = 'grabbing';
            return;  // Don't pass to camera while dragging
        }

        // Hover cursor feedback
        if (this.activeTool === 0) {
            var position = Utilities.getMousePosition(event, this.canvas);
            var idx = this.findMagnetNearScreen(position.x, position.y, 60);
            this.canvas.style.cursor = idx >= 0 ? 'grab' : 'default';
        } else {
            this.canvas.style.cursor = 'crosshair';
        }

        this.simulatorRenderer.onMouseMove(event);
    };

    MagnetParticles.prototype.onMouseDown = function (event) {
        event.preventDefault();
        var target = event.target;
        if (target.closest('#ui') || target.closest('#right-bar')) return;

        var position = Utilities.getMousePosition(event, this.canvas);

        if (this.activeTool === 0) {
            // None tool: try to start dragging a magnet
            var idx = this.findMagnetNearScreen(position.x, position.y, 60);
            if (idx >= 0) {
                this.draggingMagnetIndex = idx;
                this.isDragging = true;
                this.canvas.style.cursor = 'grabbing';
                return;
            }
            // No magnet nearby — pass to camera orbit
            this.simulatorRenderer.onMouseDown(event);
            return;
        }

        // Place bar magnet
        var worldPos = this.screenToWorld(position.x, position.y);
        if (worldPos) {
            this.simulatorRenderer.simulator.magnets.push({
                pos: worldPos,
                rotation: 0.0,
                size: this.magnetSize,
                type: this.activeTool
            });

            if (this.simulatorRenderer.simulator.magnets.length > MAX_MAGNETS) {
                this.simulatorRenderer.simulator.magnets.shift();
            }
            this.updateBadge();
        }
    };

    MagnetParticles.prototype.onMouseUp = function (event) {
        event.preventDefault();

        if (this.isDragging) {
            this.isDragging = false;
            this.draggingMagnetIndex = -1;
            this.canvas.style.cursor = this.activeTool === 0 ? 'default' : 'crosshair';
            return;
        }

        this.simulatorRenderer.onMouseUp(event);
    };

    MagnetParticles.prototype.onDoubleClick = function (event) {
        event.preventDefault();
        var target = event.target;
        if (target.closest('#ui') || target.closest('#right-bar')) return;

        // Double-click to delete a magnet (any tool)
        var position = Utilities.getMousePosition(event, this.canvas);
        var idx = this.findMagnetNearScreen(position.x, position.y, 60);
        if (idx >= 0) {
            this.simulatorRenderer.simulator.magnets.splice(idx, 1);
            this.updateBadge();
        }
    };

    // ─── Overlay rendering ───

    MagnetParticles.prototype.drawOverlay = function (time) {
        if (!this.overlayCtx) return;
        var ctx = this.overlayCtx;
        var oc = this.overlayCanvas;
        var dpr = window.devicePixelRatio || 1;

        if (oc.width !== this.canvas.clientWidth * dpr || oc.height !== this.canvas.clientHeight * dpr) {
            oc.width = this.canvas.clientWidth * dpr;
            oc.height = this.canvas.clientHeight * dpr;
            oc.style.width = this.canvas.clientWidth + 'px';
            oc.style.height = this.canvas.clientHeight + 'px';
            ctx.scale(dpr, dpr);
        }

        ctx.clearRect(0, 0, oc.width / dpr, oc.height / dpr);
        var magnets = this.simulatorRenderer.simulator.magnets;
        var t = (time || 0) / 1000.0;

        for (var i = 0; i < magnets.length; i++) {
            var mag = magnets[i];
            var halfLen = mag.size * 0.5;
            var barHeight = mag.size * 0.18;
            var cos_r = Math.cos(mag.rotation);
            var sin_r = Math.sin(mag.rotation);

            var perpX = -sin_r * barHeight;
            var perpZ = cos_r * barHeight;

            var leftEnd = [
                mag.pos[0] + cos_r * (-halfLen),
                mag.pos[1],
                mag.pos[2] + sin_r * (-halfLen)
            ];
            var rightEnd = [
                mag.pos[0] + cos_r * (halfLen),
                mag.pos[1],
                mag.pos[2] + sin_r * (halfLen)
            ];

            var corners = [
                [leftEnd[0] - perpX, leftEnd[1], leftEnd[2] - perpZ],
                [leftEnd[0] + perpX, leftEnd[1], leftEnd[2] + perpZ],
                [rightEnd[0] + perpX, rightEnd[1], rightEnd[2] + perpZ],
                [rightEnd[0] - perpX, rightEnd[1], rightEnd[2] - perpZ]
            ];

            var screenCorners = [];
            var valid = true;
            for (var j = 0; j < 4; j++) {
                var sp = this.projectToScreen(corners[j]);
                if (!sp) { valid = false; break; }
                screenCorners.push(sp);
            }
            if (!valid) continue;

            var spCenter = this.projectToScreen(mag.pos);
            if (!spCenter || spCenter.depth > 0) continue;

            ctx.save();

            // Highlight dragged magnet
            var isDragged = (this.isDragging && this.draggingMagnetIndex === i);
            var pulse = isDragged ? 1.0 : (0.85 + Math.sin(t * 2.0) * 0.1);
            ctx.globalAlpha = pulse;

            // Dragged magnet glow
            if (isDragged) {
                ctx.shadowColor = 'rgba(139, 92, 246, 0.6)';
                ctx.shadowBlur = 20;
            }

            var midTop = {
                x: (screenCorners[1].x + screenCorners[2].x) / 2,
                y: (screenCorners[1].y + screenCorners[2].y) / 2
            };
            var midBot = {
                x: (screenCorners[0].x + screenCorners[3].x) / 2,
                y: (screenCorners[0].y + screenCorners[3].y) / 2
            };

            // N pole — red half
            ctx.fillStyle = 'rgba(220, 45, 45, 0.9)';
            ctx.strokeStyle = 'rgba(160, 25, 25, 1.0)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(screenCorners[0].x, screenCorners[0].y);
            ctx.lineTo(screenCorners[1].x, screenCorners[1].y);
            ctx.lineTo(midTop.x, midTop.y);
            ctx.lineTo(midBot.x, midBot.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // S pole — blue half
            ctx.fillStyle = 'rgba(45, 70, 220, 0.9)';
            ctx.strokeStyle = 'rgba(25, 40, 160, 1.0)';
            ctx.beginPath();
            ctx.moveTo(midBot.x, midBot.y);
            ctx.lineTo(midTop.x, midTop.y);
            ctx.lineTo(screenCorners[2].x, screenCorners[2].y);
            ctx.lineTo(screenCorners[3].x, screenCorners[3].y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Outline
            ctx.globalAlpha = isDragged ? 0.6 : 0.3;
            ctx.strokeStyle = isDragged ? 'rgba(139, 92, 246, 0.8)' : 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = isDragged ? 2 : 1;
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.moveTo(screenCorners[0].x, screenCorners[0].y);
            ctx.lineTo(screenCorners[1].x, screenCorners[1].y);
            ctx.lineTo(screenCorners[2].x, screenCorners[2].y);
            ctx.lineTo(screenCorners[3].x, screenCorners[3].y);
            ctx.closePath();
            ctx.stroke();

            // Pole labels
            ctx.globalAlpha = 1.0;
            ctx.font = 'bold 16px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 4;

            var nCenter = {
                x: (screenCorners[0].x + screenCorners[1].x) / 2,
                y: (screenCorners[0].y + screenCorners[1].y) / 2
            };
            var sCenter = {
                x: (screenCorners[2].x + screenCorners[3].x) / 2,
                y: (screenCorners[2].y + screenCorners[3].y) / 2
            };
            ctx.fillText('N', nCenter.x, nCenter.y);
            ctx.fillText('S', sCenter.x, sCenter.y);
            ctx.shadowBlur = 0;

            ctx.restore();
        }

        this.updateBadge();
    };

    MagnetParticles.prototype.update = function (deltaTime) {
        this.simulatorRenderer.update(this.timeStep);
        this.drawOverlay(performance.now());
    };

    return MagnetParticles;
}());
