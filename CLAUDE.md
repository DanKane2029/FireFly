# Firefly

A WebGL2 **and WebGPU** renderer in TypeScript, with a React + dockview editor
UI around it. Both backends implement one interface and draw the same world.

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
- `src/Renderer/` — the GPU backends. Know nothing about entities: each takes a
  list of `Renderable`s and light positions. Keep it that way.
  `RenderBackend.ts` is the interface; `webgl/` and `webgpu/` implement it, and
  `createBackend.ts` picks one. **Assets hold no GPU handles** — each backend
  caches its own, keyed by the asset (`*ResourceCache.ts`). Putting a handle
  back on a `Mesh`/`Texture`/`ShaderProgram` would re-break dual-backend
  support.
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

**`MAX_LIGHTS` is declared four times** — `RenderBackend.ts` (the source of
truth), `Shaders/Lighting.frag.glsl`, `Shaders/wgsl/Lighting.wgsl`, and again
inline in `Shaders/wgsl/Unlit.wgsl` (WGSL has no includes). A test in
`Tests/Backends.test.ts` fails if they drift.

**A canvas's context type is permanent.** A canvas that has returned a WebGL2
context can never return a WebGPU one, and no cleanup undoes it. Switching
backends therefore needs a *new* `<canvas>` element — `ScenePanel` keys its
canvas on the backend choice so React remounts it. If a backend switch appears
to do nothing, suspect a recycled canvas first.

**The GLSL and WGSL shaders are hand-written twins.** Nothing generates one from
the other. Change one, change both — `Tests/Backends.test.ts` pins the parts
that can be checked without a GPU (`MAX_LIGHTS`, attribute locations), but not
the lighting math.

**WebGPU uniforms are raw bytes.** `webgpu/UniformLayout.ts` must agree with the
WGSL structs exactly; a wrong offset renders a subtly wrong scene rather than
throwing. Note a `vec3` occupies 16 bytes and a `mat3x3` occupies 48, not 36.

**gl-matrix projections need correcting for WebGPU.** OpenGL clip space runs
z from -1 to 1, WebGPU's from 0 to 1. `CLIP_SPACE_CORRECTION` in
`webgpu/WebGPUBackend.ts` handles it; without it the near half of the view
volume is clipped away.

**Picking is async on both backends.** `App.pick` returns a promise even under
WebGL, where the answer is immediate, because WebGPU's readback cannot be
synchronous. A caller that starts an interaction from the result must assume the
world moved on — see `GizmoController.onMouseDown`'s request-id guard.

**Rotation is in degrees.** `Transform.rotation` is Euler degrees, because
gl-matrix's `quat.fromEuler` takes degrees. Don't feed it radians.

**The backends can't be unit-tested directly** (no GPU context in Jest). Test
systems by stubbing `RenderBackend` and asserting what they pass to it — see the
`RenderSystem` tests in `src/Tests/ecs.test.ts`. The backend-adjacent arithmetic
that *can* be tested without a GPU lives in `Tests/UniformLayout.test.ts` and
`Tests/Backends.test.ts`; add to those rather than assuming a change is
unverifiable.

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
