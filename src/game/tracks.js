// Track definitions. Control points are [x, z, y?, halfWidth?] forming a closed loop.
// Features are positioned by u ∈ [0,1) along the track (arc-length fraction); u=0 is the start/finish line.
//
// `shoulder` is the strip between the road edge and the wall. It is kept tiny on purpose:
// the wall sits right on the curb, so karts can never leave the road.
// `gaps` are stretches with no road at all (a cliff jump). Karts launch off the lip, glide
// across and land on the far side; anyone who falls short gets picked up by the rescue drone.
export const TRACKS = [
  {
    id: 'meadow',
    name: 'Tonztown Circuit',
    theme: 'meadow',
    music: 'meadow',
    halfWidth: 10,
    shoulder: 1.8,
    points: [
      [0, 0, 0], [80, 0, 0], [140, 10, 0], [178, 48, 1], [182, 98, 2], [152, 138, 2], [102, 146, 1.5], [70, 120, 1],
      [38, 98, 1], [0, 108, 2], [-38, 145, 4], [-95, 150, 6, 9], [-138, 112, 5], [-146, 56, 3], [-116, 12, 1], [-62, 0, 0],
    ],
    itemRows: [0.12, 0.42, 0.72],
    boostPads: [{ u: 0.30, lat: -0.35, len: 8 }, { u: 0.60, lat: 0.3, len: 8 }, { u: 0.88, lat: 0, len: 8 }],
    ramps: [{ u: 0.52, len: 6, power: 9 }],
    ice: [],
    gaps: [],
  },
  {
    id: 'desert',
    name: 'Dune Caniyan',
    theme: 'desert',
    music: 'desert',
    halfWidth: 10,
    shoulder: 1.8,
    points: [
      [0, 0, 0], [100, 0, 0], [162, -18, 0], [212, 12, 1], [224, 72, 3], [186, 114, 4], [126, 106, 3], [94, 142, 2],
      [104, 200, 1], [56, 244, 0], [-18, 226, 0], [-44, 166, 2], [-94, 142, 4], [-146, 100, 3], [-136, 38, 1], [-72, 6, 0],
    ],
    itemRows: [0.1, 0.38, 0.66, 0.86],
    boostPads: [{ u: 0.22, lat: 0, len: 10 }, { u: 0.55, lat: -0.4, len: 8 }, { u: 0.78, lat: 0.4, len: 8 }],
    ramps: [{ u: 0.47, len: 6, power: 10 }, { u: 0.93, len: 6, power: 8 }],
    ice: [],
    gaps: [],
  },
  {
    id: 'neon',
    name: 'Niya Nights',
    theme: 'neon',
    music: 'neon',
    halfWidth: 10,
    shoulder: 1.8,
    points: [
      [0, 0, 0], [120, 0, 0], [162, 22, 0], [172, 72, 1], [150, 104, 2], [102, 114, 3], [80, 146, 3], [92, 192, 2],
      [62, 226, 1], [0, 228, 0], [-42, 194, 0], [-44, 132, 1], [-84, 110, 2], [-142, 102, 2], [-164, 60, 1], [-142, 14, 0], [-80, 0, 0],
    ],
    itemRows: [0.1, 0.35, 0.6, 0.85],
    boostPads: [{ u: 0.05, lat: 0, len: 8 }, { u: 0.25, lat: -0.4, len: 8 }, { u: 0.48, lat: 0.4, len: 8 }, { u: 0.7, lat: 0, len: 10 }],
    ramps: [{ u: 0.92, len: 6, power: 9 }],
    ice: [],
    gaps: [],
  },
  {
    // The finale: climb onto a green plateau, launch off the cliff over the falls, glide to the far side.
    id: 'falls',
    name: 'Niyagara Falls',
    theme: 'falls',
    music: 'snow',
    halfWidth: 10,
    shoulder: 1.8,
    points: [
      [0, 0, 0], [90, 0, 1], [150, 18, 3], [180, 66, 6], [170, 120, 10], [128, 150, 14],
      // the plateau straight (heading west); the falls gap is in the middle of it
      [70, 160, 16], [10, 162, 16], [-50, 162, 15], [-104, 152, 12],
      [-144, 112, 8], [-150, 56, 5], [-124, 10, 2], [-80, -14, 0], [-36, -12, 0],
    ],
    itemRows: [0.1, 0.33, 0.62, 0.84],
    boostPads: [{ u: 0.2, lat: 0.3, len: 8 }, { u: 0.36, lat: 0, len: 10 }, { u: 0.455, lat: 0, len: 8 }, { u: 0.74, lat: -0.3, len: 8 }],
    ramps: [],
    ice: [],
    // ~38 m chasm in the middle of the plateau straight (x ≈ 32 → -6), ~16 m above the river
    gaps: [{ u0: 0.487, u1: 0.531, power: 8.5 }],
  },
];

export function getTrack(id) {
  return TRACKS.find(t => t.id === id) || TRACKS[0];
}
