# Firefly

A WebGL2 **and WebGPU** renderer with a 3D scene editor, written from scratch
in TypeScript. The same scene, the same entity system, the same editor — drawn
through either graphics API, switchable at runtime.

No three.js, no ECS library, no math library beyond `gl-matrix` — the renderer,
the entity system, the loaders, and the editor are all hand-rolled. That is the
point of the project: it exists to be *read*, by people learning graphics
programming and by people evaluating whether I can write this kind of code.

<!--
  SCREENSHOT SLOT — add one before sharing this repo widely.
  Run `npm run start:dev`, load a scene, and capture the editor with the Scene,
  Objects, and Inspector panels visible, then uncomment:

  ![The Firefly editor: a dragon mesh selected in the viewport with the
  translate gizmo active, the Objects panel listing scene entities, and the
  Inspector showing its transform](docs/screenshots/editor.png)
-->

## What it does

**Editing.** Click to select an object; drag the gizmo's axis handles to move,
rotate, or scale it. Selection is drawn with a yellow silhouette rim. Panels are
dockable and rearrangeable — Scene, Objects, Inspector, Materials, and Workspace
— and the layout persists across reloads.

**Assets.** Imports `.obj` and glTF 2.0 `.glb` models, both with hand-written
parsers. Materials are shared, reusable assets rather than per-object copies.

**Scenes.** Saves and loads `.ffscene` files (JSON, versioned, assets referenced
by id rather than embedded). Opens a workspace folder that imported asset bytes
are read from and written to, with a recent-workspaces list.

**Rendering.** Point lighting with textures, drawn with two render targets —
the visible image and an integer object-id target, which is what makes picking
nearly free (see below). Two interchangeable backends implement the same
`RenderBackend` interface: WebGL2, and WebGPU where the browser has it.

## Running it

```bash
npm install
npm run start:dev   # dev server on :8080
npm run build       # production build
npm test            # 166 tests, no GPU required
npx tsc --noEmit    # typecheck; strict is on
```

Needs a browser with WebGL2; WebGPU is used automatically where available, and
the **Renderer** menu switches between the two. The workspace features use the File System Access
API, which today means Chromium; other browsers fall back to an origin-private
filesystem and the app adapts rather than breaking (see
[storage](#storage-without-if-electron) below).

| | |
|---|---|
| **Camera** | right-drag to orbit · scroll to zoom |
| **Tools** | `s` select/move · `c` add cube |
| **Gizmo** | `w` translate · `e` rotate · `r` scale |

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
- **`src/Renderer/`** — the GPU backends. They know nothing about entities:
  each takes a list of `Renderable`s and a list of light positions. Keeping
  them entity-blind is what made adding a second one tractable —
  `RenderBackend.ts` is the interface, `webgl/` and `webgpu/` the two
  implementations.
- **`src/App/App.ts`** — the persistent engine. Owns the world, the camera, the
  clock, and the system schedule. Notably does *not* own the canvas, so the
  world survives the Scene panel being closed and reopened.
- **`src/UI/`** — React + [dockview](https://dockview.dev/) panels.
- **`src/Controller/`** — input handlers. Camera controls are always-on and
  bound to the right mouse button; the left button belongs to whichever tool is
  active.
- **`src/platform/`** — storage backends behind one interface.

## Four parts worth explaining

### Two graphics APIs behind one interface

WebGL and WebGPU disagree about almost everything except what a triangle is.
WebGL is a global state machine — bind a buffer, set a uniform by name, flip
`cullFace`, draw. WebGPU decides all of that up front: state is compiled into
immutable pipeline objects, uniforms are raw bytes in a buffer the shader
reinterprets as a struct, and work is recorded into a command encoder and
submitted once.

`RenderBackend` is the seam that makes both expressible. It is deliberately
narrow and stateless from the outside — no bind/unbind, no "set this uniform".
A caller hands over a list of `Renderable`s and the lighting environment, and
the backend decides how to say that in its own API.

Getting there required one change that had nothing to do with WebGPU: GPU
handles used to live *on* the assets. `VertexBuffer` held a `WebGLBuffer`,
`Texture` a `WebGLTexture`. That married every mesh to one context and left no
field a WebGPU handle could occupy. Handles now live in a cache the backend
owns, keyed by the asset, so a `Mesh` is pure CPU-side data that either backend
can upload independently.

Three things fall out of the difference, and each is commented where it lives:

- **The outline pass.** WebGL flips `gl.cullFace(FRONT)` mid-frame and flips it
  back. WebGPU cannot — cull mode is baked into a pipeline — so the same effect
  is a second pipeline, bound partway through the same render pass.
- **Picking became asynchronous.** WebGPU can only map GPU memory back to the
  CPU via a promise, so `pick()` returns one on *both* backends rather than
  offering an API only WebGL can honestly keep. The gizmo awaits it and guards
  against a stale answer.
- **Clip space differs.** `mat4.perspective` produces OpenGL's `z ∈ [-1, 1]`;
  WebGPU wants `[0, 1]`. Handing one to the other unchanged silently clips away
  everything in the near half of the view volume, which reads like a broken
  near plane rather than a coordinate convention. One correction matrix fixes
  it, and a test pins it.

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

166 tests across 16 suites, all runnable without a GPU:

```bash
npm test
```

The backends themselves can't be unit-tested — Jest has no GPU context — so the
boundary is drawn at what a backend is *asked* to do. Systems are tested by
stubbing `RenderBackend` and asserting the draw list and light list they build.
The WebGPU-specific arithmetic *is* tested directly, because it is the part that
fails silently rather than loudly: uniform buffer offsets and padding, the
OpenGL-to-WebGPU clip space correction, readback row alignment, and whether the
GLSL and WGSL twins still agree on `MAX_LIGHTS` and attribute locations.
Everything above the GPU is tested directly: the ECS world, the math (rays,
spherical coordinates, Euler angles, outline scaling), both model loaders
including their rejection paths, scene serialization round-trips, and the
storage backends.

The glTF loader's tests are mostly about what it *refuses* — bad magic numbers,
unsupported container and asset versions, sparse accessors, external buffer
URIs, non-triangle primitives, missing normals. A loader that silently produces
garbage from a malformed file is worse than one that throws.

## Status

Working today: the editor, both backends, the gizmo in all three modes, GPU
picking, selection outlines, `.obj` and `.glb` import, materials as shared assets, scene save/load,
and workspace folders with persisted panel layout.

Deliberately not done: no shadows, no PBR, no animation import, one camera only,
and ECS storage is a plain `Map` per component rather than packed archetype
arrays. That last one is a real performance ceiling and still the right call —
archetype storage would triple the size of `World.ts` to speed up scenes
containing a dozen objects.

In progress: a scene-creator roadmap adding prefab authoring and a final-render
panel.

## License

MIT — see [LICENSE](LICENSE).
