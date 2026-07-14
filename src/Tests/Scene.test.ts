import { describe, expect, test } from "@jest/globals";
import { vec3, vec4 } from "gl-matrix";
import { World } from "../ecs/World";
import { AssetRegistry } from "../Assets/AssetRegistry";
import { Camera } from "../Renderer/Camera";
import { Shader, ShaderProgram, ShaderType } from "../Renderer/Shader";
import { MaterialPropertyType } from "../Renderer/Material";
import { Sphere } from "../Geometry/Sphere";
import { Transform, createTransform } from "../ecs/components/Transform";
import { Spin } from "../ecs/components/Spin";
import { Named } from "../ecs/components/Named";
import { PointLight } from "../ecs/components/PointLight";
import { MeshRef } from "../ecs/components/MeshRef";
import { MaterialRef } from "../ecs/components/MaterialRef";
import { serializeScene } from "../Scene/serializeScene";
import { deserializeScene } from "../Scene/deserializeScene";
import { MaterialAssetJSON, SceneFile } from "../Scene/SceneFile";

function stubProgram(): ShaderProgram {
	return new ShaderProgram(
		new Shader("// vertex", ShaderType.VERTEX),
		new Shader("// fragment", ShaderType.FRAGMENT)
	);
}

/** Builds a small world - a light and a ball - plus the registry, camera, and
 * environment it references, mirroring (in miniature) what spawnDefaultLights
 * + a snowman ball look like. */
function buildFixture() {
	const registry = new AssetRegistry();
	const program = stubProgram();
	registry.registerMesh(
		"mesh/sphere",
		{ kind: "primitive", primitive: "sphere" },
		new Sphere(1).calculateMesh(4)
	);
	const materialId = registry.createMaterial("Ball Material", program, [
		{ type: MaterialPropertyType.VEC4, name: "u_color", value: [1, 0, 0, 1] },
	]);

	const world = new World();
	const light = world.create();
	world.add(light, Transform, createTransform({ translation: [5, 0, 10] }));
	world.add(light, PointLight, {});

	const ball = world.create();
	world.add(
		ball,
		Transform,
		createTransform({ translation: [0, -0.3, 0], scale: [0.2, 0.2, 0.2] })
	);
	world.add(ball, Named, { name: "Ball" });
	world.add(ball, MeshRef, { mesh: "mesh/sphere" });
	world.add(ball, MaterialRef, { material: materialId });
	world.add(ball, Spin, { degreesPerSecond: vec3.fromValues(0, 25, 0) });

	const camera = new Camera(1, 45, 0.01, 1000);
	camera.translation = vec3.fromValues(1, 2, 3);
	camera.lookAt([0, 0, 0]);
	camera.fovy = 60;

	const environment = {
		ambientLight: vec3.fromValues(0.1, 0.2, 0.3),
		backgroundColor: vec4.fromValues(0.2, 0.2, 0.2, 1),
	};

	return { registry, program, world, light, ball, materialId, camera, environment };
}

