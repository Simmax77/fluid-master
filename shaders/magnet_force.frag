precision highp float;

varying vec2 v_coordinates;

uniform sampler2D u_positionTexture;
uniform sampler2D u_velocityTexture;

uniform float u_timeStep;
uniform float u_fieldStrength;
uniform vec3 u_gridSize;
uniform float u_frameNumber;

uniform int u_numMagnets;
uniform vec3 u_magnetPos[4];
uniform float u_magnetRot[4];
uniform float u_magnetSize[4];

// --- Constants ---
#define PI 3.14159265359
#define NUM_FIELD_LINES 28.0

vec2 rot2D(vec2 p, float a) {
    float c = cos(a); float s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float sdBar2D(vec2 p, float halfLen, float halfWidth) {
    vec2 d = abs(p) - vec2(halfLen, halfWidth);
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// Magnetic field B from dual monopole bar magnet
vec2 computeBarField2D(vec2 pos, vec2 magnetCenter, float rot, float size, float strength) {
    float halfLen = size * 0.5;
    vec2 pN = magnetCenter + rot2D(vec2(-halfLen, 0.0), rot);
    vec2 pS = magnetCenter + rot2D(vec2(halfLen, 0.0), rot);
    
    vec2 rN = pos - pN;
    vec2 rS = pos - pS;
    float distN = max(length(rN), size * 0.04);
    float distS = max(length(rS), size * 0.04);
    
    vec2 BfromN = strength * rN / (distN * distN * distN);
    vec2 BfromS = -strength * rS / (distS * distS * distS);
    
    return BfromN + BfromS;
}

// === STREAM FUNCTION ===
// For dual monopoles, ψ = θ_N - θ_S where θ = atan2(...)
// Contours of constant ψ ARE the field lines!
// By quantizing ψ and snapping particles to the nearest contour,
// we create the distinct curved field line pattern.
float streamFunction(vec2 pos, vec2 pN, vec2 pS) {
    float thetaN = atan(pos.y - pN.y, pos.x - pN.x);
    float thetaS = atan(pos.y - pS.y, pos.x - pS.x);
    return thetaN - thetaS;
}

// Compute the gradient of the stream function (points perpendicular to field lines)
vec2 streamGradient(vec2 pos, vec2 pN, vec2 pS) {
    // ∂ψ/∂x and ∂ψ/∂y via finite differences
    float eps = 0.05;
    float dx = streamFunction(pos + vec2(eps, 0.0), pN, pS) - streamFunction(pos - vec2(eps, 0.0), pN, pS);
    float dy = streamFunction(pos + vec2(0.0, eps), pN, pS) - streamFunction(pos - vec2(0.0, eps), pN, pS);
    return vec2(dx, dy) / (2.0 * eps);
}

void main() {
    vec3 position = texture2D(u_positionTexture, v_coordinates).rgb;
    vec3 velocity = texture2D(u_velocityTexture, v_coordinates).rgb;
    
    vec2 pos2D = vec2(position.x, position.z);
    vec2 vel2D = vec2(velocity.x, velocity.z);
    
    if (u_numMagnets == 0) {
        vel2D *= 0.90;
        gl_FragColor = vec4(vel2D.x, 0.0, vel2D.y, 0.0);
        return;
    }
    
    // Accumulate B field from all magnets
    vec2 totalB = vec2(0.0);
    for (int i = 0; i < 4; i++) {
        if (i >= u_numMagnets) break;
        vec2 mCenter = vec2(u_magnetPos[i].x, u_magnetPos[i].z);
        totalB += computeBarField2D(pos2D, mCenter, u_magnetRot[i], u_magnetSize[i], u_fieldStrength);
    }
    
    float Bmag = length(totalB);
    
    if (Bmag > 0.0001) {
        vec2 Bdir = totalB / Bmag;
        
        // === 1. FIELD LINE SNAPPING (THE KEY EFFECT) ===
        // Compute stream function for each magnet and snap to nearest quantized contour
        // This creates the distinct curved field lines like real iron filings
        for (int i = 0; i < 4; i++) {
            if (i >= u_numMagnets) break;
            
            float halfLen = u_magnetSize[i] * 0.5;
            vec2 mCenter = vec2(u_magnetPos[i].x, u_magnetPos[i].z);
            vec2 pN = mCenter + rot2D(vec2(-halfLen, 0.0), u_magnetRot[i]);
            vec2 pS = mCenter + rot2D(vec2(halfLen, 0.0), u_magnetRot[i]);
            
            // Compute stream function value at this particle's position
            float psi = streamFunction(pos2D, pN, pS);
            
            // Quantize to nearest field line
            float lineSpacing = PI / NUM_FIELD_LINES;
            float quantizedPsi = floor(psi / lineSpacing + 0.5) * lineSpacing;
            float psiError = psi - quantizedPsi;
            
            // Compute gradient of stream function (perpendicular to field)
            vec2 grad = streamGradient(pos2D, pN, pS);
            float gradMag = length(grad);
            
            if (gradMag > 0.001) {
                vec2 gradDir = grad / gradMag;
                
                // Snap force: push particle toward the nearest field line contour
                // Stronger near the magnet (where Bmag is high), weaker far away
                float snapStrength = min(Bmag * 40.0, 200.0);
                vel2D -= gradDir * psiError * snapStrength * u_timeStep;
            }
            
            // === 2. POLE ATTRACTION ===
            // Strong radial pull toward both poles — creates dense clusters at ends
            vec2 toN = pN - pos2D;
            vec2 toS = pS - pos2D;
            float dN = length(toN);
            float dS = length(toS);
            
            float poleMin = u_magnetSize[i] * 0.05;
            float poleRange = u_magnetSize[i] * 6.0;
            
            if (dN > poleMin && dN < poleRange) {
                float f = u_fieldStrength * 12.0 / (dN * dN + 0.1);
                f = min(f, 100.0);
                vel2D += normalize(toN) * f * u_timeStep;
            }
            if (dS > poleMin && dS < poleRange) {
                float f = u_fieldStrength * 12.0 / (dS * dS + 0.1);
                f = min(f, 100.0);
                vel2D += normalize(toS) * f * u_timeStep;
            }
            
            // === 3. BAR BODY REPULSION ===
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
        
        // === 4. ALONG-FIELD DRIVE ===
        // Move particles along field direction — they flow toward poles
        float driveForce = min(Bmag * 4.0, 30.0);
        vel2D += Bdir * driveForce * u_timeStep;
        
        // === 5. PERPENDICULAR DAMPING ===
        // Kill velocity perpendicular to field lines (particles track field lines tightly)
        float velAlongB = dot(vel2D, Bdir);
        vec2 velPerp = vel2D - velAlongB * Bdir;
        vel2D -= velPerp * 0.90;
    }
    
    // === 6. HEAVY DAMPING ===
    // Adaptive: stronger near magnet for fast settling
    float damp = 0.70 - min(Bmag * 0.06, 0.18);
    vel2D *= damp;
    
    float speed = length(vel2D);
    if (speed > 40.0) {
        vel2D = vel2D / speed * 40.0;
    }
    
    gl_FragColor = vec4(vel2D.x, 0.0, vel2D.y, 0.0);
}
