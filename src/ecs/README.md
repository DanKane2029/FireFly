# The Firefly ECS

Firefly's world is an **Entity Component System**, hand-rolled with no library.
The core of it — the world, the components, the systems — is about 200 lines of
actual code, and it is meant to be read start to finish. (`prefabs.ts` and
`scenes.ts` alongside it are just content: the meshes, materials, and starting
entities the test scenes are made of.)

## The idea in one paragraph

Most 3D engines start with a scene graph: a `SceneObject` class holding a
transform, a mesh, a material, and an `update()` method, and you subclass it to
make a spinning cube. Firefly used to work exactly that way. An ECS inverts it.
An **entity** is just an id — a number, with no data and no methods. A
**component** is pure data attached to an entity (a `Transform`, a `MeshRef`). A
**system** is a plain function that asks the world for every entity carrying a
particular set of components and does something with them. Data lives in the
world, behavior lives in systems, and a query joins the two.

The payoff is that a thing's capabilities are *composed* rather than *inherited*.
A cube is an entity with a `Transform`, a `MeshRef`, and a `MaterialRef`. Give it
a `Spin` and it rotates — because `AnimationSystem` now matches it. Take the
`MeshRef` away and it stops being drawn but keeps existing. Nothing in the class
hierarchy had to change, because there is no class hierarchy.

## The three primitives

**`World.ts`** — the container. An entity is an id from a counter; storage is one
`Map<Entity, T>` per component type. `query(A, B)` returns every entity that has
*all* of the given components, along with its typed data. It iterates the
smallest store and filters by the rest, so a query costs about what its rarest
component costs, not what the whole world costs.

**`Component.ts`** — `defineComponent<T>(name)` mints a typed handle. The handle
is what keys the store, and it carries the data type `T` in a phantom field so
`world.get(entity, Transform)` comes back typed as `TransformData` with no casts
at the call site. Components are data only: no methods, ever.

**`System.ts`** — a system is just
`(world: World, dt: number, time: number) => void`. `Scheduler` runs an ordered
list of them each frame, because order matters (animate before you draw).

## What's in the world

Components (`components/`), all pure data:

| Component | Data | Meaning |
|---|---|---|
| `Transform` | translation, rotation (Euler degrees), scale | where it is |
| `MeshRef` | `{ mesh }` | what geometry to draw |
| `MaterialRef` | `{ material }` | what shader + properties to draw it with |
| `Named` | `{ name }` | show it in the Object manager panel |
| `Spin` | `{ degreesPerSecond }` | rotate it over time |
| `PointLight` | *(nothing)* | it is a light |

Systems (`systems/`):

- **`AnimationSystem`** queries `[Transform, Spin]` and advances rotation by
  `degreesPerSecond * dt`. This is what replaced the old per-object
  `updateFunction`: one function updates every spinning thing, instead of every
  object carrying its own copy of the behavior.
- **`RenderSystem`** queries `[Transform, MeshRef, MaterialRef]` to build the
  draw list, and separately queries `[Transform, PointLight]` to gather the
  lights. It hands both to the `Renderer`, which knows nothing about entities.

## A frame

`App.render()` (in `../App/App.ts`) is the loop:

1. Measure the real elapsed time since the last frame (clamped, so a backgrounded
   tab doesn't produce one enormous jump).
2. `scheduler.run(world, dt, time)` — currently just `AnimationSystem`.
3. `renderSystem(world, { renderer, camera, ambientLight })` — build the draw
   list and the light list from the world, and draw.

Picking falls out for free: `RenderSystem` writes each entity's **id** into the
id-texture, so clicking a pixel reads back an entity id directly. There is no
lookup table between "render object" and "scene object", because they are the
same number.

## Two decisions worth explaining

**A tag component.** `PointLight` holds no data at all. A light's only state was
its position, and `Transform` already owns position — storing it on the light too
would mean two copies of the one field that has to stay in sync. So the component
is a *tag*: its presence is the information. `world.query(Transform, PointLight)`
means "every entity that is a light, and where it is." A light is moved exactly
the way a mesh is moved.

**The camera is not an entity.** There is exactly one camera and one ambient
light, so they stay plain fields on `App` rather than becoming components. An ECS
is for things you have *many* of and want to query. Forcing a singleton into it
buys nothing and costs a query.

## Adding to it

*A new behavior* — say, making things drift:

```ts
// components/Velocity.ts
export interface VelocityData { unitsPerSecond: vec3; }
export const Velocity = defineComponent<VelocityData>("Velocity");

// systems/MovementSystem.ts
export const movementSystem: System = (world, dt) => {
  for (const [, transform, velocity] of world.query(Transform, Velocity)) {
    vec3.scaleAndAdd(
      transform.translation, transform.translation, velocity.unitsPerSecond, dt
    );
  }
};
```

Then add it to the schedule in `App`'s constructor. Every entity with both
components starts drifting; nothing else in the codebase changes.

*A gotcha worth knowing:* lights live in the world, so `world.clear()` unlights
it. Scene switches clear the world, which is why `App.loadScene` spawns the light
rig before the scene's own entities — otherwise you get a black screen.

## Deliberately not done

Storage is a plain `Map` per component. The industrial-strength version packs
components into typed arrays grouped by archetype so a query walks contiguous
memory. That is the right call at 100,000 entities and the wrong call here: it
would triple the size of `World.ts` and obscure the idea, to speed up a scene
with a dozen objects in it. Also skipped: multi-camera, event/message components,
and world serialization (save/load).

Tests are in `../Tests/ecs.test.ts` — the `World` (create, add, get, has, remove,
destroy, query, clear), the `AnimationSystem`, and the `RenderSystem`'s light
gathering.
