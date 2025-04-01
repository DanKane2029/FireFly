import { Mesh } from "./Mesh";

abstract class ParameterizedGeometry {
	abstract calculateMesh(detailLevel: number): Mesh;
}

export { ParameterizedGeometry };
