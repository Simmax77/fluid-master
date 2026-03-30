precision highp float;

varying vec2 v_coordinates;

uniform sampler2D u_positionTexture;
uniform sampler2D u_velocityTexture;
uniform sampler2D u_randomTexture;

uniform float u_timeStep;
uniform float u_frameNumber;
uniform vec2 u_particlesResolution;
uniform vec3 u_gridSize;
uniform vec3 u_windDirection;
uniform float u_windSpeed;

uniform int u_numObstacles;
uniform vec3 u_obstaclePos[8];
uniform int u_obstacleType[8];
uniform vec3 u_obstacleSize[8];
uniform float u_obstacleRotation[8];

// --- SDF primitives (same as wind_force.frag) ---

vec3 rotY(vec3 p, float a) {
    float c = cos(a); float s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

float sdBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

float sdTriPrism(vec3 p, vec2 h) {
    vec3 q = abs(p);
    return max(q.z - h.y, max(q.x * 0.866025 + p.y * 0.5, -p.y) - h.x * 0.5);
}

float sdEllipsoid(vec3 p, vec3 r) {
    float k0 = length(p / r);
    float k1 = length(p / (r * r));
    return k0 * (k0 - 1.0) / k1;
}

float computeSDF(vec3 localPos, int otype, vec3 size) {
    if (otype == 1) {
        return sdBox(localPos, size);
    } else if (otype == 2) {
        return sdSphere(localPos, size.x);
    } else if (otype == 3) {
        return sdTriPrism(localPos, vec2(size.x, size.z));
    } else if (otype == 4) {
        return sdEllipsoid(localPos, vec3(size.x * 1.8, size.y * 0.6, size.z));
    } else if (otype == 5) {
        vec3 rp = vec3(0.7071 * localPos.x + 0.7071 * localPos.z, localPos.y, -0.7071 * localPos.x + 0.7071 * localPos.z);
        return sdBox(rp, size * 0.7071);
    } else if (otype == 6) {
        return sdBox(localPos, vec3(size.x * 0.08, size.y, size.z));
    }
    return 1000.0;
}

void main() {
    vec3 position = texture2D(u_positionTexture, v_coordinates).rgb;
    vec3 velocity = texture2D(u_velocityTexture, v_coordinates).rgb;
    vec3 randomDir = texture2D(u_randomTexture, fract(v_coordinates + u_frameNumber / u_particlesResolution)).rgb;

    // RK2 advection
    vec3 halfPos = position + velocity * u_timeStep * 0.5;
    vec3 newPosition = position + velocity * u_timeStep;

    // Add slight random jitter for natural look
    newPosition += randomDir * 0.03 * u_timeStep * max(length(velocity), 1.0);

    // Push out of obstacles
    for (int i = 0; i < 8; i++) {
        if (i >= u_numObstacles) break;

        vec3 localPos = rotY(newPosition - u_obstaclePos[i], -u_obstacleRotation[i]);
        vec3 size = u_obstacleSize[i];
        int otype = u_obstacleType[i];

        float d = computeSDF(localPos, otype, size);

        if (d < 0.15) {
            // Compute normal
            float eps = 0.08;
            vec3 lp1 = rotY(newPosition + vec3(eps, 0.0, 0.0) - u_obstaclePos[i], -u_obstacleRotation[i]);
            vec3 lp2 = rotY(newPosition + vec3(0.0, eps, 0.0) - u_obstaclePos[i], -u_obstacleRotation[i]);
            vec3 lp3 = rotY(newPosition + vec3(0.0, 0.0, eps) - u_obstaclePos[i], -u_obstacleRotation[i]);

            float d1 = computeSDF(lp1, otype, size);
            float d2 = computeSDF(lp2, otype, size);
            float d3 = computeSDF(lp3, otype, size);

            vec3 normal = normalize(vec3(d1 - d, d2 - d, d3 - d) + 0.0001);

            // Push along normal to surface + margin
            newPosition += normal * (0.15 - d + 0.05);
        }
    }

    // Boundary: recycle particles that exit in wind direction
    // Determine primary wind axis
    float windDot = dot(newPosition / u_gridSize, u_windDirection);

    // If particle exits the downwind boundary, recycle to upwind side
    bool recycle = false;

    if (u_windDirection.x > 0.5 && newPosition.x > u_gridSize.x - 0.1) recycle = true;
    if (u_windDirection.x < -0.5 && newPosition.x < 0.1) recycle = true;
    if (u_windDirection.z > 0.5 && newPosition.z > u_gridSize.z - 0.1) recycle = true;
    if (u_windDirection.z < -0.5 && newPosition.z < 0.1) recycle = true;

    // Also recycle if exited from sides
    if (newPosition.x < -0.5 || newPosition.x > u_gridSize.x + 0.5) recycle = true;
    if (newPosition.z < -0.5 || newPosition.z > u_gridSize.z + 0.5) recycle = true;

    if (recycle) {
        // Respawn on upwind side with random Y and Z
        float ry = fract(sin(dot(v_coordinates, vec2(12.9898, 78.233)) + u_frameNumber * 0.1) * 43758.5453);
        float rz = fract(sin(dot(v_coordinates, vec2(93.9898, 67.345)) + u_frameNumber * 0.13) * 23421.631);

        if (u_windDirection.x > 0.5) {
            newPosition.x = 0.2 + ry * 1.0;
        } else if (u_windDirection.x < -0.5) {
            newPosition.x = u_gridSize.x - 0.2 - ry * 1.0;
        }

        newPosition.y = 0.5 + ry * (u_gridSize.y - 1.0);
        newPosition.z = 0.5 + rz * (u_gridSize.z - 1.0);
    }

    // Clamp to grid boundaries (with margin)
    newPosition.y = clamp(newPosition.y, 0.15, u_gridSize.y - 0.15);
    newPosition.z = clamp(newPosition.z, 0.15, u_gridSize.z - 0.15);
    newPosition.x = clamp(newPosition.x, 0.01, u_gridSize.x - 0.01);

    gl_FragColor = vec4(newPosition, 0.0);
}
