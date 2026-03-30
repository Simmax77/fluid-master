'use strict';

var WindParticles = (function () {
    var FOV = Math.PI / 3;

    var GRID_WIDTH = 40,
        GRID_HEIGHT = 20,
        GRID_DEPTH = 20;

    var PARTICLES_PER_CELL = 10;

    var OBSTACLE_NAMES = ['None', 'Block', 'Ball', 'Triangle', 'Airfoil', 'Diamond', 'Flat Plate'];
    var OBSTACLE_EMOJIS = ['', '📦', '⚽', '🔺', '✈️', '💎', '🪧'];
    var OBSTACLE_COLORS = [
        'rgba(255,255,255,0.5)',
        'rgba(255,150,50,0.9)',
        'rgba(50,200,100,0.9)',
        'rgba(255,80,80,0.9)',
        'rgba(100,180,255,0.9)',
        'rgba(200,100,255,0.9)',
        'rgba(255,220,50,0.9)'
    ];

    function WindParticles() {
        var canvas = this.canvas = document.getElementById('canvas');
        var wgl = this.wgl = new WrappedGL(canvas);
        window.wgl = wgl;

        this.projectionMatrix = Utilities.makePerspectiveMatrix(new Float32Array(16), FOV, this.canvas.width / this.canvas.height, 0.1, 100.0);
        this.camera = new Camera(this.canvas, [GRID_WIDTH / 2, GRID_HEIGHT / 3, GRID_DEPTH / 2]);

        this.simulatorRenderer = new WindSimulatorRenderer(this.canvas, this.wgl, this.projectionMatrix, this.camera, [GRID_WIDTH, GRID_HEIGHT, GRID_DEPTH], (function () {
            start.call(this);
        }).bind(this));

        function start() {
            this.overlayCanvas = document.getElementById('overlay-canvas');
            this.overlayCtx = this.overlayCanvas ? this.overlayCanvas.getContext('2d') : null;

            this.timeStep = 1.0 / 60.0;
            this.obstacleSize = 2.5;
            this.activeTool = 0;

            // Wind speed slider
            this.windSpeedSlider = new Slider(document.getElementById('wind-speed-slider'), this.simulatorRenderer.simulator.windSpeed, 1.0, 25.0, (function (val) {
                this.simulatorRenderer.simulator.windSpeed = val;
            }).bind(this));

            // Particle size slider (sphere radius)
            this.sphereRadius = 0.35;
            this.sizeSlider = new Slider(document.getElementById('size-slider'), this.sphereRadius, 0.1, 0.8, (function (val) {
                this.sphereRadius = val;
            }).bind(this));

            // Obstacle size slider
            this.obstacleSizeSlider = new Slider(document.getElementById('obstacle-size-slider'), this.obstacleSize, 1.0, 6.0, (function (val) {
                this.obstacleSize = val;
            }).bind(this));

            // Color picker
            this.colorPicker = document.getElementById('color-picker');
            this.colorPicker.addEventListener('input', (function (e) {
                var hex = e.target.value;
                var r = parseInt(hex.substring(1, 3), 16) / 255.0;
                var g = parseInt(hex.substring(3, 5), 16) / 255.0;
                var b = parseInt(hex.substring(5, 7), 16) / 255.0;
                this.simulatorRenderer.particleColor = [r, g, b];
            }).bind(this));

            // Gravity button
            this.gravityMode = 1; // start with zero gravity
            this.gravityButton = document.getElementById('gravity-button');
            this.gravityButton.addEventListener('click', (function () {
                this.gravityMode = (this.gravityMode + 1) % 3;
                if (this.gravityMode === 0) {
                    this.gravityButton.textContent = 'Gravity: Normal';
                    this.simulatorRenderer.simulator.gravityY = -20.0;
                } else if (this.gravityMode === 1) {
                    this.gravityButton.textContent = 'Gravity: Zero';
                    this.simulatorRenderer.simulator.gravityY = 0.0;
                } else {
                    this.gravityButton.textContent = 'Gravity: Reverse';
                    this.simulatorRenderer.simulator.gravityY = 20.0;
                }
            }).bind(this));

            // Tool buttons
            this.toolButtons = {
                none: document.getElementById('tool-none-button'),
                block: document.getElementById('tool-block-button'),
                ball: document.getElementById('tool-ball-button'),
                triangle: document.getElementById('tool-triangle-button'),
                airfoil: document.getElementById('tool-airfoil-button'),
                diamond: document.getElementById('tool-diamond-button'),
                plate: document.getElementById('tool-plate-button')
            };
            this.toolTypes = { none: 0, block: 1, ball: 2, triangle: 3, airfoil: 4, diamond: 5, plate: 6 };

            this.clearButton = document.getElementById('clear-obstacles-button');
            this.obstacleBadge = document.getElementById('obstacle-count-badge');

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
                this.simulatorRenderer.simulator.obstacles = [];
                this.updateBadge();
            }).bind(this));

            // Initialize simulation immediately
            this.initSimulation();

            // Event listeners
            canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
            canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
            document.addEventListener('mouseup', this.onMouseUp.bind(this));
            window.addEventListener('resize', this.onResize.bind(this));
            this.onResize();

            // Camera bounds for wind tunnel view
            this.camera.setBounds(0, Math.PI / 2);

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

    WindParticles.prototype.initSimulation = function () {
        var particlesWidth = 512;
        var particleCount = particlesWidth * Math.ceil((GRID_WIDTH * GRID_HEIGHT * GRID_DEPTH * PARTICLES_PER_CELL * 0.25) / particlesWidth);
        var particlesHeight = Math.ceil(particleCount / particlesWidth);
        particleCount = particlesWidth * particlesHeight;

        var particlePositions = [];
        for (var i = 0; i < particleCount; i++) {
            particlePositions.push([
                Math.random() * GRID_WIDTH,
                Math.random() * GRID_HEIGHT,
                Math.random() * GRID_DEPTH
            ]);
        }

        var gridSize = [GRID_WIDTH, GRID_HEIGHT, GRID_DEPTH];
        this.simulatorRenderer.reset(particlesWidth, particlesHeight, particlePositions, gridSize, this.sphereRadius);
    };

    WindParticles.prototype.updateBadge = function () {
        if (this.obstacleBadge) {
            var count = this.simulatorRenderer.simulator.obstacles.length;
            this.obstacleBadge.textContent = count;
            if (count === 0) {
                this.obstacleBadge.classList.add('empty');
            } else {
                this.obstacleBadge.classList.remove('empty');
            }
        }
    };

    // Project world position to screen
    WindParticles.prototype.projectToScreen = function (worldPos) {
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

    // Raycast from screen to world (hit on Y plane at grid center)
    WindParticles.prototype.screenToWorld = function (screenX, screenY) {
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
        var planeY = GRID_HEIGHT / 2.0;
        var t = (planeY - camPos[1]) / worldRay[1];
        if (t > 0) {
            var hitPos = [
                camPos[0] + worldRay[0] * t,
                camPos[1] + worldRay[1] * t,
                camPos[2] + worldRay[2] * t
            ];
            hitPos[0] = Math.max(1, Math.min(GRID_WIDTH - 1, hitPos[0]));
            hitPos[2] = Math.max(1, Math.min(GRID_DEPTH - 1, hitPos[2]));
            return hitPos;
        }
        return null;
    };

    WindParticles.prototype.findObstacleNearScreen = function (screenX, screenY, threshold) {
        var obstacles = this.simulatorRenderer.simulator.obstacles;
        var bestDist = threshold;
        var bestIndex = -1;
        for (var i = 0; i < obstacles.length; i++) {
            var sp = this.projectToScreen(obstacles[i].pos);
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

    WindParticles.prototype.onResize = function () {
        var dpr = window.devicePixelRatio || 1;
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        Utilities.makePerspectiveMatrix(this.projectionMatrix, FOV, this.canvas.width / this.canvas.height, 0.1, 100.0);
        this.simulatorRenderer.onResize();
    };

    WindParticles.prototype.onMouseMove = function (event) {
        event.preventDefault();
        this.simulatorRenderer.onMouseMove(event);
    };

    WindParticles.prototype.onMouseDown = function (event) {
        event.preventDefault();
        var target = event.target;
        if (target.closest('#ui') || target.closest('#right-bar')) return;

        if (this.activeTool === 0) {
            // None tool: check for obstacle deletion, otherwise rotate camera
            var position = Utilities.getMousePosition(event, this.canvas);
            var idx = this.findObstacleNearScreen(position.x, position.y, 40);
            if (idx >= 0) {
                this.simulatorRenderer.simulator.obstacles.splice(idx, 1);
                this.updateBadge();
                return;
            }
            this.simulatorRenderer.onMouseDown(event);
            return;
        }

        // Place obstacle
        var position = Utilities.getMousePosition(event, this.canvas);
        var worldPos = this.screenToWorld(position.x, position.y);
        if (worldPos) {
            var s = this.obstacleSize;
            var sizeVec = [s, s, s];
            // Adjust sizes per type for better visuals
            if (this.activeTool === 1) sizeVec = [s, s, s]; // block
            else if (this.activeTool === 2) sizeVec = [s, s, s]; // ball (only .x used as radius)
            else if (this.activeTool === 3) sizeVec = [s, s * 1.2, s]; // triangle
            else if (this.activeTool === 4) sizeVec = [s * 1.5, s * 0.5, s]; // airfoil
            else if (this.activeTool === 5) sizeVec = [s, s, s]; // diamond
            else if (this.activeTool === 6) sizeVec = [s, s * 1.5, s]; // plate

            this.simulatorRenderer.simulator.obstacles.push({
                pos: worldPos,
                type: this.activeTool,
                size: sizeVec,
                rotation: 0.0
            });

            if (this.simulatorRenderer.simulator.obstacles.length > 8) {
                this.simulatorRenderer.simulator.obstacles.shift();
            }
            this.updateBadge();
        }
    };

    WindParticles.prototype.onMouseUp = function (event) {
        event.preventDefault();
        this.simulatorRenderer.onMouseUp(event);
    };

    // Draw overlay for obstacle indicators
    WindParticles.prototype.drawOverlay = function (time) {
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
        var obstacles = this.simulatorRenderer.simulator.obstacles;
        var t = (time || 0) / 1000.0;

        for (var i = 0; i < obstacles.length; i++) {
            var obs = obstacles[i];
            var sp = this.projectToScreen(obs.pos);
            if (!sp || sp.depth > 0) continue;

            var x = sp.x, y = sp.y;
            var color = OBSTACLE_COLORS[obs.type] || OBSTACLE_COLORS[0];

            ctx.save();
            ctx.translate(x, y);

            // Draw obstacle indicator based on type
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.7 + Math.sin(t * 2) * 0.15;

            if (obs.type === 1) {
                // Block - rectangle
                ctx.strokeRect(-12, -12, 24, 24);
            } else if (obs.type === 2) {
                // Ball - circle
                ctx.beginPath();
                ctx.arc(0, 0, 14, 0, Math.PI * 2);
                ctx.stroke();
            } else if (obs.type === 3) {
                // Triangle
                ctx.beginPath();
                ctx.moveTo(0, -14);
                ctx.lineTo(-12, 10);
                ctx.lineTo(12, 10);
                ctx.closePath();
                ctx.stroke();
            } else if (obs.type === 4) {
                // Airfoil - teardrop
                ctx.beginPath();
                ctx.ellipse(0, 0, 18, 8, 0, 0, Math.PI * 2);
                ctx.stroke();
            } else if (obs.type === 5) {
                // Diamond
                ctx.beginPath();
                ctx.moveTo(0, -14);
                ctx.lineTo(14, 0);
                ctx.lineTo(0, 14);
                ctx.lineTo(-14, 0);
                ctx.closePath();
                ctx.stroke();
            } else if (obs.type === 6) {
                // Flat plate - vertical line
                ctx.beginPath();
                ctx.moveTo(0, -16);
                ctx.lineTo(0, 16);
                ctx.stroke();
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(0, -16);
                ctx.lineTo(0, 16);
                ctx.stroke();
            }

            // Center dot
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        // Wind direction indicator (top-center)
        var windDir = this.simulatorRenderer.simulator.windDirection;
        var windSpd = this.simulatorRenderer.simulator.windSpeed;
        var cx = this.canvas.clientWidth / 2;
        var cy = 32;
        var arrowLen = 20 + windSpd * 1.5;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(100,200,255,0.8)';
        ctx.fillStyle = 'rgba(100,200,255,0.8)';
        ctx.lineWidth = 2;

        var angle = Math.atan2(-windDir[2], windDir[0]);
        ctx.rotate(angle);

        // Arrow shaft
        ctx.beginPath();
        ctx.moveTo(-arrowLen * 0.3, 0);
        ctx.lineTo(arrowLen, 0);
        ctx.stroke();

        // Arrow head
        ctx.beginPath();
        ctx.moveTo(arrowLen, 0);
        ctx.lineTo(arrowLen - 8, -4);
        ctx.lineTo(arrowLen - 8, 4);
        ctx.closePath();
        ctx.fill();

        // Label
        ctx.rotate(-angle);
        ctx.globalAlpha = 0.4;
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('WIND', 0, -12);

        ctx.restore();

        this.updateBadge();
    };

    WindParticles.prototype.update = function (deltaTime) {
        this.simulatorRenderer.update(this.timeStep);
        this.drawOverlay(performance.now());
    };

    return WindParticles;
}());
