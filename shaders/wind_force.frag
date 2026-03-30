precision highp float;

varying vec2 v_coordinates;

uniform sampler2D u_positionTexture;
uniform sampler2D u_velocityTexture;

uniform float u_timeStep;
uniform vec3 u_windDirection;
uniform float u_windSpeed;
uniform float u_gravityY;
uniform vec3 u_gridSize;
uniform float u_frameNumber;

uniform int u_numObstacles;
uniform vec3 u_obstaclePos[8];
uniform int u_obstacleType[8];
uniform vec3 u_obstacleSize[8];
uniform float u_obstacleRotation[8];

// --- SDF primitives ---

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

// Compute SDF for obstacle at index i
// Must be inlined due to WebGL 1.0 dynamic indexing limitations
// We compute per-type SDF for a given local position and size
float computeSDF(vec3 localPos, int otype, vec3 size) {
    if (otype == 1) {
        return sdBox(localPos, size);
    } else if (otype == 2) {
        return sdSphere(localPos, size.x);
    } else if (otype == 3) {
        return sdTriPrism(localPos, vec2(size.x, size.z));
    } else if (otype == 4) {
        // Airfoil: elongated ellipsoid
        return sdEllipsoid(localPos, vec3(size.x * 1.8, size.y * 0.6, size.z));
    } else if (otype == 5) {
        // Diamond: box rotated 45 degrees in XZ
        vec3 rp = vec3(0.7071 * localPos.x + 0.7071 * localPos.z, localPos.y, -0.7071 * localPos.x + 0.7071 * localPos.z);
        return sdBox(rp, size * 0.7071);
    } else if (otype == 6) {
        // Flat plate: thin box
        return sdBox(localPos, vec3(size.x * 0.08, size.y, size.z));
    }
    return 1000.0;
}

// Simple hash for turbulence
float hash(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
}

float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i);
    float n100 = hash(i + vec3(1,0,0));
    float n010 = hash(i + vec3(0,1,0));
    float n110 = hash(i + vec3(1,1,0));
    float n001 = hash(i + vec3(0,0,1));
    float n101 = hash(i + vec3(1,0,1));
    float n011 = hash(i + vec3(0,1,1));
    float n111 = hash(i + vec3(1,1,1));
    return mix(
        mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
        mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
        f.z
    );
}

void main() {
    vec3 position = texture2D(u_positionTexture, v_coordinates).rgb;
    vec3 velocity = texture2D(u_velocityTexture, v_coordinates).rgb;

    float time = u_frameNumber / 60.0;

    // Wind drag: push toward wind direction at wind speed
    vec3 windTarget = u_windDirection * u_windSpeed;
    float dragCoeff = 2.5;
    velocity += (windTarget - velocity) * u_timeStep * dragCoeff;

    // Gravity
    velocity.y += u_gravityY * u_timeStep;

    // Add slight turbulence for natural look
    vec3 turbNoise = vec3(
        noise3D(position * 0.3 + vec3(time * 1.5, 0.0, 0.0)) - 0.5,
        noise3D(position * 0.3 + vec3(0.0, time * 1.5 + 50.0, 0.0)) - 0.5,
        noise3D(position * 0.3 + vec3(0.0, 0.0, time * 1.5 + 100.0)) - 0.5
    );
    velocity += turbNoise * u_windSpeed * 0.15 * u_timeStep;

    // Obstacle interaction - loop over all 8 slots
    for (int i = 0; i < 8; i++) {
        if (i >= u_numObstacles) break;

        vec3 localPos = rotY(position - u_obstaclePos[i], -u_obstacleRotation[i]);
        vec3 size = u_obstacleSize[i];
        int otype = u_obstacleType[i];

        float d = computeSDF(localPos, otype, size);
        float influenceRadius = max(size.x, max(size.y, size.z)) * 1.5 + 1.0;

        if (d < influenceRadius) {
            // Compute normal via finite differences
            float eps = 0.08;
            vec3 lp1 = rotY(position + vec3(eps, 0.0, 0.0) - u_obstaclePos[i], -u_obstacleRotation[i]);
            vec3 lp2 = rotY(position + vec3(0.0, eps, 0.0) - u_obstaclePos[i], -u_obstacleRotation[i]);
            vec3 lp3 = rotY(position + vec3(0.0, 0.0, eps) - u_obstaclePos[i], -u_obstacleRotation[i]);

            float d1 = computeSDF(lp1, otype, size);
            float d2 = computeSDF(lp2, otype, size);
            float d3 = computeSDF(lp3, otype, size);

            vec3 normal = normalize(vec3(d1 - d, d2 - d, d3 - d) + 0.0001);

            float vn = dot(velocity, normal);

            if (d < 0.3) {
                // Inside or very close: full deflection
                if (vn < 0.0) velocity -= vn * normal * 1.2;
                velocity += normal * max(0.3 - d, 0.0) * 30.0;
            } else {
                float influence = smoothstep(influenceRadius, 0.0, d);

                // Remove inward velocity component
                if (vn < 0.0) {
                    velocity -= vn * normal * influence * 0.9;
                }

                // Bernoulli: accelerate tangential flow
                vec3 tangent = velocity - normal * dot(velocity, normal);
                float tangentSpeed = length(tangent);
                if (tangentSpeed > 0.01) {
                    velocity += normalize(tangent) * tangentSpeed * influence * 0.4;
                }

                // Gentle push away from surface
                velocity += normal * influence * u_windSpeed * 0.3;
            }

            // Wake turbulence behind obstacle
            float behind = -dot(normalize(position - u_obstaclePos[i]), u_windDirection);
            if (behind > 0.2 && d < influenceRadius * 2.0) {
                float wakeFactor = behind * smoothstep(influenceRadius * 2.0, 0.0, d) * 0.5;
                velocity += turbNoise * u_windSpeed * wakeFactor;
            }
        }
    }

    // Damping
    velocity *= 0.997;

    gl_FragColor = vec4(velocity, 0.0);
}
