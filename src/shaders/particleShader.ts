export const particleVertex = `
  attribute float size;
  attribute float intensity;

  varying float vIntensity;

  void main() {
    vIntensity = intensity;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const particleFragment = `
  varying float vIntensity;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float alpha = smoothstep(0.5, 0.0, d);

    gl_FragColor = vec4(
      0.2 + vIntensity * 0.8,
      0.6 + vIntensity * 0.4,
      1.0,
      alpha
    );
  }
`;