describe("Scene round trip", () => {
	test("serialize -> clear -> deserialize reproduces the world, camera, and environment", () => {
		const { registry, program, world, light, ball, materialId, camera, environment } =
			buildFixture();

		const file = serializeScene(world, registry, camera, environment);
		world.clear();
		expect(world.entities()).toHaveLength(0);

		const freshCamera = new Camera(1, 45, 0.01, 1000);
		const restoredEnvironment = deserializeScene(file, world, registry, freshCamera, {
			lit: program,
		});

		expect(world.entities().sort()).toEqual([light, ball].sort());

		const restoredLightTransform = world.get(light, Transform);
		expect(restoredLightTransform).toBeDefined();
		expect(Array.from(restoredLightTransform?.translation ?? [])).toEqual([5, 0, 10]);
		expect(world.has(light, PointLight)).toBe(true);

		expect(world.get(ball, Named)).toEqual({ name: "Ball" });
		expect(world.get(ball, MeshRef)).toEqual({ mesh: "mesh/sphere" });
		expect(world.get(ball, MaterialRef)).toEqual({ material: materialId });
		const restoredSpin = world.get(ball, Spin);
		expect(restoredSpin).toBeDefined();
		expect(Array.from(restoredSpin?.degreesPerSecond ?? [])).toEqual([0, 25, 0]);

		const restoredMaterial = registry.resolveMaterial(materialId);
		expect(
			restoredMaterial.properties.find((p) => p.name === "u_color")?.value
		).toEqual([1, 0, 0, 1]);

		expect(Array.from(freshCamera.translation)).toEqual(
			Array.from(camera.translation)
		);
		expect(Array.from(freshCamera.orientation)).toEqual(
			Array.from(camera.orientation)
		);
		expect(freshCamera.fovy).toBe(60);

		// Compare against the fixture's own (already float32-rounded) values,
		// not hand-typed literals - vec3.fromValues(0.1, ...) does not store
		// exactly 0.1, so the round trip is exact even though the literal isn't.
		expect(Array.from(restoredEnvironment.ambientLight)).toEqual(
			Array.from(environment.ambientLight)
		);
		expect(Array.from(restoredEnvironment.backgroundColor)).toEqual(
			Array.from(environment.backgroundColor)
		);
	});

	test("only captures assets the world's entities actually reference", () => {
		const { registry, world, camera, environment } = buildFixture();
		// An asset nothing points to (e.g. left over from a previous scene).
		registry.createMaterial("Unused", stubProgram(), [
			{ type: MaterialPropertyType.VEC4, name: "u_color", value: [0, 0, 0, 1] },
		]);

		const file = serializeScene(world, registry, camera, environment);
		const materialAssets = file.assets.filter(
			(a): a is MaterialAssetJSON => a.type === "material"
		);
		expect(materialAssets).toHaveLength(1);
		expect(materialAssets[0].name).toBe("Ball Material");
	});

	test("rejects a file with the wrong format tag", () => {
		const { registry, world, camera, environment } = buildFixture();
		const file = serializeScene(world, registry, camera, environment);
		const bogus = { ...file, format: "not-firefly" } as unknown as SceneFile;

		expect(() =>
			deserializeScene(bogus, new World(), registry, new Camera(1, 45, 0.01, 1000), {})
		).toThrow(/Not a Firefly scene file/);
	});

	test("rejects a file with an unsupported version", () => {
		const { registry, world, camera, environment } = buildFixture();
		const file = serializeScene(world, registry, camera, environment);
		const bogus = { ...file, version: 99 } as unknown as SceneFile;

		expect(() =>
			deserializeScene(bogus, new World(), registry, new Camera(1, 45, 0.01, 1000), {})
		).toThrow(/Unsupported scene file version/);
	});

	test("rejects a file referencing an unknown component", () => {
		const { registry, world, camera, environment } = buildFixture();
		const file = serializeScene(world, registry, camera, environment);
		const bogus: SceneFile = {
			...file,
			assets: [],
			entities: [{ id: 1, components: { NotARealComponent: {} } }],
		};

		expect(() =>
			deserializeScene(bogus, new World(), registry, new Camera(1, 45, 0.01, 1000), {})
		).toThrow(/Unknown component/);
	});

	test("rejects a material asset referencing an unknown shader", () => {
		const { registry, world, camera, environment } = buildFixture();
		const file = serializeScene(world, registry, camera, environment);

		expect(() =>
			deserializeScene(file, new World(), registry, new Camera(1, 45, 0.01, 1000), {})
		).toThrow(/Unknown shader/);
	});

	test("rejects a mesh asset that isn't already registered", () => {
		const { registry, program, world, camera, environment } = buildFixture();
		const file = serializeScene(world, registry, camera, environment);

		const emptyRegistry = new AssetRegistry();
		expect(() =>
			deserializeScene(file, new World(), emptyRegistry, new Camera(1, 45, 0.01, 1000), {
				lit: program,
			})
		).toThrow(/No mesh registered/);
	});

	test("refuses to serialize a texture property (not supported until the texturing milestone)", () => {
		const registry = new AssetRegistry();
		const world = new World();
		const materialId = registry.createMaterial("Textured", stubProgram(), [
			{ type: MaterialPropertyType.TEXTURE, name: "u_texture", value: [0] as unknown as [number] },
		]);
		const entity = world.create();
		world.add(entity, MaterialRef, { material: materialId });

		expect(() =>
			serializeScene(world, registry, new Camera(1, 45, 0.01, 1000), {
				ambientLight: vec3.fromValues(0, 0, 0),
				backgroundColor: vec4.fromValues(0, 0, 0, 1),
			})
		).toThrow(/texture/);
	});
});
