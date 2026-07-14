import { Component } from "../ecs/Component";
import {
	Transform,
	TransformData,
	transformFromJSON,
	transformToJSON,
} from "../ecs/components/Transform";
import { Spin, SpinData, spinFromJSON, spinToJSON } from "../ecs/components/Spin";
import { Named, NamedData } from "../ecs/components/Named";
import { PointLight, PointLightData } from "../ecs/components/PointLight";
import { MeshRef, MeshRefData } from "../ecs/components/MeshRef";
import { MaterialRef, MaterialRefData } from "../ecs/components/MaterialRef";

/**
 * Pairs a component handle with the functions that turn its data into
 * `.ffscene` JSON and back. Every component the scene format can persist
 * needs one, keyed by the component's string *name* - never its numeric id,
 * which is assigned by module import order and is not stable across builds
 * (see docs/scene-creator-roadmap.md).
 */
export interface ComponentCodec<T> {
	component: Component<T>;
	toJSON: (data: T) => unknown;
	fromJSON: (json: unknown) => T;
}

/** Type-erases a codec so codecs for different component data shapes can live
 * in one list. The cast is confined to this one function. */
function codec<T>(
	component: Component<T>,
	toJSON: (data: T) => unknown,
	fromJSON: (json: unknown) => T
): ComponentCodec<unknown> {
	return {
		component: component as unknown as Component<unknown>,
		toJSON: toJSON as (data: unknown) => unknown,
		fromJSON: fromJSON as (json: unknown) => unknown,
	};
}

const CODECS: ComponentCodec<unknown>[] = [
	codec<TransformData>(
		Transform,
		transformToJSON,
		transformFromJSON as (json: unknown) => TransformData
	),
	codec<SpinData>(Spin, spinToJSON, spinFromJSON as (json: unknown) => SpinData),
	// Named, PointLight, MeshRef, and MaterialRef are already JSON-safe plain
	// data (a string, nothing, and - since M1 - an AssetId string
	// respectively), so their codec is the identity function.
	codec<NamedData>(Named, (data) => data, (json) => json as NamedData),
	codec<PointLightData>(
		PointLight,
		(data) => data,
		(json) => json as PointLightData
	),
	codec<MeshRefData>(MeshRef, (data) => data, (json) => json as MeshRefData),
	codec<MaterialRefData>(
		MaterialRef,
		(data) => data,
		(json) => json as MaterialRefData
	),
];

/** All known component codecs, keyed by the component's string name. */
export const COMPONENT_CODECS_BY_NAME: ReadonlyMap<
	string,
	ComponentCodec<unknown>
> = new Map(CODECS.map((c) => [c.component.name, c]));
