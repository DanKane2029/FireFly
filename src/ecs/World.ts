import { Component } from "./Component";

/** An entity is just an id. All of its data lives in component stores. */
export type Entity = number;

/**
 * The ECS World: the container of entities and their components.
 *
 * The model is deliberately tiny and readable:
 * - An **entity** is a number (an id) with no data of its own.
 * - A **component** is pure data stored in a per-type map keyed by entity.
 * - A **system** is a plain function that queries the world for entities that
 *   have a set of components and acts on their data.
 *
 * Data lives here, behavior lives in systems, and queries join the two. There
 * are no inheritance hierarchies and no objects that mix data with behavior -
 * that is exactly what distinguishes an ECS from a classic OO scene graph.
 *
 * Storage is one `Map<Entity, T>` per component type (a simple, cache-friendly-
 * enough approach for this app's object counts; an archetype/typed-array store
 * would be the optimization if entity counts ever exploded).
 */
export class World {
	private _nextEntity: Entity = 1;
	private readonly _alive = new Set<Entity>();
	// componentId -> (entity -> component data)
	private readonly _stores = new Map<number, Map<Entity, unknown>>();

	/** Creates a new, empty entity and returns its id. */
	create(): Entity {
		const entity = this._nextEntity++;
		this._alive.add(entity);
		return entity;
	}

	/**
	 * Creates an entity with a caller-chosen id instead of the next counter
	 * value. Deserialization only - it is what lets a loaded scene's entity ids
	 * (and anything that references them, e.g. a future `Parent` component)
	 * survive a save/load round trip unchanged. Bumps the id counter if needed
	 * so a later `create()` never collides with a restored id.
	 */
	createWith(entity: Entity): Entity {
		this._alive.add(entity);
		if (entity >= this._nextEntity) {
			this._nextEntity = entity + 1;
		}
		return entity;
	}

	/** Every currently alive entity id, in no particular order. */
	entities(): Entity[] {
		return Array.from(this._alive);
	}

	/** Destroys an entity and removes all of its components. */
	destroy(entity: Entity): void {
		this._alive.delete(entity);
		this._stores.forEach((store) => store.delete(entity));
	}

	/** Whether an entity is still alive. */
	isAlive(entity: Entity): boolean {
		return this._alive.has(entity);
	}

	/** Removes every entity and component (e.g. when switching scenes). */
	clear(): void {
		this._alive.clear();
		this._stores.forEach((store) => store.clear());
		this._nextEntity = 1;
	}

	/** The number of live entities. */
	get size(): number {
		return this._alive.size;
	}

	/** Adds (or replaces) a component's data on an entity; returns the entity for chaining. */
	add<T>(entity: Entity, component: Component<T>, value: T): Entity {
		this.storeFor(component).set(entity, value);
		return entity;
	}

	/** Gets an entity's component data, or undefined if it has none. */
	get<T>(entity: Entity, component: Component<T>): T | undefined {
		return this.storeFor(component).get(entity);
	}

	/** Whether an entity has a component. */
	has<T>(entity: Entity, component: Component<T>): boolean {
		return this.storeFor(component).has(entity);
	}

	/** Removes a component from an entity. */
	remove<T>(entity: Entity, component: Component<T>): void {
		this.storeFor(component).delete(entity);
	}

	// Query overloads: iterate every entity that has ALL the given components,
	// returning the entity plus its typed component values.
	query<A>(a: Component<A>): [Entity, A][];
	query<A, B>(a: Component<A>, b: Component<B>): [Entity, A, B][];
	query<A, B, C>(
		a: Component<A>,
		b: Component<B>,
		c: Component<C>
	): [Entity, A, B, C][];
	query<A, B, C, D>(
		a: Component<A>,
		b: Component<B>,
		c: Component<C>,
		d: Component<D>
	): [Entity, A, B, C, D][];
	query(...components: Component<unknown>[]): unknown[][] {
		if (components.length === 0) {
			return [];
		}

		// Iterate the smallest store and filter by the rest, so the cost scales
		// with the rarest component rather than the whole world.
		const stores = components.map((component) => this.storeFor(component));
		let smallest = 0;
		for (let i = 1; i < stores.length; i++) {
			if (stores[i].size < stores[smallest].size) {
				smallest = i;
			}
		}

		const results: unknown[][] = [];
		for (const entity of stores[smallest].keys()) {
			if (stores.every((store) => store.has(entity))) {
				results.push([
					entity,
					...stores.map((store) => store.get(entity)),
				]);
			}
		}
		return results;
	}

	private storeFor<T>(component: Component<T>): Map<Entity, T> {
		let store = this._stores.get(component.id) as
			| Map<Entity, T>
			| undefined;
		if (!store) {
			store = new Map<Entity, T>();
			this._stores.set(component.id, store);
		}
		return store;
	}
}
