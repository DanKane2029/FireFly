/**
 * A component type: a typed handle used to store and look up a kind of
 * pure-data component on entities. You create one per data shape with
 * `defineComponent`, then pass the handle to the World's add/get/has/remove/
 * query methods. The `id` uniquely keys this component's store inside a World.
 *
 * Components hold *only data* - no methods, no behavior. Behavior lives in
 * systems (plain functions) that query the World for entities carrying the
 * components they care about. That separation is the whole point of an ECS.
 */
export interface Component<T> {
	readonly id: number;
	readonly name: string;
	/**
	 * Phantom field so TypeScript can infer the stored data type `T` from a
	 * component handle. It is never assigned a value at runtime.
	 */
	readonly _type?: T;
}

let nextComponentId = 0;

/**
 * Defines a new component type. `T` is whatever per-entity data shape you want
 * to store (usually an interface of plain fields).
 *
 * @param name - A human-readable name (handy for debugging).
 * @returns A typed component handle to use with a World.
 */
export function defineComponent<T>(name: string): Component<T> {
	return { id: nextComponentId++, name };
}
