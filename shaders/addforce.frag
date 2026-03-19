precision highp float;

varying vec2 v_coordinates;

uniform sampler2D u_velocityTexture;

uniform vec3 u_mouseVelocity;

uniform vec3 u_gridResolution;
uniform vec3 u_gridSize;

uniform vec3 u_mouseRayOrigin;
uniform vec3 u_mouseRayDirection;

uniform float u_timeStep;
uniform float u_gravityY;
uniform int u_explode;
uniform float u_explodeStrength;
uniform float u_frameNumber;

uniform int u_numSources;
uniform vec3 u_sourcePos[8];
uniform int u_sourceType[8]; // 1: Vortex, 2: Wind, 3: Repel, 4: Black Hole, 5: Fountain, 6: Turbulence, 7: Wave, 8: Magnet
uniform vec3 u_sourceDir[8]; // Used by directional sources like Wind
uniform float u_sourceStrength[8]; // Per-source strength multiplier


float kernel (vec3 position, float radius) {
    vec3 worldPosition = (position / u_gridResolution) * u_gridSize;

    float distanceToMouseRay = length(cross(u_mouseRayDirection, worldPosition - u_mouseRayOrigin));

    float normalizedDistance = max(0.0, distanceToMouseRay / radius);
    return smoothstep(1.0, 0.9, normalizedDistance);
}

// Simple pseudo-random hash for turbulence
float hash(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
}

// 3D noise for turbulence
float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep
    
    float n000 = hash(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));
    
    return mix(
        mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
        mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
        f.z
    );
}

