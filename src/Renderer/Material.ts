import { vec2, vec3, vec4, mat4 } from "gl-matrix";
import { v4 as uuidv4 } from "uuid";

import { ShaderProgram } from "./Shader";
import { Texture } from "./Texture";

/**
 * The types that are allowed to be properties on materials
 */
enum MaterialPropertyType {
	SCALAR,
	VEC2,
	VEC3,
	VEC4,
	MAT4,
	TEXTURE,
}

/**
 * The unioned type of all possible types that could be material properties
 */
type MaterialPropertyValue = [number] | vec2 | vec3 | vec4 | mat4 | Texture;

/**
 * Object that describes a material property
 */
interface MaterialProperty {
	type: MaterialPropertyType;
	name: string;
	value: MaterialPropertyValue;
}

/**
 * An object that can be applied to a scene object that can change the way its surface renders
 */
class Material {
	private _id: string;
	private _name: string;
	private _program: ShaderProgram;
	private _properties: MaterialProperty[];

	/**
	 * Creates a new material
	 *
	 * @param name - The name of the material
	 * @param shaderProgram - The shader program that uses the material
	 * @param properties - A list of material properties that the shader program uses to define its look
	 */
	constructor(
		name: string,
		shaderProgram: ShaderProgram,
		properties: MaterialProperty[]
	) {
		this._id = uuidv4();
		this._name = name;
		this._program = shaderProgram;
		this._properties = properties;
	}

	/**
	 * Gets the unique id of the material
	 */
	get id(): string {
		return this._id;
	}

	/**
	 * Gets the name of the material
	 */
	get name(): string {
		return this._name;
	}

	/**
	 * Sets the name of the material
	 */
	set name(name: string) {
		this._name = name;
	}

	/**
	 * Gets the shader program that the material is used by
	 */
	get program(): ShaderProgram {
		return this._program;
	}

	/**
	 * Sets the shader program that the material is used by
	 */
	set program(shaderProgram: ShaderProgram) {
		this._program = shaderProgram;
	}

	/**
	 * Gets the list of material properties the material uses
	 */
	get properties(): MaterialProperty[] {
		return this._properties;
	}

	/**
	 * Sets the list of material properties the material uses
	 */
	set properties(properties: MaterialProperty[]) {
		this._properties = properties;
	}

	/**
	 * Adds a new material property to material's property list
	 *
	 * @param property - The new material property to add the the material
	 */
	addProperty(property: MaterialProperty): void {
		this._properties.push(property);
	}

	/**
	 * Updates an already existing material property's value
	 *
	 * @param propertyName - The name of the property to update
	 * @param value - The new material value to update the property to
	 */
	setProperty(propertyName: string, value: MaterialPropertyValue): void {
		// Search for the material property
		const property = this.properties.find(
			(prop: MaterialProperty) => prop.name === propertyName
		);

		// If the property exists set its new value. If not throw error.
		if (property) {
			property.value = value;
		} else {
			throw new Error(
				`Property ${propertyName} on material ${this.name} doesn't exist!`
			);
		}
	}

	/**
	 * Returns a clone of the material object
	 *
	 * @returns - The cloned material object
	 */
	clone(): Material {
		const clone: Material = new Material(
			this.name,
			this.program.clone(),
			this.properties.map((p) => structuredClone(p))
		);
		return clone;
	}
}

export { Material, MaterialProperty, MaterialPropertyType };
