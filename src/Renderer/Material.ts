import { vec2, vec3, vec4, mat4 } from "gl-matrix";

import { IdManager } from "./IdCounter";
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
 * String names for MaterialPropertyType, keyed by the enum's numeric value.
 * A `.ffscene` file must serialize the type as one of these strings, never the
 * raw enum number - the number is just this array's index, so renumbering the
 * enum (adding a new type in the middle, say) would silently corrupt every
 * saved file that used the numbers directly.
 */
const MATERIAL_PROPERTY_TYPE_NAMES: Record<MaterialPropertyType, string> = {
	[MaterialPropertyType.SCALAR]: "scalar",
	[MaterialPropertyType.VEC2]: "vec2",
	[MaterialPropertyType.VEC3]: "vec3",
	[MaterialPropertyType.VEC4]: "vec4",
	[MaterialPropertyType.MAT4]: "mat4",
	[MaterialPropertyType.TEXTURE]: "texture",
};

/** Converts a MaterialPropertyType to its serializable string name. */
function materialPropertyTypeToString(type: MaterialPropertyType): string {
	return MATERIAL_PROPERTY_TYPE_NAMES[type];
}

/** Converts a serialized string name back to a MaterialPropertyType. */
function materialPropertyTypeFromString(name: string): MaterialPropertyType {
	const entry = Object.entries(MATERIAL_PROPERTY_TYPE_NAMES).find(
		([, value]) => value === name
	);
	if (!entry) {
		throw new Error(`Unknown material property type "${name}".`);
	}
	return Number(entry[0]) as MaterialPropertyType;
}

/**
 * Object that describes a material property
 */
interface MaterialProperty {
	type: MaterialPropertyType;
	name: string;
	value: MaterialPropertyValue;
}

/**
 * Describes how a surface looks: a shader program plus the set of named
 * properties (uniforms) that feed it - a color, textures, and so on. Two
 * objects can share the same shader program but supply different property
 * values (e.g. different colors) through their own Material. The renderer
 * reads these properties and uploads them as uniforms before drawing.
 */
class Material {
	private _id: number;
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
		this._id = IdManager.getId();
		this._name = name;
		this._program = shaderProgram;
		this._properties = properties;
	}

	/**
	 * Gets the unique id of the material
	 */
	get id(): number {
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

export {
	Material,
	MaterialProperty,
	MaterialPropertyType,
	MaterialPropertyValue,
	materialPropertyTypeToString,
	materialPropertyTypeFromString,
};
