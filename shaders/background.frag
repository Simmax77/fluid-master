precision highp float;

varying vec2 v_position;

void main () {
    // Darker, futuristic vignette background
    float len = length(v_position);
    vec3 backgroundColor = vec3(0.02, 0.03, 0.05) * (1.0 - len * 0.4);
    gl_FragColor = vec4(backgroundColor, 1.0);
}
