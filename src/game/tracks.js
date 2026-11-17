// Track definitions. Control points are [x, z, y?, halfWidth?] forming a closed loop.
// Features are positioned by u ∈ [0,1) along the track (arc-length fraction); u=0 is the start/finish line.
export const TRACKS = [
  {
    id: 'meadow',
    name: 'Sunny Meadow',
    theme: 'meadow',
    music: 'meadow',
    halfWidth: 10,
    shoulder: 7,
    points: [
      [0, 0, 0], [80, 0, 0], [140, 10, 0], [178, 48, 1], [182, 98, 2], [152, 138, 2], [102, 146, 1.5], [70, 120, 1],
      [38, 98, 1], [0, 108, 2], [-38, 145, 4], [-95, 150, 6, 9], [-138, 112, 5], [-146, 56, 3], [-116, 12, 1], [-62, 0, 0],
    ],
    itemRows: [0.12, 0.42, 0.72],
    boostPads: [{ u: 0.30, lat: -0.35, len: 8 }, { u: 0.60, lat: 0.3, len: 8 }, { u: 0.88, lat: 0, len: 8 }],
    ramps: [{ u: 0.52, len: 6, power: 9 }],
    ice: [],
  },
  {
    id: 'desert',
    name: 'Dune Canyon',
    theme: 'desert',
    music: 'desert',
    halfWidth: 10,
    shoulder: 8,
    points: [
      [0, 0, 0], [100, 0, 0], [162, -18, 0], [212, 12, 1], [224, 72, 3], [186, 114, 4], [126, 106, 3], [94, 142, 2],
      [104, 200, 1], [56, 244, 0], [-18, 226, 0], [-44, 166, 2], [-94, 142, 4], [-146, 100, 3], [-136, 38, 1], [-72, 6, 0],
    ],
    itemRows: [0.1, 0.38, 0.66, 0.86],
    boostPads: [{ u: 0.22, lat: 0, len: 10 }, { u: 0.55, lat: -0.4, len: 8 }, { u: 0.78, lat: 0.4, len: 8 }],
    ramps: [{ u: 0.47, len: 6, power: 10 }, { u: 0.93, len: 6, power: 8 }],
    ice: [],
  },
  {
    id: 'snow',
    name: 'Frostbite Pass',
    theme: 'snow',
    music: 'snow',
    halfWidth: 10,
    shoulder: 7,
    points: [
      [0, 0, 0], [90, 0, 1], [152, 22, 3], [174, 82, 6], [142, 132, 8], [84, 144, 9], [60, 194, 8], [0, 224, 6],
      [-70, 204, 4], [-96, 146, 4], [-62, 98, 5], [-88, 48, 4], [-140, 36, 2], [-160, -14, 1], [-118, -46, 0], [-54, -32, 0],
    ],
    itemRows: [0.08, 0.36, 0.62, 0.84],
    boostPads: [{ u: 0.18, lat: 0.3, len: 8 }, { u: 0.5, lat: 0, len: 10 }, { u: 0.74, lat: -0.3, len: 8 }],
    ramps: [{ u: 0.28, len: 6, power: 9 }],
    ice: [{ u0: 0.40, u1: 0.47 }, { u0: 0.66, u1: 0.71 }],
  },
  {
    id: 'neon',
    name: 'Neon Nights',
    theme: 'neon',
    music: 'neon',
    halfWidth: 10,
    shoulder: 5,
    points: [
      [0, 0, 0], [120, 0, 0], [162, 22, 0], [172, 72, 1], [150, 104, 2], [102, 114, 3], [80, 146, 3], [92, 192, 2],
      [62, 226, 1], [0, 228, 0], [-42, 194, 0], [-44, 132, 1], [-84, 110, 2], [-142, 102, 2], [-164, 60, 1], [-142, 14, 0], [-80, 0, 0],
    ],
    itemRows: [0.1, 0.35, 0.6, 0.85],
    boostPads: [{ u: 0.05, lat: 0, len: 8 }, { u: 0.25, lat: -0.4, len: 8 }, { u: 0.48, lat: 0.4, len: 8 }, { u: 0.7, lat: 0, len: 10 }],
    ramps: [{ u: 0.92, len: 6, power: 9 }],
    ice: [],
  },
];

export function getTrack(id) {
  return TRACKS.find(t => t.id === id) || TRACKS[0];
}
