'use strict';

var MagnetSimulatorRenderer = (function () {
    function MagnetSimulatorRenderer(canvas, wgl, projectionMatrix, camera, gridDimensions, onLoaded) {
        this.canvas = canvas;
        this.wgl = wgl;
        this.projectionMatrix = projectionMatrix;
        this.camera = camera;

        wgl.getExtension('OES_texture_float');
        wgl.getExtension('OES_texture_float_linear');

        var rendererLoaded = false,
            simulatorLoaded = false;

        this.renderer = new Renderer(this.canvas, this.wgl, gridDimensions, (function () {
            rendererLoaded = true;
            if (rendererLoaded && simulatorLoaded) {
                start.call(this);
            }
        }).bind(this));

        this.simulator = new MagnetSimulator(this.wgl, (function () {
            simulatorLoaded = true;
            if (rendererLoaded && simulatorLoaded) {
                start.call(this);
            }
        }).bind(this));

        function start() {
            this.mouseX = 0;
            this.mouseY = 0;
            setTimeout(onLoaded, 1);
        }
    }

    MagnetSimulatorRenderer.prototype.onMouseMove = function (event) {
        var position = Utilities.getMousePosition(event, this.canvas);
        var normalizedX = position.x / this.canvas.clientWidth;
        var normalizedY = position.y / this.canvas.clientHeight;
        this.mouseX = normalizedX * 2.0 - 1.0;
        this.mouseY = (1.0 - normalizedY) * 2.0 - 1.0;
        this.camera.onMouseMove(event);
    };

    MagnetSimulatorRenderer.prototype.onMouseDown = function (event) {
        this.camera.onMouseDown(event);
    };

    MagnetSimulatorRenderer.prototype.onMouseUp = function (event) {
        this.camera.onMouseUp(event);
    };

    MagnetSimulatorRenderer.prototype.reset = function (particlesWidth, particlesHeight, particlePositions, gridSize, sphereRadius) {
        this.simulator.reset(particlesWidth, particlesHeight, particlePositions, gridSize);
        this.renderer.reset(particlesWidth, particlesHeight, sphereRadius);
    };

    MagnetSimulatorRenderer.prototype.update = function (timeStep) {
        if (!this.particleColor) {
            // Dark grey — iron filings color
            this.particleColor = [0.28, 0.28, 0.32];
        }

        this.simulator.simulate(timeStep);
        this.renderer.draw(this.simulator, this.projectionMatrix, this.camera.getViewMatrix(), this.particleColor);
    };

    MagnetSimulatorRenderer.prototype.onResize = function (event) {
        this.renderer.onResize(event);
    };

    return MagnetSimulatorRenderer;
}());
