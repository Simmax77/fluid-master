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

uniform int u_numSources;
uniform vec3 u_sourcePos[8];
uniform int u_sourceType[8]; // 1: Vortex, 2: Wind, 3: Repel, 4: Black Hole
uniform vec3 u_sourceDir[8]; // Used by directional sources like Wind


float kernel (vec3 position, float radius) {
    vec3 worldPosition = (position / u_gridResolution) * u_gridSize;

    float distanceToMouseRay = length(cross(u_mouseRayDirection, worldPosition - u_mouseRayOrigin));

    float normalizedDistance = max(0.0, distanceToMouseRay / radius);
    return smoothstep(1.0, 0.9, normalizedDistance);
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

    for (int i = 0; i < 8; ++i) {
        if (i >= u_numSources) break;

        vec3 worldCenter = u_sourcePos[i];
        vec3 center = (worldCenter / u_gridSize) * u_gridResolution;

        int type = u_sourceType[i];
        vec3 dir = u_sourceDir[i];

        if (type == 1) { // Vortex
            float dx_x = xPosition.x - center.x;
            float dz_x = xPosition.z - center.z;
            float dist_x = length(vec2(dx_x, dz_x));
            float ring_x = smoothstep(25.0, 0.0, dist_x);
            vec2 tan_x = dist_x > 0.01 ? normalize(vec2(-dz_x, dx_x)) : vec2(0.0);
            vec2 in_x = dist_x > 0.01 ? normalize(vec2(-dx_x, -dz_x)) : vec2(0.0);
            float forceX = (tan_x.x * 2500.0 + in_x.x * 800.0) * ring_x;

            float dx_y = yPosition.x - center.x;
            float dz_y = yPosition.z - center.z;
            float dist_y = length(vec2(dx_y, dz_y));
            float ring_y = smoothstep(25.0, 0.0, dist_y);
            float forceY = -300.0 * ring_y;

            float dx_z = zPosition.x - center.x;
            float dz_z = zPosition.z - center.z;
            float dist_z = length(vec2(dx_z, dz_z));
            float ring_z = smoothstep(25.0, 0.0, dist_z);
            vec2 tan_z = dist_z > 0.01 ? normalize(vec2(-dz_z, dx_z)) : vec2(0.0);
            vec2 in_z = dist_z > 0.01 ? normalize(vec2(-dx_z, -dz_z)) : vec2(0.0);
            float forceZ = (tan_z.y * 2500.0 + in_z.y * 800.0) * ring_z;

            // Apply a slight drop-off on Y axis distance
            float dY_x = abs(xPosition.y - center.y);
            float dY_y = abs(yPosition.y - center.y);
            float dY_z = abs(zPosition.y - center.y);
            
            forceX *= smoothstep(20.0, 0.0, dY_x);
            forceY *= smoothstep(20.0, 0.0, dY_y);
            forceZ *= smoothstep(20.0, 0.0, dY_z);

            newVelocity += vec3(forceX, forceY, forceZ) * u_timeStep;
        } else if (type == 2) { // Wind
            float distX = length(xPosition - center);
            float distY = length(yPosition - center);
            float distZ = length(zPosition - center);
            
            float windRadius = 25.0;
            float force = 4000.0;
            
            vec3 windForce = vec3(
                dir.x * force * smoothstep(windRadius, 0.0, distX),
                dir.y * force * smoothstep(windRadius, 0.0, distY),
                dir.z * force * smoothstep(windRadius, 0.0, distZ)
            );
            
            newVelocity += windForce * u_timeStep;
        } else if (type == 3) { // Repel
            vec3 dirX_vec = xPosition - center;
            vec3 dirY_vec = yPosition - center;
            vec3 dirZ_vec = zPosition - center;
            
            float repelRadius = 20.0;
            float force = 6000.0;
            
            vec3 repelKernel = vec3(
                smoothstep(repelRadius, 0.0, length(dirX_vec)),
                smoothstep(repelRadius, 0.0, length(dirY_vec)),
                smoothstep(repelRadius, 0.0, length(dirZ_vec))
            );
            
            newVelocity += vec3(
                length(dirX_vec) > 0.01 ? normalize(dirX_vec).x : 0.0,
                length(dirY_vec) > 0.01 ? normalize(dirY_vec).y : 0.0,
                length(dirZ_vec) > 0.01 ? normalize(dirZ_vec).z : 0.0
            ) * force * repelKernel * u_timeStep;
        } else if (type == 4) { // Black Hole
            vec3 dirX_vec = center - xPosition;
            vec3 dirY_vec = center - yPosition;
            vec3 dirZ_vec = center - zPosition;
            
            float suckRadius = 35.0;
            float force = 5000.0;
            
            vec3 suckKernel = vec3(
                smoothstep(suckRadius, 0.0, length(dirX_vec)),
                smoothstep(suckRadius, 0.0, length(dirY_vec)),
                smoothstep(suckRadius, 0.0, length(dirZ_vec))
            );
            
            newVelocity += vec3(
                length(dirX_vec) > 0.01 ? normalize(dirX_vec).x : 0.0,
                length(dirY_vec) > 0.01 ? normalize(dirY_vec).y : 0.0,
                length(dirZ_vec) > 0.01 ? normalize(dirZ_vec).z : 0.0
            ) * force * suckKernel * u_timeStep;
        }
    }

    gl_FragColor = vec4(newVelocity * 1.0, 0.0);
}
