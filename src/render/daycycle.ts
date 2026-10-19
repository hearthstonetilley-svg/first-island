import { Color, Vector3 } from 'three';

// The day cycle (decision 58), as plain numbers: where the sun stands at a phase of the island's day,
// and the colours and the one shadowing light that follow it. The scene copies these into uniforms
// and lights, so the day turns without rebuilding a shader.
export const SUN_DIRECTION = new Vector3(-0.82, 0.22, -0.53).normalize();

// Sky colours by the sine of the sun's height: night, twilight, sunset, golden hour, day.
const SKY_KEYS: { at: number; zenith: string; horizon: string; glow: string; water: string }[] = [
  { at: -0.3, zenith: '#02060f', horizon: '#0a1428', glow: '#ff8a50', water: '#1a2540' },
  { at: -0.14, zenith: '#0d1636', horizon: '#3a3f6a', glow: '#ff8a50', water: '#3a4766' },
  { at: -0.02, zenith: '#2b3a6e', horizon: '#e0734a', glow: '#ff8a50', water: '#8f97b5' },
  { at: 0.08, zenith: '#3b5c9e', horizon: '#f2a65e', glow: '#ffb070', water: '#d9d4d6' },
  { at: 0.35, zenith: '#1054b9', horizon: '#83bddc', glow: '#ffdca2', water: '#ffffff' },
];
type Key = 'zenith' | 'horizon' | 'glow' | 'water';
export function keyColour(k: Key, h: number, out = new Color()): Color {
  if (h <= SKY_KEYS[0].at) return out.set(SKY_KEYS[0][k]);
  for (let i = 1; i < SKY_KEYS.length; i++) {
    const a = SKY_KEYS[i - 1], b = SKY_KEYS[i];
    if (h <= b.at) return out.set(a[k]).lerp(new Color(b[k]), (h - a.at) / (b.at - a.at));
  }
  return out.set(SKY_KEYS[SKY_KEYS.length - 1][k]);
}

// Noon is phase 0, as on the server (daylight = 0.5 + 0.5 cos(2 pi phase)): the sun is highest at
// noon, on the horizon at a quarter and three quarters, and lowest at midnight. It crosses the sky,
// setting opposite to where it rose; noon keeps the approved light's compass bearing.
export const NOON_AZIMUTH = Math.atan2(SUN_DIRECTION.z, SUN_DIRECTION.x);
export function sunAt(phase: number): { dir: Vector3; height: number; azimuth: number } {
  const a = phase * Math.PI * 2, height = 0.92 * Math.cos(a), azimuth = NOON_AZIMUTH + a;
  const flat = Math.sqrt(1 - height * height);
  return { dir: new Vector3(flat * Math.cos(azimuth), height, flat * Math.sin(azimuth)), height, azimuth };
}

export interface Lighting {
  dir: Vector3; height: number; azimuth: number;
  colours: Record<Key, Color>;
  sunVis: number; halo: number; night: number; glint: number;
  light: { dir: Vector3; intensity: number; color: Color; byDay: boolean };
  hemisphere: number; exposure: number; fog: { color: Color; density: number };
}

export function lightingAt(phase: number, daylight: number, storm = false): Lighting {
  const { dir, height, azimuth } = sunAt(phase);
  const lum = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const gloom = storm ? 0.55 : 1, grey = new Color('#5d6a72');
  const colours = {} as Record<Key, Color>;
  for (const k of ['zenith', 'horizon', 'glow', 'water'] as const) {
    const c = colours[k] = keyColour(k, height);
    // A storm greys the sky and water at the brightness they already have, so it never lightens anything.
    if (storm && k !== 'glow') c.lerp(grey.clone().multiplyScalar(lum(c) / lum(grey) * 0.8), 0.6);
  }
  const up = Math.max(0, Math.min(1, (height + 0.08) / 0.1));
  // One light: the sun by day, the moon by night. It fades to nothing at the horizon before it changes
  // sides, so shadows never snap; it never comes from lower than about eight degrees, so shadows stay sane.
  const byDay = height >= 0, ldir = byDay ? dir.clone() : dir.clone().negate();
  ldir.y = Math.max(ldir.y, 0.14); ldir.normalize();
  const d = Math.max(0, Math.min(1, daylight)), rise = Math.min(1, Math.abs(height) / 0.2);
  const intensity = (byDay ? 3.2 : 0.45) * rise * gloom;
  const color = byDay ? new Color(storm ? '#c8ccd0' : '#ffb070').lerp(new Color(storm ? '#c8ccd0' : '#ffe1a6'), Math.min(1, height / 0.25)) : new Color('#9fb4ff');
  return {
    dir, height, azimuth, colours,
    sunVis: up * (storm ? 0.2 : 1), halo: storm ? 0 : Math.max(0, 1 - Math.abs(height) / 0.3),
    night: storm ? 0 : Math.max(0, Math.min(1, (-height - 0.05) / 0.2)),
    // Glitter is a low sun's: overhead, the sharp highlight would sit under a downward view as white blots.
    glint: up * gloom * (1 - 0.75 * Math.max(0, Math.min(1, (height - 0.3) / 0.5))),
    light: { dir: ldir, intensity, color, byDay },
    hemisphere: 3 * (0.12 + 0.88 * d) * gloom, exposure: 0.55 + 0.45 * d,
    fog: { color: storm ? new Color('#5d6a72') : keyColour('horizon', height), density: storm ? 0.006 : 0.0018 },
  };
}
