import { vec3, mat4, quat } from "gl-matrix";
import { v4 as uuidv4 } from "uuid";

import { VertexBuffer, IndexBuffer } from "./Buffer";
import { Material, MaterialProperty, MaterialPropertyType } from "./Material";
import { UpdateFunction } from "./UpdateFunction";
import { Texture } from "./Texture";
import { Mesh } from "../Geometry/Mesh";

/**
 * An object that can be rendered to the scene
 */
class SceneObject {
	private _name: string;
	private _id: string;
	private _mesh: Mesh;
	// private _vertexBuffer: VertexBuffer;
	// private _indexBuffer: IndexBuffer;
	private _material: Material;
	private _translation: vec3;
	private _scale: vec3;
	private _rotation: vec3;
	private _transform: mat4;
	private _updateFunction: UpdateFunction;
	properties: Record<string, unknown>;

	/**
	 * Creats a new scene object
	 *
	 * @param vertexBuffer - The vertex buffer that holds the vertex information of the scene object
	 * @param indexBuffer - The index buffer that holds the index information of teh scene object
	 * @param material - The material of the scene object
	 */
	constructor(mesh: Mesh, material: Material) {
		this._id = uuidv4();
		this._mesh = mesh;
		// this._vertexBuffer = vertexBuffer;
		// this._indexBuffer = indexBuffer;
		this._material = material;
		this._translation = [0, 0, 0];
		this._scale = [1, 1, 1];
		this._rotation = [0, 0, 0];
		this._transform = mat4.create();
		this._updateFunction = () => undefined;
	}

	/**
	 * Gets the scene object name
	 */
	get name(): string {
		return this._name;
	}

	/**
	 * Sets the scene object name
	 */
	set name(name: string) {
		this._name = name;
	}

	/**
	 * Gets the scene object ID
	 */
	get id(): string {
		return this._id;
	}

	/**
	 * Gets the scene object vertex buffer
	 */
	get vertexBuffer(): VertexBuffer {
		return this._mesh.vertexBuffer;
	}

	/**
	 * Gets the index buffer of the scene object
	 */
	get indexBuffer(): IndexBuffer {
		return this._mesh.indexBuffer;
	}

	/**
	 * Gets the material of the scene object
	 */
	get material(): Material {
		return this._material;
	}

	/**
	 * Sets the material on the scene object
	 */
	set material(material: Material) {
		this._material = material;
	}

	/**
	 * Sets the translation vector of the scene object
	 */
	set translation(vec: vec3) {
		this._translation = vec;
	}

	/**
	 * Gets the translation vector of the scene vector
	 */
	get translation(): vec3 {
		return this._translation;
	}

	/**
	 * Sets the scale vector of the scene object
	 */
	set scale(vec: vec3) {
		this._scale = vec;
	}

	/**
	 * Gets the scale vector of the scene object
	 */
	get scale(): vec3 {
		return this._scale;
	}

	/**
	 * Sets the rotaion vector in degrees of the scene object
	 */
	set rotation(vec: vec3) {
		this._rotation = vec;
	}

	/**
	 * Gets teh rotation vector in degrees of the scene object
	 */
	get rotation(): vec3 {
		return this._rotation;
	}

	/**
	 * Rotates the scene object
	 *
	 * @param dx - The amount to rotate around the x axis in degrees
	 * @param dy - The amount to rotate around the y axis in degrees
	 * @param dz - The amount to rotate around the z axis in degrees
	 */
	rotate(dx: number, dy: number, dz: number) {
		this._rotation = [
			this._rotation[0] + dx,
			this._rotation[1] + dy,
			this._rotation[2] + dz,
		];
	}

	/**
	 * Updates the vertex and index buffer of the scene object
	 *
	 * @param indexBuffer - The updated index buffer of the new geometry
	 * @param vertexBuffer - The updated vertex buffer of the new geometry
	 */
	// updateGeometry(indexBuffer: IndexBuffer, vertexBuffer: VertexBuffer): void {
	// 	this._mesh.indexBuffer = indexBuffer;
	// 	this._mesh.vertexBuffer = vertexBuffer;
	// }

	/**
	 * Gets and calculates the tranform matrix for the scene object
	 */
	get transform(): mat4 {
		const rotation: quat = quat.fromEuler(
			quat.create(),
			this.rotation[0],
			this.rotation[1],
			this.rotation[2]
		);
		return mat4.fromRotationTranslationScale(
			this._transform,
			rotation,
			this.translation,
			this.scale
		);
	}

	/**
	 * Gets the update function of the scene object
	 */
	get updateFunction(): UpdateFunction {
		return this._updateFunction;
	}

	/**
	 * Sets the update function of the scene object
	 */
	set updateFunction(updateFunction: UpdateFunction) {
		this._updateFunction = updateFunction;
	}

	/**
	 * Creates a clone of the scene object
	 *
	 * @returns - The cloned scene object
	 */
	clone(): SceneObject {
		const clone = new SceneObject(
			this._mesh.clone(),
			this.material.clone()
		);
		clone.name = this.name;
		clone.translation = Array.from(this.translation) as vec3;
		clone.scale = Array.from(this.scale) as vec3;
		clone.rotation = Array.from(this.rotation) as vec3;
		clone.updateFunction = this.updateFunction;
		return clone;
	}

	/**
	 * Sets the created boolean of each buffer and texture in the object to false
	 */
	resetCreated(): void {
		this._mesh.indexBuffer.created = false;
		this._mesh.vertexBuffer.created = false;

		this._material.program.created = false;
		this._material.program.vertexShader.created = false;
		this._material.program.fragmentShader.created = false;

		this._material.properties.forEach((prop: MaterialProperty) => {
			switch (prop.type) {
				case MaterialPropertyType.TEXTURE: {
					const texture: Texture = prop.value as Texture;
					texture.created = false;
					texture.loaded = false;
					break;
				}
			}
		});
	}
}

export { SceneObject };
