# Model Attribution

The test models in this directory come from the **Stanford Computer Graphics
Laboratory** and its [3D Scanning Repository](https://graphics.stanford.edu/data/3Dscanrep/).
They are the canonical reference models used throughout computer-graphics
research and teaching.

| File | Model | Source scan | Triangles |
| --- | --- | --- | --- |
| `bunny.obj` | Stanford Bunny | `bun_zipper.ply` (zippered reconstruction) | 69,451 |
| `dragon.obj` | Stanford Dragon | `dragon_vrip_res3.ply` (decimated) | 47,794 |

## Processing

Each `.obj` was converted from the original ASCII `.ply` with a minimal
positions-only converter:

- Only vertex positions (`x y z`) are kept; the bunny's extra per-vertex
  `confidence`/`intensity` columns are dropped.
- Faces are triangle-fan triangulated and written with 1-based OBJ indices.
- **No vertex normals are stored** — they are computed at load time by
  `src/Geometry/OBJLoader.ts`, and the mesh is centered and scaled to a unit
  box there so it frames correctly under the default camera.

The full-resolution dragon (`dragon_vrip.ply`, ~871k triangles, tens of MB) was
intentionally not used; the `res3` decimation looks nearly identical at this
scale while keeping the bundle small.

## Terms

Stanford provides these models freely for use. Please retain this attribution to
the Stanford Computer Graphics Laboratory when redistributing.
