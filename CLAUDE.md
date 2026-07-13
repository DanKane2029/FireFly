# Firefly

A WebGL2 renderer in TypeScript, with a React + dockview editor UI around it.

This is a **learning / portfolio piece**. The code is meant to be *read* — by
people learning graphics, and by people evaluating the author. So legibility beats
cleverness: prefer clear code with real explanatory comments, and keep dependencies
minimal (the ECS and the math are hand-rolled on purpose, not because a library
was unavailable).

## Commands

| | |
|---|---|
| `npm test` | Jest. Fast, no GL context needed. |
| `npx tsc --noEmit` | Typecheck. `strict` is on. |
| `npm run lint` | ESLint (`--fix`). |
| `npm run start:dev` | Dev server on :8080. |
| `npm run build` | Production webpack build. |

**`build`, `start`, and `start:dev` run `prettier --write src/` first.** There is
formatting drift in the tree, so this reformats files you never touched. Before
committing, check `git status` and revert the unrelated churn — don't let it into
your diff.

## Architecture

`src/ecs/` is the heart of it, and **`src/ecs/README.md` explains it properly** —
read that before changing anything in the world model.

The short version: entities are ids, components are pure data in per-type maps,
systems are plain functions that query the world. There is no scene graph and no
`SceneObject` class; those were deliberately deleted. Behavior belongs in a system,
never on a component.

- `src/ecs/` — `World`, `Component`, `System`/`Scheduler`, `components/`, `systems/`
- `src/Renderer/` — the GPU backend. Knows nothing about entities: it takes a list
  of `Renderable`s and light positions. Keep it that way.
- `src/App/App.ts` — the persistent engine. Owns the world, the camera, the
  simulation clock, and the system schedule. Does *not* own the canvas.
- `src/UI/` — React + dockview panels. The Scene panel owns the canvas and calls
  `attachCanvas` / `detachCanvas`, so the world survives a panel being closed.
- `src/Controller/` — input handlers, each receiving the whole `App`.

## Traps

**`world.clear()` unlights the world.** Lights are entities (`Transform` + a
`PointLight` tag), so clearing the world on a scene switch destroys them too.
`App.loadScene` spawns the light rig before the scene's entities — remove that and
you get a black screen.

**`MAX_LIGHTS` is declared twice** — in `Renderer.ts` and in
`Shaders/Lighting.frag.glsl`. Keep them in step.

**Rotation is in degrees.** `Transform.rotation` is Euler degrees, because
gl-matrix's `quat.fromEuler` takes degrees. Don't feed it radians.

**The renderer can't be unit-tested directly** (no GL context in Jest). Test systems
by stubbing the `Renderer` and asserting what they pass to it — see the
`RenderSystem` tests in `src/Tests/ecs.test.ts`.

## Pull requests

**Target PRs at `main`.** This repo has twice ended up with a stack of PRs based on
each other, where every PR showed "merged" but `main` had almost none of the code —
each one merged into its parent branch instead. If work must reach `main`, point it
at `main`, and verify with:

```sh
git fetch https://github.com/DanKane2029/FireFly.git main
git log FETCH_HEAD..<your-branch>   # empty = main really has it
```

"PR merged" is not evidence that `main` has the code.
