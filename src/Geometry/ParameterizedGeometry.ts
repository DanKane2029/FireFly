import { Mesh } from "./Mesh";

/**
 * Base class for shapes defined by parameters (a sphere's radius, a box's
 * dimensions) rather than by an explicit list of vertices. Subclasses generate
 * their vertices and faces on demand in calculateMesh.
 *
 * @param detailLevel - How finely to tessellate curved surfaces (higher = more
 * triangles). Flat shapes such as a box are fully described by their
 * parameters and ignore this value.
 */
abstract class ParameterizedGeometry {
	abstract calculateMesh(detailLevel: number): Mesh;
}

export { ParameterizedGeometry };
