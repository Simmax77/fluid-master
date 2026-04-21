// ======================================================================
// flowengine.js — Flow Camera + Engine (render loop)
// ======================================================================
'use strict';

var FlowCamera = function (element) {
    var azimuth = FLOW_INITIAL_AZIMUTH, elevation = FLOW_INITIAL_ELEVATION;
    var lastMouseX = 0, lastMouseY = 0;
    var mouseDown = false;
    var viewMatrix = new Float32Array(16);

    this.getViewMatrix = function () { return viewMatrix; };
    this.getPosition = function () {
        var cp = new Float32Array(3);
        cp[0] = FLOW_CAMERA_DISTANCE * Math.sin(Math.PI / 2 - elevation) * Math.sin(-azimuth) + FLOW_CAMERA_ORBIT_POINT[0];
        cp[1] = FLOW_CAMERA_DISTANCE * Math.cos(Math.PI / 2 - elevation) + FLOW_CAMERA_ORBIT_POINT[1];
        cp[2] = FLOW_CAMERA_DISTANCE * Math.sin(Math.PI / 2 - elevation) * Math.cos(-azimuth) + FLOW_CAMERA_ORBIT_POINT[2];
        return cp;
    };
    this.getViewDirection = function () {
        var vd = new Float32Array(3);
        vd[0] = -Math.sin(Math.PI / 2 - elevation) * Math.sin(-azimuth);
        vd[1] = -Math.cos(Math.PI / 2 - elevation);
        vd[2] = -Math.sin(Math.PI / 2 - elevation) * Math.cos(-azimuth);
        return vd;
    };

    var recomputeViewMatrix = function () {
        var xRot = new Float32Array(16), yRot = new Float32Array(16),
            distT = flowMakeIdentityMatrix(new Float32Array(16)),
            orbitT = flowMakeIdentityMatrix(new Float32Array(16));
        flowMakeIdentityMatrix(viewMatrix);
        flowMakeXRotationMatrix(xRot, elevation);
        flowMakeYRotationMatrix(yRot, azimuth);
        distT[14] = -FLOW_CAMERA_DISTANCE;
        orbitT[12] = -FLOW_CAMERA_ORBIT_POINT[0];
        orbitT[13] = -FLOW_CAMERA_ORBIT_POINT[1];
        orbitT[14] = -FLOW_CAMERA_ORBIT_POINT[2];
        flowPremultiplyMatrix(viewMatrix, viewMatrix, orbitT);
        flowPremultiplyMatrix(viewMatrix, viewMatrix, yRot);
        flowPremultiplyMatrix(viewMatrix, viewMatrix, xRot);
        flowPremultiplyMatrix(viewMatrix, viewMatrix, distT);
    };

    element.addEventListener('mousedown', function (event) {
        mouseDown = true;
        lastMouseX = flowGetMousePosition(event, element).x;
        lastMouseY = flowGetMousePosition(event, element).y;
    });
    document.addEventListener('mouseup', function () { mouseDown = false; });
    element.addEventListener('mousemove', function (event) {
        if (mouseDown) {
            var mx = flowGetMousePosition(event, element).x;
            var my = flowGetMousePosition(event, element).y;
            azimuth += (mx - lastMouseX) * FLOW_CAMERA_SENSITIVITY;
            elevation += (my - lastMouseY) * FLOW_CAMERA_SENSITIVITY;
            if (elevation < FLOW_MIN_ELEVATION) elevation = FLOW_MIN_ELEVATION;
            else if (elevation > FLOW_MAX_ELEVATION) elevation = FLOW_MAX_ELEVATION;
            recomputeViewMatrix();
            lastMouseX = mx; lastMouseY = my;
            element.style.cursor = 'grabbing';
        } else {
            element.style.cursor = 'grab';
        }
    });

    element.addEventListener('touchstart', function (event) {
        mouseDown = true;
        lastMouseX = flowGetMousePosition(event, element).x;
        lastMouseY = flowGetMousePosition(event, element).y;
    }, {passive: false});
    document.addEventListener('touchend', function () { mouseDown = false; });
    element.addEventListener('touchmove', function (event) {
        if (mouseDown) {
            var mx = flowGetMousePosition(event, element).x;
            var my = flowGetMousePosition(event, element).y;
            azimuth += (mx - lastMouseX) * FLOW_CAMERA_SENSITIVITY;
            elevation += (my - lastMouseY) * FLOW_CAMERA_SENSITIVITY;
            if (elevation < FLOW_MIN_ELEVATION) elevation = FLOW_MIN_ELEVATION;
            else if (elevation > FLOW_MAX_ELEVATION) elevation = FLOW_MAX_ELEVATION;
            recomputeViewMatrix();
            lastMouseX = mx; lastMouseY = my;
            element.style.cursor = 'grabbing';
        } else {
            element.style.cursor = 'grab';
        }
    }, {passive: false});
    recomputeViewMatrix();
};

