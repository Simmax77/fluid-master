precision highp float;

varying vec2 v_coordinates;

uniform sampler2D u_positionTexture;
uniform sampler2D u_velocityTexture;
uniform sampler2D u_randomTexture;

uniform float u_timeStep;
uniform float u_frameNumber;
uniform vec2 u_particlesResolution;
uniform vec3 u_gridSize;

uniform int u_numMagnets;
uniform vec3 u_magnetPos[4];
uniform float u_magnetRot[4];
uniform float u_magnetSize[4];

// --- Bar magnet SDF ---

vec2 rot2D(vec2 p, float a) {
    float c = cos(a); float s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float sdBar2D(vec2 p, float halfLen, float halfWidth) {
    vec2 d = abs(p) - vec2(halfLen, halfWidth);
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

void main() {
    vec3 position = texture2D(u_positionTexture, v_coordinates).rgb;
    vec3 velocity = texture2D(u_velocityTexture, v_coordinates).rgb;
    vec3 randomDir = texture2D(u_randomTexture, fract(v_coordinates + u_frameNumber / u_particlesResolution)).rgb;

    // Integrate position
    vec3 newPosition = position + velocity * u_timeStep;
    
    // Very subtle random jitter
    newPosition.x += randomDir.x * 0.002 * u_timeStep;
    newPosition.z += randomDir.z * 0.002 * u_timeStep;

    // Keep Y on the flat surface
    newPosition.y = clamp(newPosition.y, 0.2, 0.8);

    // Push out of bar magnet bodies
    for (int i = 0; i < 4; i++) {
        if (i >= u_numMagnets) break;

        float halfLen = u_magnetSize[i] * 0.5;
        float halfW = u_magnetSize[i] * 0.18;
        vec2 mCenter = vec2(u_magnetPos[i].x, u_magnetPos[i].z);
        vec2 localPos = rot2D(vec2(newPosition.x, newPosition.z) - mCenter, -u_magnetRot[i]);
        float sdf = sdBar2D(localPos, halfLen, halfW);

        if (sdf < 0.15) {
            float eps = 0.04;
            float dx = sdBar2D(localPos + vec2(eps, 0.0), halfLen, halfW) - sdf;
            float dy = sdBar2D(localPos + vec2(0.0, eps), halfLen, halfW) - sdf;
            vec2 n2D = normalize(vec2(dx, dy) + 0.0001);
            n2D = rot2D(n2D, u_magnetRot[i]);

            float pushDist = 0.15 - sdf + 0.08;
            newPosition.x += n2D.x * pushDist;
            newPosition.z += n2D.y * pushDist;
        }
    }

    // Boundary: keep inside the grid
    newPosition.x = clamp(newPosition.x, 0.2, u_gridSize.x - 0.2);
    newPosition.z = clamp(newPosition.z, 0.2, u_gridSize.z - 0.2);

    gl_FragColor = vec4(newPosition, 0.0);
}
