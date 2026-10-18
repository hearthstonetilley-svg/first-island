// Runtime Math.cos differs by ulps between Node and Chromium. Range-reduce a
// periodic phase and evaluate cosine with IEEE arithmetic instead. The degree-20
// polynomial on [0, pi/2] preserves the existing daily curve without native libm.
const TAU = 6.283185307179586;
const COEFFICIENTS = [-1/2, 1/24, -1/720, 1/40320, -1/3628800, 1/479001600,
  -1/87178291200, 1/20922789888000, -1/6402373705728000, 1/2432902008176640000] as const;

export function daylightAt(tick: number, period: number): number {
  const phase = (tick % period) / period;
  const mirrored = phase > 0.5 ? 1 - phase : phase;
  const negative = mirrored > 0.25;
  const angle = (negative ? 0.5 - mirrored : mirrored) * TAU;
  const squared = angle * angle;
  let value: number = COEFFICIENTS[COEFFICIENTS.length - 1];
  for (let i = COEFFICIENTS.length - 2; i >= 0; i--) value = COEFFICIENTS[i] + squared * value;
  const cosine = 1 + squared * value;
  return (1 + (negative ? -cosine : cosine)) / 2;
}
