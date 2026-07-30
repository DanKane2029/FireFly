# Firefly

A WebGL2 renderer and 3D scene editor, written from scratch in TypeScript.

No three.js, no ECS library, no math library beyond `gl-matrix` — the renderer,
the entity system, the loaders, and the editor are all hand-rolled. That is the
point of the project: it exists to be *read*, by people learning graphics
programming and by people evaluating whether I can write this kind of code.

![The Firefly editor: a snowman in the viewport with its head selected, drawn
with a yellow selection outline and the translate gizmo's three axis handles;
the Objects panel lists the scene's nine named entities on the left, and the
Inspector shows the selection's transform and material colour on the
right](docs/screenshots/editor.png)

## What it does

**Editing.** Click to select an object; drag the gizmo's axis handles to move,
rotate, or scale it. Selection is drawn with a yellow silhouette rim. Panels are
dockable and rearrangeable — Scene, Objects, Inspector, Materials, Workspace,
and Render — and the layout persists across reloads. Pressing `w`, `e`, or `r`
swaps the gizmo between translate, rotate, and scale without changing the
selection.

**Assets.** Imports `.obj` and glTF 2.0 `.glb` models, both with hand-written
parsers. Materials are shared, reusable assets rather than per-object copies.

**Scenes.** Saves and loads `.ffscene` files (JSON, versioned, assets referenced
by id rather than embedded). Opens a workspace folder that imported asset bytes
are read from and written to, with a recent-workspaces list.

**Rendering.** Point lighting with textures, drawn into an offscreen framebuffer
with two color attachments — which is what makes picking nearly free, see below.
Cameras are ordinary entities, so you can place one in the scene, move it with
the same gizmo as anything else, and render the view through it in the Render
panel.

## Running it

```bash
npm install
npm run start:dev   # dev server on :8080
npm run build       # production build
npm test            # 151 tests, no GL context required
npx tsc --noEmit    # typecheck; strict is on
```

Needs a browser with WebGL2. The workspace features use the File System Access
API, which today means Chromium; other browsers fall back to an origin-private
filesystem and the app adapts rather than breaking (see
[storage](#storage-without-if-electron) below).

| | |
|---|---|
| **Camera** | right-drag to orbit · scroll to zoom |
| **Tools** | `s` select/move · `c` add cube |
| **Gizmo** | `w` translate · `e` rotate · `r` scale |

### Screenshots

The image above is captured from the running editor rather than hand-made, so it
can't drift into showing something the app doesn't do. Playwright isn't a
project dependency — it's only needed to refresh it:

```bash
npm i --no-save playwright-core
npm run start:dev                 # in one terminal
npm run screenshots               # in another; writes docs/screenshots/
```

Headless Chromium only has a WebGL2 context via SwiftShader, so
[`scripts/screenshots.mjs`](scripts/screenshots.mjs) launches it with the
matching ANGLE flags and waits for the software rasterizer to land a few frames
before the shutter. Set `BASE_URL` if your dev server isn't on `:8080`.

## How it fits together

The world model is an **entity component system**, and
[`src/ecs/README.md`](src/ecs/README.md) explains it properly — read that first
if you're reading the code. The short version: an entity is an id, a component
is pure data in a per-type map, and a system is a plain function that queries
the world. There is no scene graph and no `SceneObject` class; both were
deliberately deleted in favor of composition.

The layers, and the rule that keeps them apart:

- **`src/ecs/`** — `World`, `Component`, `System`, and the components and
  systems themselves.
- **`src/Renderer/`** — the GPU backend. It knows nothing about entities: it
  takes a list of `Renderable`s and a list of light positions. Keeping it
  entity-blind is what makes it testable and replaceable.
- **`src/App/App.ts`** — the persistent engine. Owns the world, the camera, the
  clock, and the system schedule. Notably does *not* own the canvas, so the
  world survives the Scene panel being closed and reopened.
- **`src/UI/`** — React + [dockview](https://dockview.dev/) panels.
- **`src/Controller/`** — input handlers. Camera controls are always-on and
  bound to the right mouse button; the left button belongs to whichever tool is
  active.
- **`src/platform/`** — storage backends behind one interface.

## Three parts worth explaining

### Picking is a texture read, not a raycast

Every frame draws the scene into a framebuffer with two color attachments: the
visible image goes to one, and each object's integer entity id is written to a
second `R16I` "id-texture". Resolving a click is then a single-pixel readback
from that texture — no ray/triangle intersection, no CPU-side copy of the
geometry, and no re-render, because the read samples the frame that was already
drawn. The id-texture clears to `-1`, which reads back as "you clicked the
background."

This falls out of the ECS rather than being designed alongside it. The id in the
texture *is* the entity id, so there's no lookup table mapping "render object"
to "scene object" — they were never two different things.

### The selection outline is one extra draw

The outlined object is drawn a second time, scaled 3% about its own pivot, with
front faces culled so that only the sliver poking past the real mesh survives.
That sliver reads as a rim. It's depth-tested like ordinary geometry, so an
outline correctly disappears behind anything in front of it, and it reuses the
entity's own id so clicking the rim selects the object the rim belongs to.

Scaling about the *local* pivot rather than the world origin is the part that's
easy to get wrong, and it has its own tests in
[`OutlineMath.test.ts`](src/Tests/OutlineMath.test.ts).

### Storage without `if (isElectron)`

Loading a file means something different in Chromium (File System Access), in
Firefox (origin-private filesystem), and in a future Electron build (real
paths). Rather than branching on the host throughout the UI, there is one
`Storage` interface with several implementations, and handles are opaque keys —
never paths. A path would leak the abstraction, and in Electron it would leak
straight through the `contextIsolation` security boundary.

The one honest leak is a `capabilities` object: callers read
`capabilities.overwriteInPlace` to decide whether "Save" can silently overwrite
the open file or has to re-prompt every time. That is a real difference in what
the platform can do, so it gets stated explicitly instead of papered over.

## Tests

151 tests across 14 suites, all runnable without a GPU:

```bash
npm test
```

The renderer itself can't be unit-tested — Jest has no GL context — so the
boundary is drawn at what the renderer is *asked* to do. Systems are tested by
stubbing the `Renderer` and asserting the draw list and light list they build.
Everything above the GPU is tested directly: the ECS world, the math (rays,
spherical coordinates, Euler angles, outline scaling), both model loaders
including their rejection paths, scene serialization round-trips, and the
storage backends.

The glTF loader's tests are mostly about what it *refuses* — bad magic numbers,
unsupported container and asset versions, sparse accessors, external buffer
URIs, non-triangle primitives, missing normals. A loader that silently produces
garbage from a malformed file is worse than one that throws.

## Status

Working today: the editor, the gizmo in all three modes, GPU picking, selection
outlines, `.obj` and `.glb` import, materials as shared assets, camera entities
with a Render panel to shoot through them, scene save/load, and workspace
folders with persisted panel layout.

Deliberately not done: no shadows, no PBR, no animation import, and ECS storage
is a plain `Map` per component rather than packed archetype arrays. That last
one is a real performance ceiling and still the right call — archetype storage
would triple the size of `World.ts` to speed up scenes containing a dozen
objects.

In progress: a scene-creator roadmap adding prefab authoring.

## License

MIT — see [LICENSE](LICENSE).
