precision highp float;

varying vec2 v_coordinates;

uniform sampler2D u_positionTexture;
uniform sampler2D u_velocityTexture;

uniform float u_timeStep;
uniform float u_fieldStrength;
uniform vec3 u_gridSize;
uniform float u_frameNumber;
uniform float u_interactionStrength;

uniform int u_numMagnets;
uniform vec3 u_magnetPos[8];
uniform float u_magnetRot[8];
uniform float u_magnetSize[8];

// ─── Constants ───
#define PI 3.14159265359
#define MU_OVER_4PI 1.0
#define NUM_FIELD_LINES 24.0

// ─── Helpers ───

vec2 rot2D(vec2 p, float a) {
    float c = cos(a), s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float sdBar2D(vec2 p, float halfLen, float halfWidth) {
    vec2 d = abs(p) - vec2(halfLen, halfWidth);
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// ─── Magnetic Dipole Field B(r) ───
// B(r) = μ₀/(4π) * ( 3r̂(m·r̂)/r³ − m/r³ )
// Full 3D dipole computation sampled on XZ plane

vec3 dipoleBField(vec3 pos, vec3 dipolePos, vec3 m) {
    vec3 r = pos - dipolePos;
    float rLen = length(r);
    float minR = 0.15;
    rLen = max(rLen, minR);

    vec3 rHat = r / rLen;
    float r3 = rLen * rLen * rLen;
    float mDotR = dot(m, rHat);
    return MU_OVER_4PI * (3.0 * rHat * mDotR - m) / r3;
}

// ─── Bar magnet: dipole + dual monopole poles ───

vec2 computeBarField2D(vec2 pos, vec2 magnetCenter, float rot, float size, float strength) {
    float halfLen = size * 0.5;

    // Pole positions in 2D
    vec2 pN = magnetCenter + rot2D(vec2(-halfLen, 0.0), rot);
    vec2 pS = magnetCenter + rot2D(vec2(halfLen, 0.0), rot);

    // Monopole contributions (proven to give great field lines)
    vec2 rN = pos - pN;
    vec2 rS = pos - pS;
    float dN = max(length(rN), size * 0.04);
    float dS = max(length(rS), size * 0.04);

    vec2 BfromN = strength * rN / (dN * dN * dN);
    vec2 BfromS = -strength * rS / (dS * dS * dS);

    vec2 B_monopole = BfromN + BfromS;

    // Add central dipole contribution for far-field accuracy
    vec2 axisDir = rot2D(vec2(1.0, 0.0), rot);
    vec3 m = vec3(axisDir.x, 0.0, axisDir.y) * strength * size * 0.5;
    vec3 pos3D = vec3(pos.x, 0.5, pos.y);
    vec3 center3D = vec3(magnetCenter.x, 0.5, magnetCenter.y);
    vec3 Bdipole = dipoleBField(pos3D, center3D, m);
    vec2 B_dipole = vec2(Bdipole.x, Bdipole.z);

    return B_monopole + B_dipole * 0.3;
}

// ─── Stream function for field line snapping ───
// ψ = θ_N − θ_S. Contours of constant ψ ARE the field lines.

float streamFunction(vec2 pos, vec2 pN, vec2 pS) {
    float thetaN = atan(pos.y - pN.y, pos.x - pN.x);
    float thetaS = atan(pos.y - pS.y, pos.x - pS.x);
    return thetaN - thetaS;
}

vec2 streamGradient(vec2 pos, vec2 pN, vec2 pS) {
    float eps = 0.05;
    float dx = streamFunction(pos + vec2(eps, 0.0), pN, pS) - streamFunction(pos - vec2(eps, 0.0), pN, pS);
    float dy = streamFunction(pos + vec2(0.0, eps), pN, pS) - streamFunction(pos - vec2(0.0, eps), pN, pS);
    return vec2(dx, dy) / (2.0 * eps);
}

void main() {
    vec3 position = texture2D(u_positionTexture, v_coordinates).rgb;
    vec4 velData = texture2D(u_velocityTexture, v_coordinates);
    vec3 velocity = velData.rgb;

    vec2 pos2D = vec2(position.x, position.z);
    vec2 vel2D = vec2(velocity.x, velocity.z);

    if (u_numMagnets == 0) {
        vel2D *= 0.90;
        gl_FragColor = vec4(vel2D.x, 0.0, vel2D.y, 0.0);
        return;
    }

    // ═══════════════════════════════════════════════════
    // 1. ACCUMULATE B FIELD FROM ALL MAGNETS
    // ═══════════════════════════════════════════════════

    vec2 totalB = vec2(0.0);
    for (int i = 0; i < 8; i++) {
        if (i >= u_numMagnets) break;
        vec2 mCenter = vec2(u_magnetPos[i].x, u_magnetPos[i].z);
        totalB += computeBarField2D(pos2D, mCenter, u_magnetRot[i], u_magnetSize[i], u_fieldStrength);
    }

    float Bmag = length(totalB);
    float fieldIntensity = clamp(Bmag / (u_fieldStrength * 2.0), 0.0, 1.0);

    if (Bmag > 0.0001) {
        vec2 Bdir = totalB / Bmag;

        // ═══════════════════════════════════════════════════
        // 2. FIELD LINE SNAPPING (stream function method)
        //    This creates the distinct curved field lines
        // ═══════════════════════════════════════════════════

        for (int i = 0; i < 8; i++) {
            if (i >= u_numMagnets) break;

            float halfLen = u_magnetSize[i] * 0.5;
            vec2 mCenter = vec2(u_magnetPos[i].x, u_magnetPos[i].z);
            vec2 pN = mCenter + rot2D(vec2(-halfLen, 0.0), u_magnetRot[i]);
            vec2 pS = mCenter + rot2D(vec2(halfLen, 0.0), u_magnetRot[i]);

            // Stream function value → quantize to nearest field line
            float psi = streamFunction(pos2D, pN, pS);
            float lineSpacing = PI / NUM_FIELD_LINES;
            float quantizedPsi = floor(psi / lineSpacing + 0.5) * lineSpacing;
            float psiError = psi - quantizedPsi;

            // Gradient of stream function (perpendicular to B)
            vec2 grad = streamGradient(pos2D, pN, pS);
            float gradMag = length(grad);

            if (gradMag > 0.001) {
                vec2 gradDir = grad / gradMag;
                // Snap force: push particle toward nearest field line contour
                float snapStrength = min(Bmag * 300.0, 800.0);
                vel2D -= gradDir * psiError * snapStrength * u_timeStep;
            }

            // ═══════════════════════════════════════════════════
            // 3. POLE ATTRACTION — dense clusters at pole tips
            // ═══════════════════════════════════════════════════

            vec2 toN = pN - pos2D;
            vec2 toS = pS - pos2D;
            float dN = length(toN);
            float dS = length(toS);

            float poleMin = u_magnetSize[i] * 0.05;
            float poleRange = u_magnetSize[i] * 6.0;

            if (dN > poleMin && dN < poleRange) {
                float f = u_fieldStrength * 30.0 / (dN * dN + 0.1);
                f = min(f, 250.0);
                vel2D += normalize(toN) * f * u_timeStep;
            }
            if (dS > poleMin && dS < poleRange) {
                float f = u_fieldStrength * 30.0 / (dS * dS + 0.1);
                f = min(f, 250.0);
                vel2D += normalize(toS) * f * u_timeStep;
            }

            // ═══════════════════════════════════════════════════
            // 4. BAR BODY REPULSION (SDF collision)
            // ═══════════════════════════════════════════════════

            vec2 localPos = rot2D(pos2D - mCenter, -u_magnetRot[i]);
            float barHalfW = u_magnetSize[i] * 0.18;
            float sdf = sdBar2D(localPos, halfLen, barHalfW);

            if (sdf < 1.0) {
                float eps = 0.04;
                float dx = sdBar2D(localPos + vec2(eps, 0.0), halfLen, barHalfW) - sdf;
                float dy = sdBar2D(localPos + vec2(0.0, eps), halfLen, barHalfW) - sdf;
                vec2 n2D = normalize(vec2(dx, dy) + 0.0001);
                n2D = rot2D(n2D, u_magnetRot[i]);

                if (sdf < 0.15) {
                    float vn = dot(vel2D, n2D);
                    if (vn < 0.0) vel2D -= vn * n2D * 2.0;
                    vel2D += n2D * max(0.15 - sdf, 0.0) * 200.0;
                } else {
                    float influence = smoothstep(1.0, 0.0, sdf);
                    float vn = dot(vel2D, n2D);
                    if (vn < 0.0) vel2D -= vn * n2D * influence;
                    vel2D += n2D * influence * 20.0;
                }
            }
        }

        // ═══════════════════════════════════════════════════
        // 5. ALONG-FIELD DRIVE — particles flow toward poles
        // ═══════════════════════════════════════════════════

        float driveForce = min(Bmag * 12.0, 80.0);
        vel2D += Bdir * driveForce * u_timeStep;

        // ═══════════════════════════════════════════════════
        // 6. PERPENDICULAR DAMPING — track field lines tightly
        // ═══════════════════════════════════════════════════

        float velAlongB = dot(vel2D, Bdir);
        vec2 velPerp = vel2D - velAlongB * Bdir;
        vel2D -= velPerp * 0.92;
    }

    // ═══════════════════════════════════════════════════
    // 7. ADAPTIVE DAMPING
    // ═══════════════════════════════════════════════════

    float damp = 0.55 - min(Bmag * 0.08, 0.20);
    vel2D *= damp;

    float speed = length(vel2D);
    if (speed > 40.0) {
        vel2D = vel2D / speed * 40.0;
    }

    gl_FragColor = vec4(vel2D.x, 0.0, vel2D.y, fieldIntensity);
}