// ── Flow Engine ──
var FlowEngine = function (canvas) {
    var gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true })
              || canvas.getContext('experimental-webgl', { premultipliedAlpha: false, alpha: true });
    gl.getExtension('OES_texture_float');
    gl.clearColor(0.0, 0.0, 0.0, 0.0);

    var maxPC = FLOW_QUALITY_LEVELS[FLOW_QUALITY_LEVELS.length - 1].resolution[0] * FLOW_QUALITY_LEVELS[FLOW_QUALITY_LEVELS.length - 1].resolution[1];
    var rnd = [], rndSP = [];
    for (var i = 0; i < maxPC; i++) { rnd[i] = Math.random(); rndSP.push(flowRandomPointInSphere()); }

    var pvBuffers = [], spawnTextures = [];
    for (var i = 0; i < FLOW_QUALITY_LEVELS.length; i++) {
        var w = FLOW_QUALITY_LEVELS[i].resolution[0], h = FLOW_QUALITY_LEVELS[i].resolution[1], cnt = w * h;
        pvBuffers[i] = gl.createBuffer();
        var ptc = new Float32Array(w * h * 2);
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
            ptc[(y * w + x) * 2] = (x + 0.5) / w;
            ptc[(y * w + x) * 2 + 1] = (y + 0.5) / h;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, pvBuffers[i]);
        gl.bufferData(gl.ARRAY_BUFFER, ptc, gl.STATIC_DRAW);

        var sd = new Float32Array(cnt * 4);
        for (var j = 0; j < cnt; j++) {
            sd[j*4] = rndSP[j][0] * FLOW_SPAWN_RADIUS;
            sd[j*4+1] = rndSP[j][1] * FLOW_SPAWN_RADIUS;
            sd[j*4+2] = rndSP[j][2] * FLOW_SPAWN_RADIUS;
            sd[j*4+3] = FLOW_BASE_LIFETIME + rnd[j] * FLOW_MAX_ADDITIONAL_LIFETIME;
        }
        spawnTextures[i] = flowBuildTexture(gl, 0, gl.RGBA, gl.FLOAT, w, h, sd, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE, gl.NEAREST, gl.NEAREST);
    }

    var offsetData = new Float32Array(maxPC * 4);
    for (var i = 0; i < maxPC; i++) {
        offsetData[i*4] = rndSP[i][0] * FLOW_OFFSET_RADIUS;
        offsetData[i*4+1] = rndSP[i][1] * FLOW_OFFSET_RADIUS;
        offsetData[i*4+2] = rndSP[i][2] * FLOW_OFFSET_RADIUS;
    }
    var offsetTexture = flowBuildTexture(gl, 0, gl.RGBA, gl.FLOAT,
        FLOW_QUALITY_LEVELS[FLOW_QUALITY_LEVELS.length-1].resolution[0],
        FLOW_QUALITY_LEVELS[FLOW_QUALITY_LEVELS.length-1].resolution[1],
        offsetData, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE, gl.NEAREST, gl.NEAREST);

    var pcW = 0, pcH = 0, pCount = 0, pDiam = 0, pAlpha = 0;
    var changing = false, oldDiam, oldW, oldH;
    var pTexA = flowBuildTexture(gl, 0, gl.RGBA, gl.FLOAT, 1, 1, null, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE, gl.NEAREST, gl.NEAREST);
    var pTexB = flowBuildTexture(gl, 0, gl.RGBA, gl.FLOAT, 1, 1, null, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE, gl.NEAREST, gl.NEAREST);

    var camera = new FlowCamera(canvas);
    var projMatrix = flowMakePerspectiveMatrix(new Float32Array(16), FLOW_PROJECTION_FOV, FLOW_ASPECT_RATIO, FLOW_PROJECTION_NEAR, FLOW_PROJECTION_FAR);
    var lightVM = new Float32Array(16);
    flowMakeLookAtMatrix(lightVM, [0,0,0], FLOW_LIGHT_DIRECTION, FLOW_LIGHT_UP_VECTOR);
    var lightPM = flowMakeOrthographicMatrix(new Float32Array(16), FLOW_LIGHT_PROJECTION_LEFT, FLOW_LIGHT_PROJECTION_RIGHT, FLOW_LIGHT_PROJECTION_BOTTOM, FLOW_LIGHT_PROJECTION_TOP, FLOW_LIGHT_PROJECTION_NEAR, FLOW_LIGHT_PROJECTION_FAR);
    var lightVPM = new Float32Array(16);
    flowPremultiplyMatrix(lightVPM, lightVM, lightPM);

    var hue = 0, timeScale = FLOW_INITIAL_SPEED, persistence = FLOW_INITIAL_TURBULENCE;
    var noisePositionScale = FLOW_NOISE_POSITION_SCALE;
    var colorMode = 0; // 0=solid, 1=velocity, 2=rainbow
    var paused = false;

    this.setHue = function (h) { hue = h; };
    this.setTimeScale = function (v) { timeScale = v; };
    this.setPersistence = function (v) { persistence = v; };
    this.setNoiseScale = function (v) { noisePositionScale = v; };
    this.setColorMode = function (m) { colorMode = m; };
    this.setPaused = function (p) { paused = p; };
    this.isPaused = function () { return paused; };

    var resampleFB = gl.createFramebuffer();
    var qualityLevel = -1, pvBuffer, spawnTex;

    this.changeQualityLevel = function (newLevel) {
        qualityLevel = newLevel;
        pAlpha = FLOW_QUALITY_LEVELS[qualityLevel].alpha;
        changing = true;
        oldDiam = pDiam;
        pDiam = FLOW_QUALITY_LEVELS[qualityLevel].diameter;
        oldW = pcW; oldH = pcH;
        pcW = FLOW_QUALITY_LEVELS[qualityLevel].resolution[0];
        pcH = FLOW_QUALITY_LEVELS[qualityLevel].resolution[1];
        pCount = pcW * pcH;
    };
    this.changeQualityLevel(0);

    var totalSS = (flowLog2(pCount) * (flowLog2(pCount) + 1)) / 2;
    var ssLeft = totalSS, sortPass = -1, sortStage = -1;

    var opacityTex = flowBuildTexture(gl, 0, gl.RGBA, gl.UNSIGNED_BYTE, FLOW_OPACITY_TEXTURE_RESOLUTION, FLOW_OPACITY_TEXTURE_RESOLUTION, null, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE, gl.LINEAR, gl.LINEAR);
    var simFB = gl.createFramebuffer(), sortFB = gl.createFramebuffer();
    var opacityFB = flowBuildFramebuffer(gl, opacityTex);

    var simProg = flowBuildProgramWrapper(gl, flowBuildShader(gl, gl.VERTEX_SHADER, FLOW_SIM_VERT), flowBuildShader(gl, gl.FRAGMENT_SHADER, FLOW_SIM_FRAG), {'a_position': 0});
    var renderProg = flowBuildProgramWrapper(gl, flowBuildShader(gl, gl.VERTEX_SHADER, FLOW_RENDER_VERT), flowBuildShader(gl, gl.FRAGMENT_SHADER, FLOW_RENDER_FRAG), {'a_textureCoordinates': 0});
    var opacityProg = flowBuildProgramWrapper(gl, flowBuildShader(gl, gl.VERTEX_SHADER, FLOW_OPACITY_VERT), flowBuildShader(gl, gl.FRAGMENT_SHADER, FLOW_OPACITY_FRAG), {'a_textureCoordinates': 0});
    var sortProg = flowBuildProgramWrapper(gl, flowBuildShader(gl, gl.VERTEX_SHADER, FLOW_SORT_VERT), flowBuildShader(gl, gl.FRAGMENT_SHADER, FLOW_SORT_FRAG), {'a_position': 0});
    var resampleProg = flowBuildProgramWrapper(gl, flowBuildShader(gl, gl.VERTEX_SHADER, FLOW_RESAMPLE_VERT), flowBuildShader(gl, gl.FRAGMENT_SHADER, FLOW_RESAMPLE_FRAG), {'a_position': 0});
    var floorProg = flowBuildProgramWrapper(gl, flowBuildShader(gl, gl.VERTEX_SHADER, FLOW_FLOOR_VERT), flowBuildShader(gl, gl.FRAGMENT_SHADER, FLOW_FLOOR_FRAG), {'a_vertexPosition': 0});
    var bgProg = flowBuildProgramWrapper(gl, flowBuildShader(gl, gl.VERTEX_SHADER, FLOW_BG_VERT), flowBuildShader(gl, gl.FRAGMENT_SHADER, FLOW_BG_FRAG), {'a_position': 0});

    var fsBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, fsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);

    var floorBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, floorBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        FLOW_FLOOR_ORIGIN[0], FLOW_FLOOR_ORIGIN[1], FLOW_FLOOR_ORIGIN[2],
        FLOW_FLOOR_ORIGIN[0], FLOW_FLOOR_ORIGIN[1], FLOW_FLOOR_ORIGIN[2] + FLOW_FLOOR_HEIGHT,
        FLOW_FLOOR_ORIGIN[0] + FLOW_FLOOR_WIDTH, FLOW_FLOOR_ORIGIN[1], FLOW_FLOOR_ORIGIN[2],
        FLOW_FLOOR_ORIGIN[0] + FLOW_FLOOR_WIDTH, FLOW_FLOOR_ORIGIN[1], FLOW_FLOOR_ORIGIN[2] + FLOW_FLOOR_HEIGHT
    ]), gl.STATIC_DRAW);

    var onresize = function () {
        flowMakePerspectiveMatrix(projMatrix, FLOW_PROJECTION_FOV, window.innerWidth / window.innerHeight, FLOW_PROJECTION_NEAR, FLOW_PROJECTION_FAR);
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onresize);
    onresize();

    var firstFrame = true, flipped = false, lastTime = 0;

    // FPS tracking
    var frameCount = 0, fpsTime = 0, currentFPS = 0;
    this.getFPS = function () { return currentFPS; };

    var render = function render(currentTime) {
        // FPS
        frameCount++;
        if (currentTime - fpsTime >= 1000) {
            currentFPS = Math.round(frameCount * 1000 / (currentTime - fpsTime));
            frameCount = 0;
            fpsTime = currentTime;
        }

        var dt = (currentTime - lastTime) / 1000 || 0;
        lastTime = currentTime;
        if (dt > FLOW_MAX_DELTA_TIME) dt = 0;
        if (paused) dt = 0;

        if (changing) {
            dt = 0; changing = false;
            pvBuffer = pvBuffers[qualityLevel];
            spawnTex = spawnTextures[qualityLevel];
            totalSS = (flowLog2(pCount) * (flowLog2(pCount) + 1)) / 2;
            ssLeft = totalSS; sortPass = -1; sortStage = -1;

            if (oldH === 0 && oldW === 0) {
                var pd = new Float32Array(pCount * 4);
                for (var i = 0; i < pCount; i++) {
                    var p = flowRandomPointInSphere();
                    pd[i*4] = p[0]*FLOW_SPAWN_RADIUS; pd[i*4+1] = p[1]*FLOW_SPAWN_RADIUS;
                    pd[i*4+2] = p[2]*FLOW_SPAWN_RADIUS; pd[i*4+3] = Math.random()*FLOW_BASE_LIFETIME;
                }
                gl.bindTexture(gl.TEXTURE_2D, pTexA);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pcW, pcH, 0, gl.RGBA, gl.FLOAT, pd);
                gl.bindTexture(gl.TEXTURE_2D, pTexB);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pcW, pcH, 0, gl.RGBA, gl.FLOAT, null);
            } else {
                gl.bindTexture(gl.TEXTURE_2D, pTexB);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pcW, pcH, 0, gl.RGBA, gl.FLOAT, null);
                gl.enableVertexAttribArray(0);
                gl.bindBuffer(gl.ARRAY_BUFFER, fsBuf);
                gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
                gl.useProgram(resampleProg.program);
                gl.uniform1i(resampleProg.uniformLocations['u_particleTexture'], 0);
                gl.uniform1i(resampleProg.uniformLocations['u_offsetTexture'], 1);
                gl.uniform1f(resampleProg.uniformLocations['u_offsetScale'], pCount > oldW * oldH ? oldDiam : 0);
                gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pTexA);
                gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, offsetTexture);
                gl.bindFramebuffer(gl.FRAMEBUFFER, resampleFB);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pTexB, 0);
                gl.viewport(0, 0, pcW, pcH);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                gl.bindTexture(gl.TEXTURE_2D, pTexA);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pcW, pcH, 0, gl.RGBA, gl.FLOAT, null);
                var tmp = pTexA; pTexA = pTexB; pTexB = tmp;
            }
        }

        var flippedThisFrame = false;
        var viewDir = camera.getViewDirection();
        var halfVec;
        if (flowDotVectors(viewDir, FLOW_LIGHT_DIRECTION) > 0.0) {
            halfVec = new Float32Array([FLOW_LIGHT_DIRECTION[0]+viewDir[0], FLOW_LIGHT_DIRECTION[1]+viewDir[1], FLOW_LIGHT_DIRECTION[2]+viewDir[2]]);
            flowNormalizeVector(halfVec, halfVec);
            if (flipped) flippedThisFrame = true;
            flipped = false;
        } else {
            halfVec = new Float32Array([FLOW_LIGHT_DIRECTION[0]-viewDir[0], FLOW_LIGHT_DIRECTION[1]-viewDir[1], FLOW_LIGHT_DIRECTION[2]-viewDir[2]]);
            flowNormalizeVector(halfVec, halfVec);
            if (!flipped) flippedThisFrame = true;
            flipped = true;
        }

        gl.disable(gl.DEPTH_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Simulation
        for (var i = 0; i < (firstFrame ? FLOW_BASE_LIFETIME / FLOW_PRESIMULATION_DELTA_TIME : 1); i++) {
            gl.enableVertexAttribArray(0);
            gl.bindBuffer(gl.ARRAY_BUFFER, fsBuf);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            gl.useProgram(simProg.program);
            gl.uniform2f(simProg.uniformLocations['u_resolution'], pcW, pcH);
            gl.uniform1f(simProg.uniformLocations['u_deltaTime'], firstFrame ? FLOW_PRESIMULATION_DELTA_TIME : dt * timeScale);
            gl.uniform1f(simProg.uniformLocations['u_time'], firstFrame ? FLOW_PRESIMULATION_DELTA_TIME : currentTime);
            gl.uniform1i(simProg.uniformLocations['u_particleTexture'], 0);
            gl.uniform1f(simProg.uniformLocations['u_persistence'], persistence);
            gl.uniform1f(simProg.uniformLocations['u_noisePositionScale'], noisePositionScale);
            gl.uniform1i(simProg.uniformLocations['u_spawnTexture'], 1);
            gl.disable(gl.BLEND);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, spawnTex);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pTexA);
            gl.bindFramebuffer(gl.FRAMEBUFFER, simFB);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pTexB, 0);
            var tmp = pTexA; pTexA = pTexB; pTexB = tmp;
            gl.viewport(0, 0, pcW, pcH);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            if (firstFrame) gl.flush();
        }
        firstFrame = false;

        // Sort
        gl.disable(gl.BLEND);
        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, fsBuf);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        if (flippedThisFrame) { sortPass = -1; sortStage = -1; ssLeft = totalSS; }
        for (var i = 0; i < (flippedThisFrame ? totalSS : FLOW_SORT_PASSES_PER_FRAME); i++) {
            sortPass--;
            if (sortPass < 0) { sortStage++; sortPass = sortStage; }
            gl.useProgram(sortProg.program);
            gl.uniform1i(sortProg.uniformLocations['u_dataTexture'], 0);
            gl.uniform2f(sortProg.uniformLocations['u_resolution'], pcW, pcH);
            gl.uniform1f(sortProg.uniformLocations['pass'], 1 << sortPass);
            gl.uniform1f(sortProg.uniformLocations['stage'], 1 << sortStage);
            gl.uniform3fv(sortProg.uniformLocations['u_halfVector'], halfVec);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pTexA);
            gl.bindFramebuffer(gl.FRAMEBUFFER, sortFB);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pTexB, 0);
            gl.viewport(0, 0, pcW, pcH);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            var tmp = pTexA; pTexA = pTexB; pTexB = tmp;
            ssLeft--;
            if (ssLeft === 0) { ssLeft = totalSS; sortPass = -1; sortStage = -1; }
        }

        // Opacity + Render (sliced)
        gl.bindFramebuffer(gl.FRAMEBUFFER, opacityFB);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        var colorRGB = flowHsvToRGB(hue, FLOW_PARTICLE_SATURATION, FLOW_PARTICLE_VALUE);

        for (var i = 0; i < FLOW_SLICES; i++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.useProgram(renderProg.program);
            gl.uniform1i(renderProg.uniformLocations['u_particleTexture'], 0);
            gl.uniform1i(renderProg.uniformLocations['u_opacityTexture'], 1);
            gl.uniformMatrix4fv(renderProg.uniformLocations['u_viewMatrix'], false, camera.getViewMatrix());
            gl.uniformMatrix4fv(renderProg.uniformLocations['u_projectionMatrix'], false, projMatrix);
            gl.uniformMatrix4fv(renderProg.uniformLocations['u_lightViewProjectionMatrix'], false, lightVPM);
            gl.uniform1f(renderProg.uniformLocations['u_particleDiameter'], pDiam);
            gl.uniform1f(renderProg.uniformLocations['u_screenWidth'], canvas.width);
            gl.uniform1f(renderProg.uniformLocations['u_particleAlpha'], pAlpha);
            gl.uniform3f(renderProg.uniformLocations['u_particleColor'], colorRGB[0], colorRGB[1], colorRGB[2]);
            gl.uniform1i(renderProg.uniformLocations['u_colorMode'], colorMode);
            gl.uniform1f(renderProg.uniformLocations['u_hue'], hue);
            gl.uniform1i(renderProg.uniformLocations['u_flipped'], flipped ? 1 : 0);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pTexA);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, opacityTex);
            gl.enableVertexAttribArray(0);
            gl.bindBuffer(gl.ARRAY_BUFFER, pvBuffer);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            if (!flipped) {
                gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
                gl.blendFunc(gl.ONE_MINUS_DST_ALPHA, gl.ONE);
            } else {
                gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            }
            gl.drawArrays(gl.POINTS, i * (pCount / FLOW_SLICES), pCount / FLOW_SLICES);

            // Opacity pass
            gl.bindFramebuffer(gl.FRAMEBUFFER, opacityFB);
            gl.viewport(0, 0, FLOW_OPACITY_TEXTURE_RESOLUTION, FLOW_OPACITY_TEXTURE_RESOLUTION);
            gl.useProgram(opacityProg.program);
            gl.uniform1i(opacityProg.uniformLocations['u_particleTexture'], 0);
            gl.uniformMatrix4fv(opacityProg.uniformLocations['u_lightViewMatrix'], false, lightVM);
            gl.uniformMatrix4fv(opacityProg.uniformLocations['u_lightProjectionMatrix'], false, lightPM);
            gl.uniform1f(opacityProg.uniformLocations['u_particleDiameter'], pDiam);
            gl.uniform1f(opacityProg.uniformLocations['u_screenWidth'], FLOW_OPACITY_TEXTURE_RESOLUTION);
            gl.uniform1f(opacityProg.uniformLocations['u_particleAlpha'], pAlpha);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pTexA);
            gl.enableVertexAttribArray(0);
            gl.bindBuffer(gl.ARRAY_BUFFER, pvBuffer);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.drawArrays(gl.POINTS, i * (pCount / FLOW_SLICES), pCount / FLOW_SLICES);
        }

        // Floor
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(floorProg.program);
        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, floorBuf);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.uniformMatrix4fv(floorProg.uniformLocations['u_viewMatrix'], false, camera.getViewMatrix());
        gl.uniformMatrix4fv(floorProg.uniformLocations['u_projectionMatrix'], false, projMatrix);
        gl.uniformMatrix4fv(floorProg.uniformLocations['u_lightViewProjectionMatrix'], false, lightVPM);
        gl.uniform1i(floorProg.uniformLocations['u_opacityTexture'], 0);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, opacityTex);
        gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE_MINUS_DST_ALPHA, gl.ONE);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Background
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, fsBuf);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.useProgram(bgProg.program);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        requestAnimationFrame(render);
    };
    render();
};