void main () {
    vec3 velocity = texture2D(u_velocityTexture, v_coordinates).rgb;

    vec3 newVelocity = velocity + vec3(0.0, u_gravityY * u_timeStep, 0.0); //add gravity

    vec3 cellIndex = floor(get3DFragCoord(u_gridResolution + 1.0));
    vec3 xPosition = vec3(cellIndex.x, cellIndex.y + 0.5, cellIndex.z + 0.5);
    vec3 yPosition = vec3(cellIndex.x + 0.5, cellIndex.y, cellIndex.z + 0.5);
    vec3 zPosition = vec3(cellIndex.x + 0.5, cellIndex.y + 0.5, cellIndex.z);

    float mouseRadius = 5.0;
    vec3 kernelValues = vec3(kernel(xPosition, mouseRadius), kernel(yPosition, mouseRadius), kernel(zPosition, mouseRadius));

    newVelocity += u_mouseVelocity * kernelValues * 3.0 * smoothstep(0.0, 1.0 / 200.0, u_timeStep);

    if (u_explode == 1) {
        vec3 center = u_gridResolution * 0.5;
        vec3 dirX = xPosition - center;
        vec3 dirY = yPosition - center;
        vec3 dirZ = zPosition - center;
        
        float explodeRadius = 15.0;
        vec3 explodeKernel = vec3(
            smoothstep(explodeRadius, 0.0, length(dirX)),
            smoothstep(explodeRadius, 0.0, length(dirY)),
            smoothstep(explodeRadius, 0.0, length(dirZ))
        );
        newVelocity += vec3(normalize(dirX).x, normalize(dirY).y, normalize(dirZ).z) * u_explodeStrength * explodeKernel * u_timeStep;
    }

    float time = u_frameNumber / 60.0;

    for (int i = 0; i < 8; ++i) {
        if (i >= u_numSources) break;

        vec3 worldCenter = u_sourcePos[i];
        vec3 center = (worldCenter / u_gridSize) * u_gridResolution;

        int type = u_sourceType[i];
        vec3 dir = u_sourceDir[i];
        float strength = u_sourceStrength[i];

        if (type == 1) {
            // ========== VORTEX (Rankine-style) ==========
            float coreRadius = 3.0;
            float maxRadius = 18.0;
            float tangentialStrength = 1800.0 * strength;
            float suctionStrength = 600.0 * strength;
            float inwardStrength = 400.0 * strength;

            float dx_x = xPosition.x - center.x;
            float dz_x = xPosition.z - center.z;
            float dist_x = length(vec2(dx_x, dz_x));
            float dY_x = abs(xPosition.y - center.y);
            float yFalloff_x = smoothstep(maxRadius, 0.0, dY_x);
            float tangScale_x = dist_x < coreRadius 
                ? dist_x / coreRadius 
                : coreRadius / max(dist_x, 0.01);
            float radialFalloff_x = smoothstep(maxRadius, 0.0, dist_x);
            vec2 tang_x = dist_x > 0.01 ? normalize(vec2(-dz_x, dx_x)) : vec2(0.0);
            vec2 inward_x = dist_x > 0.01 ? normalize(vec2(-dx_x, -dz_x)) : vec2(0.0);
            float forceX = (tang_x.x * tangentialStrength * tangScale_x + inward_x.x * inwardStrength * radialFalloff_x) * yFalloff_x;

            float dx_y = yPosition.x - center.x;
            float dz_y = yPosition.z - center.z;
            float dist_y = length(vec2(dx_y, dz_y));
            float dY_y = abs(yPosition.y - center.y);
            float yFalloff_y = smoothstep(maxRadius, 0.0, dY_y);
            float suctionFalloff = smoothstep(maxRadius * 0.5, 0.0, dist_y);
            float forceY = -suctionStrength * suctionFalloff * yFalloff_y;

            float dx_z = zPosition.x - center.x;
            float dz_z = zPosition.z - center.z;
            float dist_z = length(vec2(dx_z, dz_z));
            float dY_z = abs(zPosition.y - center.y);
            float yFalloff_z = smoothstep(maxRadius, 0.0, dY_z);
            float tangScale_z = dist_z < coreRadius 
                ? dist_z / coreRadius 
                : coreRadius / max(dist_z, 0.01);
            float radialFalloff_z = smoothstep(maxRadius, 0.0, dist_z);
            vec2 tang_z = dist_z > 0.01 ? normalize(vec2(-dz_z, dx_z)) : vec2(0.0);
            vec2 inward_z = dist_z > 0.01 ? normalize(vec2(-dx_z, -dz_z)) : vec2(0.0);
            float forceZ = (tang_z.y * tangentialStrength * tangScale_z + inward_z.y * inwardStrength * radialFalloff_z) * yFalloff_z;

            newVelocity += vec3(forceX, forceY, forceZ) * u_timeStep;

        } else if (type == 2) {
            // ========== WIND (realistic directional with turbulence) ==========
            float windRadius = 12.0;
            float coneAngle = 0.4;
            float baseForce = 3000.0 * strength;

            vec3 toX = xPosition - center;
            vec3 toY = yPosition - center;
            vec3 toZ = zPosition - center;

            float projX = dot(toX, dir);
            float projY = dot(toY, dir);
            float projZ = dot(toZ, dir);

            vec3 perpX = toX - dir * projX;
            vec3 perpY = toY - dir * projY;
            vec3 perpZ = toZ - dir * projZ;

            float coneRadX = max(2.0, abs(projX) * coneAngle + 2.0);
            float coneRadY = max(2.0, abs(projY) * coneAngle + 2.0);
            float coneRadZ = max(2.0, abs(projZ) * coneAngle + 2.0);

            float downstreamX = smoothstep(-1.0, 1.0, projX);
            float downstreamY = smoothstep(-1.0, 1.0, projY);
            float downstreamZ = smoothstep(-1.0, 1.0, projZ);

            float falloffX = smoothstep(coneRadX, 0.0, length(perpX)) * smoothstep(windRadius * 2.0, 0.0, abs(projX)) * downstreamX;
            float falloffY = smoothstep(coneRadY, 0.0, length(perpY)) * smoothstep(windRadius * 2.0, 0.0, abs(projY)) * downstreamY;
            float falloffZ = smoothstep(coneRadZ, 0.0, length(perpZ)) * smoothstep(windRadius * 2.0, 0.0, abs(projZ)) * downstreamZ;

            float turbX = (noise3D(xPosition * 0.3 + time * 2.0) - 0.5) * 0.3;
            float turbY = (noise3D(yPosition * 0.3 + time * 2.0 + 100.0) - 0.5) * 0.3;
            float turbZ = (noise3D(zPosition * 0.3 + time * 2.0 + 200.0) - 0.5) * 0.3;

            newVelocity.x += (dir.x + turbX) * baseForce * falloffX * u_timeStep;
            newVelocity.y += (dir.y + turbY) * baseForce * falloffY * u_timeStep;
            newVelocity.z += (dir.z + turbZ) * baseForce * falloffZ * u_timeStep;

        } else if (type == 3) {
            // ========== REPEL (smooth radial force field) ==========
            float repelRadius = 15.0;
            float force = 5000.0 * strength;

            vec3 dX = xPosition - center;
            vec3 dY = yPosition - center;
            vec3 dZ = zPosition - center;

            float lenX = length(dX);
            float lenY = length(dY);
            float lenZ = length(dZ);

            float falloffX = smoothstep(repelRadius, 0.0, lenX) * (1.0 / max(lenX * 0.3, 0.5));
            float falloffY = smoothstep(repelRadius, 0.0, lenY) * (1.0 / max(lenY * 0.3, 0.5));
            float falloffZ = smoothstep(repelRadius, 0.0, lenZ) * (1.0 / max(lenZ * 0.3, 0.5));

            newVelocity += vec3(
                lenX > 0.01 ? normalize(dX).x * force * falloffX : 0.0,
                lenY > 0.01 ? normalize(dY).y * force * falloffY : 0.0,
                lenZ > 0.01 ? normalize(dZ).z * force * falloffZ : 0.0
            ) * u_timeStep;

        } else if (type == 4) {
            // ========== BLACK HOLE (gravitational attraction + orbital) ==========
            float suckRadius = 25.0;
            float gravitationalForce = 4000.0 * strength;
            float orbitalForce = 1200.0 * strength;

            vec3 dX = center - xPosition;
            vec3 dY = center - yPosition;
            vec3 dZ = center - zPosition;

            float lenX = length(dX);
            float lenY = length(dY);
            float lenZ = length(dZ);

            float gravX = smoothstep(suckRadius, 0.0, lenX) * (1.0 / max(lenX * lenX * 0.02, 0.3));
            float gravY = smoothstep(suckRadius, 0.0, lenY) * (1.0 / max(lenY * lenY * 0.02, 0.3));
            float gravZ = smoothstep(suckRadius, 0.0, lenZ) * (1.0 / max(lenZ * lenZ * 0.02, 0.3));

            float radialX = lenX > 0.01 ? normalize(dX).x * gravitationalForce * gravX : 0.0;
            float radialY = lenY > 0.01 ? normalize(dY).y * gravitationalForce * gravY : 0.0;
            float radialZ = lenZ > 0.01 ? normalize(dZ).z * gravitationalForce * gravZ : 0.0;

            float dx_orb = xPosition.x - center.x;
            float dz_orb = xPosition.z - center.z;
            float dist_orb = length(vec2(dx_orb, dz_orb));
            vec2 tang_orb = dist_orb > 0.01 ? normalize(vec2(-dz_orb, dx_orb)) : vec2(0.0);
            float orbFalloff = smoothstep(suckRadius, 0.0, dist_orb);

            float dz_orbZ = zPosition.z - center.z;
            float dx_orbZ = zPosition.x - center.x;
            float dist_orbZ = length(vec2(dx_orbZ, dz_orbZ));
            vec2 tang_orbZ = dist_orbZ > 0.01 ? normalize(vec2(-dz_orbZ, dx_orbZ)) : vec2(0.0);
            float orbFalloffZ = smoothstep(suckRadius, 0.0, dist_orbZ);

            newVelocity += vec3(
                radialX + tang_orb.x * orbitalForce * orbFalloff,
                radialY,
                radialZ + tang_orbZ.y * orbitalForce * orbFalloffZ
            ) * u_timeStep;

        } else if (type == 5) {
            // ========== FOUNTAIN / GEYSER (powerful upward column) ==========
            float columnRadius = 4.0;
            float effectHeight = 20.0;
            float upForce = 6000.0 * strength;
            float spreadForce = 800.0 * strength;

            float dx_x = xPosition.x - center.x;
            float dz_x = xPosition.z - center.z;
            float cylDist_x = length(vec2(dx_x, dz_x));
            float heightAbove_x = xPosition.y - center.y;
            float columnFalloff_x = smoothstep(columnRadius, 0.0, cylDist_x);
            float spreadRadius = columnRadius + max(0.0, heightAbove_x) * 0.5;
            float spreadFalloff_x = smoothstep(spreadRadius, 0.0, cylDist_x);
            float heightFalloff_x = smoothstep(effectHeight, 0.0, abs(heightAbove_x));
            float spreadAmt = smoothstep(0.0, effectHeight * 0.5, heightAbove_x) * spreadFalloff_x;
            float forceX = (cylDist_x > 0.01 ? (dx_x / cylDist_x) * spreadForce * spreadAmt : 0.0);

            float dx_y = yPosition.x - center.x;
            float dz_y = yPosition.z - center.z;
            float cylDist_y = length(vec2(dx_y, dz_y));
            float columnFalloff_y = smoothstep(columnRadius, 0.0, cylDist_y);
            float heightAbove_y = yPosition.y - center.y;
            float heightFalloff_y = smoothstep(effectHeight, 0.0, abs(heightAbove_y));
            float upFalloff = smoothstep(effectHeight, 0.0, max(0.0, heightAbove_y));
            float forceY = upForce * columnFalloff_y * upFalloff;

            float dx_z = zPosition.x - center.x;
            float dz_z = zPosition.z - center.z;
            float cylDist_z = length(vec2(dx_z, dz_z));
            float heightAbove_z = zPosition.y - center.y;
            float spreadRadius_z = columnRadius + max(0.0, heightAbove_z) * 0.5;
            float spreadFalloff_z = smoothstep(spreadRadius_z, 0.0, cylDist_z);
            float spreadAmt_z = smoothstep(0.0, effectHeight * 0.5, heightAbove_z) * spreadFalloff_z;
            float forceZ = (cylDist_z > 0.01 ? (dz_z / cylDist_z) * spreadForce * spreadAmt_z : 0.0);

            newVelocity += vec3(forceX, forceY, forceZ) * u_timeStep;

        } else if (type == 6) {
            // ========== TURBULENCE (chaotic random forces) ==========
            float turbRadius = 15.0;
            float turbForce = 3500.0 * strength;
            float noiseScale = 0.25;
            float timeScale = 3.0;

            float distX = length(xPosition - center);
            float distY = length(yPosition - center);
            float distZ = length(zPosition - center);

            float falloffX = smoothstep(turbRadius, 0.0, distX);
            float falloffY = smoothstep(turbRadius, 0.0, distY);
            float falloffZ = smoothstep(turbRadius, 0.0, distZ);

            float nX = noise3D(xPosition * noiseScale + vec3(time * timeScale, 0.0, 0.0)) - 0.5;
            float nY = noise3D(yPosition * noiseScale + vec3(0.0, time * timeScale + 50.0, 0.0)) - 0.5;
            float nZ = noise3D(zPosition * noiseScale + vec3(0.0, 0.0, time * timeScale + 100.0)) - 0.5;

            float curlX = noise3D(xPosition * noiseScale * 0.5 + vec3(0.0, time * timeScale * 0.7, 37.0)) - 0.5;
            float curlY = noise3D(yPosition * noiseScale * 0.5 + vec3(time * timeScale * 0.7, 0.0, 73.0)) - 0.5;
            float curlZ = noise3D(zPosition * noiseScale * 0.5 + vec3(91.0, time * timeScale * 0.7, 0.0)) - 0.5;

            newVelocity += vec3(
                (nX + curlX) * turbForce * falloffX,
                (nY + curlY) * turbForce * falloffY,
                (nZ + curlZ) * turbForce * falloffZ
            ) * u_timeStep;

        } else if (type == 7) {
            // ========== WAVE GENERATOR (periodic sinusoidal ripples) ==========
            float waveRadius = 20.0;
            float waveForce = 2500.0 * strength;
            float frequency = 4.0;
            float waveSpeed = 8.0;
            float wavelength = waveSpeed / frequency;

            float distX = length(xPosition - center);
            float distY = length(yPosition - center);
            float distZ = length(zPosition - center);

            float falloffX = smoothstep(waveRadius, 0.0, distX);
            float falloffY = smoothstep(waveRadius, 0.0, distY);
            float falloffZ = smoothstep(waveRadius, 0.0, distZ);

            float omega = 2.0 * 3.14159 * frequency;
            float k = 2.0 * 3.14159 / wavelength;

            float waveX = sin(k * distX - omega * time);
            float waveY = sin(k * distY - omega * time);
            float waveZ = sin(k * distZ - omega * time);

            vec3 radDirX = distX > 0.01 ? normalize(xPosition - center) : vec3(0.0);
            vec3 radDirY = distY > 0.01 ? normalize(yPosition - center) : vec3(0.0);
            vec3 radDirZ = distZ > 0.01 ? normalize(zPosition - center) : vec3(0.0);

            newVelocity.x += (radDirX.x * waveX * waveForce * falloffX) * u_timeStep;
            newVelocity.y += waveY * waveForce * 0.6 * falloffY * u_timeStep;
            newVelocity.z += (radDirZ.z * waveZ * waveForce * falloffZ) * u_timeStep;

        } else if (type == 8) {
            // ========== MAGNET (gentle radial attraction, no orbital) ==========
            // Softer than black hole, purely radial inward pull with smooth falloff
            float magnetRadius = 20.0;
            float magnetForce = 2500.0 * strength;

            vec3 dX = center - xPosition;
            vec3 dY = center - yPosition;
            vec3 dZ = center - zPosition;

            float lenX = length(dX);
            float lenY = length(dY);
            float lenZ = length(dZ);

            // Smooth cubic falloff for gentle attraction
            float falloffX = smoothstep(magnetRadius, 0.0, lenX);
            float falloffY = smoothstep(magnetRadius, 0.0, lenY);
            float falloffZ = smoothstep(magnetRadius, 0.0, lenZ);

            // Gentle 1/r with floor to prevent singularity
            float scaleX = 1.0 / max(lenX * 0.15, 0.8);
            float scaleY = 1.0 / max(lenY * 0.15, 0.8);
            float scaleZ = 1.0 / max(lenZ * 0.15, 0.8);

            newVelocity += vec3(
                lenX > 0.01 ? normalize(dX).x * magnetForce * falloffX * scaleX : 0.0,
                lenY > 0.01 ? normalize(dY).y * magnetForce * falloffY * scaleY : 0.0,
                lenZ > 0.01 ? normalize(dZ).z * magnetForce * falloffZ * scaleZ : 0.0
            ) * u_timeStep;
        }
    }

    gl_FragColor = vec4(newVelocity * 1.0, 0.0);
}
