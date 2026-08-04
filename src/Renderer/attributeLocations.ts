/**
 * The vertex attribute slot each named mesh attribute occupies, shared by every
 * backend and every shader.
 *
 * The two graphics APIs disagree about how a vertex attribute is identified.
 * GLSL names them (`in vec3 a_position`) and WebGL resolves a name to a slot at
 * link time with `getAttribLocation`; WGSL has no attribute names at all, only
 * numbers (`@location(0) position: vec3f`). A `VertexBufferLayout` describes a
 * mesh by name (see Buffer.ts), so *something* has to map the two together.
 *
 * Pinning the numbers here is what makes one `Mesh` drawable by both backends:
 * the WebGL backend calls `bindAttribLocation` with this table before linking
 * (rather than asking the driver where an attribute landed), and the WGSL
 * shaders hard-code the same numbers in their `@location` decorations. One
 * table, one source of truth, no per-backend divergence to debug.
 *
 * Adding an attribute means: a new entry here, a matching `in`/`@location` in
 * both shader languages, and the name appearing in the mesh's layout.
 */
const ATTRIBUTE_LOCATIONS: Readonly<Record<string, number>> = {
	a_position: 0,
	a_normal: 1,
	a_texCoord: 2,
};

/**
 * Looks up the slot a named vertex attribute occupies.
 *
 * Throws rather than returning -1 (WebGL's "no such attribute" answer) because
 * an unknown name here is always a mistake at authoring time - a typo in a
 * mesh's layout, or an attribute added to a layout but not to this table - and
 * the WebGL failure mode is otherwise a silently un-fed attribute reading
 * (0,0,0,1), which looks like a geometry bug rather than a naming one.
 *
 * @param name - The attribute name used in the mesh's VertexBufferLayout
 * @returns - The location both backends agree this attribute lives at
 */
function attributeLocation(name: string): number {
	const location = ATTRIBUTE_LOCATIONS[name];
	if (location === undefined) {
		throw new Error(
			`Unknown vertex attribute "${name}". Add it to ATTRIBUTE_LOCATIONS ` +
				`(attributeLocations.ts) and to both the GLSL and WGSL shaders.`
		);
	}
	return location;
}

export { ATTRIBUTE_LOCATIONS, attributeLocation };
