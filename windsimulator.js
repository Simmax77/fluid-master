'use strict';

var WindSimulator = (function () {

    function WindSimulator(wgl, onLoaded) {
        this.wgl = wgl;

        this.windDirection = [1.0, 0.0, 0.0];
        this.windSpeed = 8.0;
        this.gravityY = 0.0;
        this.obstacles = [];

        this.particlesWidth = 0;
        this.particlesHeight = 0;
        this.gridWidth = 0;
        this.gridHeight = 0;
        this.gridDepth = 0;

        this.frameNumber = 0;

        this.halfFloatExt = wgl.getExtension('OES_texture_half_float');
        wgl.getExtension('OES_texture_half_float_linear');

        this.quadVertexBuffer = wgl.createBuffer();
        wgl.bufferData(this.quadVertexBuffer, wgl.ARRAY_BUFFER,
            new Float32Array([-1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0]), wgl.STATIC_DRAW);

        this.simulationFramebuffer = wgl.createFramebuffer();

        this.particlePositionTexture = wgl.createTexture();
        this.particlePositionTextureTemp = wgl.createTexture();
        this.particleVelocityTexture = wgl.createTexture();
        this.particleVelocityTextureTemp = wgl.createTexture();
        this.particleRandomTexture = wgl.createTexture();

        wgl.createProgramsFromFiles({
            windForceProgram: {
                vertexShader: 'shaders/fullscreen.vert',
                fragmentShader: 'shaders/wind_force.frag',
                attributeLocations: { 'a_position': 0 }
            },
            windAdvectProgram: {
                vertexShader: 'shaders/fullscreen.vert',
                fragmentShader: 'shaders/wind_advect.frag',
                attributeLocations: { 'a_position': 0 }
            }
        }, (function (programs) {
            for (var name in programs) {
                this[name] = programs[name];
            }
            onLoaded();
        }).bind(this));
    }

    WindSimulator.prototype.reset = function (particlesWidth, particlesHeight, particlePositions, gridSize) {
        this.particlesWidth = particlesWidth;
        this.particlesHeight = particlesHeight;
        this.gridWidth = gridSize[0];
        this.gridHeight = gridSize[1];
        this.gridDepth = gridSize[2];

        var wgl = this.wgl;
        var count = particlesWidth * particlesHeight;

        var posData = new Float32Array(count * 4);
        var velData = new Float32Array(count * 4);
        var randData = new Float32Array(count * 4);

        for (var i = 0; i < count; i++) {
            posData[i * 4] = particlePositions[i][0];
            posData[i * 4 + 1] = particlePositions[i][1];
            posData[i * 4 + 2] = particlePositions[i][2];
            posData[i * 4 + 3] = 0.0;

            // Start with some wind velocity so particles are moving from frame 1
            velData[i * 4] = this.windDirection[0] * this.windSpeed * 0.5;
            velData[i * 4 + 1] = 0.0;
            velData[i * 4 + 2] = this.windDirection[2] * this.windSpeed * 0.5;
            velData[i * 4 + 3] = 0.0;

            var theta = Math.random() * 2.0 * Math.PI;
            var u = Math.random() * 2.0 - 1.0;
            randData[i * 4] = Math.sqrt(1.0 - u * u) * Math.cos(theta);
            randData[i * 4 + 1] = Math.sqrt(1.0 - u * u) * Math.sin(theta);
            randData[i * 4 + 2] = u;
            randData[i * 4 + 3] = 0.0;
        }

        wgl.rebuildTexture(this.particlePositionTexture, wgl.RGBA, wgl.FLOAT,
            particlesWidth, particlesHeight, posData,
            wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.NEAREST, wgl.NEAREST);
        wgl.rebuildTexture(this.particlePositionTextureTemp, wgl.RGBA, wgl.FLOAT,
            particlesWidth, particlesHeight, null,
            wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.NEAREST, wgl.NEAREST);

        wgl.rebuildTexture(this.particleVelocityTexture, wgl.RGBA, wgl.FLOAT,
            particlesWidth, particlesHeight, velData,
            wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.NEAREST, wgl.NEAREST);
        wgl.rebuildTexture(this.particleVelocityTextureTemp, wgl.RGBA, wgl.FLOAT,
            particlesWidth, particlesHeight, null,
            wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.NEAREST, wgl.NEAREST);

        wgl.rebuildTexture(this.particleRandomTexture, wgl.RGBA, wgl.FLOAT,
            particlesWidth, particlesHeight, randData,
            wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.NEAREST, wgl.NEAREST);
    };

    function swap(obj, a, b) {
        var t = obj[a]; obj[a] = obj[b]; obj[b] = t;
    }

    WindSimulator.prototype.setObstacleUniforms = function (drawState) {
        drawState.uniform1i('u_numObstacles', this.obstacles.length);
        for (var i = 0; i < 8; i++) {
            if (i < this.obstacles.length) {
                var o = this.obstacles[i];
                drawState.uniform3f('u_obstaclePos[' + i + ']', o.pos[0], o.pos[1], o.pos[2]);
                drawState.uniform1i('u_obstacleType[' + i + ']', o.type);
                drawState.uniform3f('u_obstacleSize[' + i + ']', o.size[0], o.size[1], o.size[2]);
                drawState.uniform1f('u_obstacleRotation[' + i + ']', o.rotation || 0.0);
            } else {
                drawState.uniform3f('u_obstaclePos[' + i + ']', 0, 0, 0);
                drawState.uniform1i('u_obstacleType[' + i + ']', 0);
                drawState.uniform3f('u_obstacleSize[' + i + ']', 0, 0, 0);
                drawState.uniform1f('u_obstacleRotation[' + i + ']', 0.0);
            }
        }
    };

    WindSimulator.prototype.simulate = function (timeStep) {
        if (timeStep === 0.0) return;

        this.frameNumber += 1;
        var wgl = this.wgl;

        // Pass 1: Update velocities
        wgl.framebufferTexture2D(this.simulationFramebuffer, wgl.FRAMEBUFFER,
            wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, this.particleVelocityTextureTemp, 0);

        var forceDS = wgl.createDrawState()
            .bindFramebuffer(this.simulationFramebuffer)
            .viewport(0, 0, this.particlesWidth, this.particlesHeight)
            .vertexAttribPointer(this.quadVertexBuffer, 0, 2, wgl.FLOAT, wgl.FALSE, 0, 0)
            .useProgram(this.windForceProgram)
            .uniformTexture('u_positionTexture', 0, wgl.TEXTURE_2D, this.particlePositionTexture)
            .uniformTexture('u_velocityTexture', 1, wgl.TEXTURE_2D, this.particleVelocityTexture)
            .uniform1f('u_timeStep', timeStep)
            .uniform3f('u_windDirection', this.windDirection[0], this.windDirection[1], this.windDirection[2])
            .uniform1f('u_windSpeed', this.windSpeed)
            .uniform1f('u_gravityY', this.gravityY)
            .uniform3f('u_gridSize', this.gridWidth, this.gridHeight, this.gridDepth)
            .uniform1f('u_frameNumber', this.frameNumber);

        this.setObstacleUniforms(forceDS);
        wgl.drawArrays(forceDS, wgl.TRIANGLE_STRIP, 0, 4);
        swap(this, 'particleVelocityTexture', 'particleVelocityTextureTemp');

        // Pass 2: Advect positions
        wgl.framebufferTexture2D(this.simulationFramebuffer, wgl.FRAMEBUFFER,
            wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, this.particlePositionTextureTemp, 0);

        var advectDS = wgl.createDrawState()
            .bindFramebuffer(this.simulationFramebuffer)
            .viewport(0, 0, this.particlesWidth, this.particlesHeight)
            .vertexAttribPointer(this.quadVertexBuffer, 0, 2, wgl.FLOAT, wgl.FALSE, 0, 0)
            .useProgram(this.windAdvectProgram)
            .uniformTexture('u_positionTexture', 0, wgl.TEXTURE_2D, this.particlePositionTexture)
            .uniformTexture('u_velocityTexture', 1, wgl.TEXTURE_2D, this.particleVelocityTexture)
            .uniformTexture('u_randomTexture', 2, wgl.TEXTURE_2D, this.particleRandomTexture)
            .uniform1f('u_timeStep', timeStep)
            .uniform1f('u_frameNumber', this.frameNumber)
            .uniform2f('u_particlesResolution', this.particlesWidth, this.particlesHeight)
            .uniform3f('u_gridSize', this.gridWidth, this.gridHeight, this.gridDepth)
            .uniform3f('u_windDirection', this.windDirection[0], this.windDirection[1], this.windDirection[2])
            .uniform1f('u_windSpeed', this.windSpeed);

        this.setObstacleUniforms(advectDS);
        wgl.drawArrays(advectDS, wgl.TRIANGLE_STRIP, 0, 4);
        swap(this, 'particlePositionTexture', 'particlePositionTextureTemp');
    };

    return WindSimulator;
}());
