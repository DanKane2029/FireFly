# Firefly → scene creator: roadmap

Status: **plan, not yet started.** Written 2026-07-13, after the ECS migration landed.

## Context

Firefly today is a **renderer**, not a scene creator. It draws three hardcoded scenes
(snowman, bunny, dragon) that exist as functions in `src/ecs/scenes.ts`. The goal is a
tool: import models and textures, build a scene, save it, reopen it.

The gap is bigger than it looks, for one specific reason.

**The World cannot be serialized.** `MeshRef` holds a live `Mesh` that owns GPU
vertex/index buffers; `MaterialRef` holds a live `Material` that owns a compiled
`ShaderProgram`. Components point straight at GPU objects, so there is nothing you can
write to a file. That single fact orders this entire roadmap.

It also settles the Electron question. Electron gives you `fs`. It does not give you
anything worth writing to disk. Build the Electron shell first and you get a desktop app
whose Save button has nothing to save.

## Verified starting state

Established by reading the code, not assumed. Each of these shapes a decision below.

| Area | Reality |
|---|---|
| Persistence | **None, anywhere.** No localStorage, IndexedDB, File System Access, drag-drop, no `JSON.stringify` of app state. The dockview layout resets on every reload. |
| Texturing | **Vestigial.** Shaders declare `uniform sampler2D u_texture` and `a_texCoord`; `Renderer.loadTexture()` and `MaterialPropertyType.TEXTURE` exist. But the fragment shader **never samples it**, no mesh has UVs, nothing ever constructs a `Texture`, and webpack has no image loader. |
| Transform editing | **Does not exist.** No gizmo, no numeric fields. The Inspector edits exactly one thing: the material's `u_color`. **You cannot move an object.** |
| Model import | OBJ only, **bundled at build time** (`import bunnyObj from "…/bunny.obj"` via webpack `asset/source`), parsed at module load. ~4.1 MB of OBJ *text* is inlined in the bundle and both models are parsed on startup regardless of the active scene. No runtime asset loading exists (no `fetch`, no dynamic `import()`). |
| Lighting | Lambert diffuse only. No specular, no PBR, no shadows. Lights have position and nothing else — no color, no intensity, no attenuation. |
| Structure | Flat ECS, no parenting. No undo/redo, no command layer. Editor state is one field: `_selectedId`. |
| Platform | Pure browser SPA. Zero Node/Electron/native deps. No CI. |

Two consequences worth stating plainly:

- **"Import textures" is greenfield**, not an extension. The existing plumbing is decorative.
- **A scene creator you cannot move an object in is not a scene creator.** The transform
  gap is as load-bearing as the file format.

---

## The one idea everything hangs off

Components must stop holding GPU objects and start holding **asset ids**, resolved
through a registry at the point of use.

```ts
// before                            // after
MeshRef     { mesh: Mesh }           MeshRef     { mesh: AssetId }
MaterialRef { material: Material }   MaterialRef { material: AssetId }
```

Worth doing **even if you never save a file**, because `src/ecs/README.md` already claims
components are pure data — and today, for the two most important components, that claim is
false. This makes the codebase honest, and serialization then comes almost free.

Three layers, one rule:

| Layer | Example | Serializable? |
|---|---|---|
| **Descriptor** — how an asset is *made* | `{ kind: "gltf", uri: "assets/ab12-chair.glb", mesh: 0 }` | yes |
| **Runtime object** — how it is *used* | `Mesh`, `Material`, `Texture` (own GPU handles) | no |
| **Registry** — maps id → both | `Map<AssetId, { descriptor, live }>` | rebuilt on load |

> **The rule:** descriptors are how an asset is made; the live object is how it is used.
> **Serialization writes the descriptor.** So anything the user can edit must live in the
> descriptor, and the registry owns the mutation API that writes both.

**This is the single easiest thing in the plan to get wrong.** The Inspector today calls
`material.setProperty("u_color", …)` on a live `Material`. It must instead call
`registry.setMaterialProperty(id, …)`, which updates the descriptor *and* the live object.
Skip that and saved scenes will silently lose every color the user picked.

### Free consequence: undo/redo is a snapshot stack

Once `serialize(world)` exists, undo is: push the string, `deserialize` on undo. At
Firefly's entity counts (dozens), that is a ~40-line undo system needing no command layer,
no diffing, and no discipline from panel code. **Do not build a command/undo layer.** This
is a real reason to do the format before the editing tools.

---

## The scene format

A `.ffscene` is JSON. Assets are referenced by id, never embedded.

```jsonc
{
  "format": "firefly-scene",
  "version": 1,
  "camera":      { "translation": [0,0,2], "orientation": [0,0,0,1], "fovy": 45 },
  "environment": { "ambientLight": [0.1,0.1,0.1], "backgroundColor": [0.2,0.2,0.2,1] },

  "assets": [
    { "id": "mesh/sphere", "type": "mesh",
      "source": { "kind": "primitive", "primitive": "sphere", "segments": 32 } },
    { "id": "mesh/bunny",  "type": "mesh", "source": { "kind": "builtin", "name": "bunny" } },
    { "id": "tex/wood",    "type": "texture", "source": { "kind": "image", "uri": "assets/4b7e-wood.png" } },
    { "id": "mat/bottom",  "type": "material", "shader": "lit",
      "properties": [ { "name": "u_color", "type": "vec4", "value": [1,0,0,1] } ] }
  ],

  "entities": [
    { "id": 1, "components": {
        "Transform": { "translation": [5,0,10], "rotation": [0,0,0], "scale": [1,1,1] },
        "PointLight": {} } },
    { "id": 2, "components": {
        "Named": { "name": "Bottom" },
        "Transform": { "translation": [0,-0.3,0], "rotation": [0,0,0], "scale": [0.2,0.2,0.2] },
        "MeshRef": { "mesh": "mesh/sphere" },
        "MaterialRef": { "material": "mat/bottom" } } }
  ]
}
```

Decisions embedded there, each deliberate:

1. **The lights are in the file.** This *deletes* the trap documented in `CLAUDE.md`
   ("`world.clear()` unlights the world") — `spawnDefaultLights` goes away. But the trap
   moves rather than vanishing: **"File → New" must produce a template document containing
   a camera and a light**, or a new scene is a black screen. Move the comment with it.
2. **`kind: "builtin"`** lets the three demo scenes become real `.ffscene` documents
   *before any file I/O exists*, resolving against the OBJ text webpack already inlines.
   This is what lets the format ship independently of storage.
3. **`environment` exists** because the camera, ambient light, and background are private
   `App` fields, not ECS data. Omit this block and a loaded scene returns with the wrong
   camera and lighting.
4. **Assets are referenced by workspace-relative URI, not embedded.** Two scenes then
   share one 4 MB `.glb` instead of embedding it twice, and the `.ffscene` stays diffable.
   Content-hash the filename prefix on import for free dedupe. Keep an
   `{ "kind": "embedded", "dataUri": … }` escape hatch for single-file sharing, but never
   as the default.

### Landmines the format must respect

These are not theoretical. Each one will bite whoever implements this.

1. **Component ids are assigned by module import order.** `defineComponent` uses
   `nextComponentId++` (`src/ecs/Component.ts`), and `World._stores` is keyed by that
   number — **not stable across builds or refactors**. A scene file must key components by
   their **string `name`** (which `Component` already carries), never by the numeric id.
2. **gl-matrix vectors are `Float32Array` and do not round-trip through JSON.**
   `JSON.stringify(vec3.fromValues(1,2,3))` produces `{"0":1,"1":2,"2":3}` — an object,
   not an array. A naive `JSON.stringify(world)` yields files that look plausible and are
   wrong. This is why each component needs its **own codec** (`toJSON`/`fromJSON`),
   colocated with the component. Not ceremony — the fix.
3. **`MaterialPropertyType` is a numeric enum.** Serialize property types as **strings**
   (`"vec4"`, `"texture"`); renumbering the enum must not corrupt saved files.
4. **`Mesh` has no id, name, or source path.** "This entity uses the bunny" is currently
   unsayable in data. The registry must *introduce* identity, not reuse it.
5. **Entity ids: add `World.createWith(id)`** (deserialization only) and preserve ids
   across a round-trip. Picking ids and selection then survive a load, and a future
   `Parent` component's cross-entity references just work with no remap table.
6. **The id-texture is `R16I`** — entity ids are capped at signed 16-bit (~32767). Fine at
   current scale, but it constrains any scheme that reserves ids (e.g. gizmo handles).
7. **Per-entity materials.** Today `spawnSnowman` calls `litMaterial()` nine times, so each
   ball owns a distinct `Material` and a color edit affects one ball. **Mint a fresh
   `AssetId` per `litMaterial()` call**, or the refactor silently makes editing one ball
   recolor all nine. Shared materials should be an explicit user action later, not an
   accident.
8. **`OBJLoader.normalizeToUnitBox` is destructive and unconditional.** Every import is
   recentered and rescaled so its longest axis is 1 unit — **authored scale and the
   relative size of two models are destroyed at parse time**. Correct for a demo, wrong for
   a scene creator (importing a chair and a house should not make them the same size).
   glTF must *not* inherit this; "fit to view" belongs in the editor as an explicit action.

---

## The storage abstraction (what makes dual-target cheap)

One narrow interface, several implementations. **Hard rule: nothing under `src/Renderer/`,
`src/ecs/`, `src/Geometry/`, or `src/UI/` may import `electron`, touch
`window.showSaveFilePicker`, or ever see a filesystem path.**

```ts
// src/platform/Storage.ts
export interface FileRef { readonly key: string; readonly name: string; } // opaque — NOT a path

export interface StorageCapabilities {
  overwriteInPlace: boolean;  // false on Firefox/Safari → "Save" becomes "Download"
  pickFolders: boolean;
  recents: boolean;
}

export interface Storage {
  readonly capabilities: StorageCapabilities;
  pickOpenFile(o: { extensions: string[] }): Promise<FileRef | null>;
  pickSaveFile(o: { suggestedName: string; extensions: string[] }): Promise<FileRef | null>;
  readText(ref: FileRef): Promise<string>;
  writeText(ref: FileRef, text: string): Promise<void>;
  readBytes(path: string): Promise<Uint8Array>;
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
  openWorkspace(): Promise<WorkspaceRef | null>;
  recentWorkspaces(): Promise<RecentEntry[]>;
}
```

Three properties make it platform-blind:

1. **It traffics only in `Uint8Array` and `string`** — never a path, a `File`, or a
   `FileSystemHandle`. The browser impl keeps a private `Map<key, FileSystemFileHandle>`;
   the Electron impl maps `key` → an absolute path *that never leaves the main process*.
   That is simultaneously the abstraction boundary and the `contextIsolation` security
   boundary. Not a coincidence — the point.
2. **Everything is async**, even where the browser could be synchronous, or it cannot be
   implemented over IPC.
3. **`capabilities` is the one honest leak.** Instead of `if (isElectron)` scattered through
   the UI, the File menu reads `capabilities.overwriteInPlace` and shows "Save" or
   "Download". Platform difference becomes *data*, in one place. Feature-detect
   (`"showSaveFilePicker" in window`) — never sniff the user agent.

| Implementation | Platform | Notes |
|---|---|---|
| `MemoryStorage` | tests | **Build this first.** Makes the whole persistence layer unit-testable in the existing `testEnvironment: "node"` Jest setup with zero mocking. |
| `FileSystemAccessStorage` | Chrome / Edge | Real Open/Save dialogs. Handles are structured-cloneable → persist them in **IndexedDB** for genuine "recent workspaces". |
| `OpfsStorage` | Firefox / Safari | **The File System Access API is Chromium-only** — Firefox and Safari never shipped it and Mozilla formally called local-disk pickers harmful. Both ship **OPFS**, so imported assets still get a real home and `assets/…` URIs still resolve; Open uses `<input type=file>`, Save uses a `Blob` download. This is what keeps the web demo genuinely functional rather than crippled. |
| `IpcStorage` | Electron | Thin wrapper over the preload's `window.firefly.storage.*`. |

`src/platform/index.ts` is the **only** file that knows platforms exist
(`createStorage(): Storage`). `App` takes a `Storage`; `index.tsx` injects the real one;
tests inject `MemoryStorage`.

---

## Is Electron a good idea? Yes — but last

**The honest case for it.** The browser cannot give you the workspace story you want. The
File System Access API — real dialogs, overwrite-in-place, reopen a project folder — is
**Chromium-only**. On Firefox and Safari, "save your workspace" degrades to
download-a-file / upload-it-back. Electron removes that ceiling entirely and adds native
menus, drag-drop from Finder/Explorer, and real paths.

**Why Electron and not Tauri**, specifically for *this* app: Tauri ships the OS webview
(WebKitGTK on Linux, WebView2 on Windows), so the WebGL2/ANGLE stack differs per platform.
For a renderer whose whole purpose is producing identical pixels, that is the one thing you
cannot tolerate. Electron bundles Chromium — one GL stack everywhere. (Same reason Figma
ships Electron.) Tauri's size win is real and irrelevant here.

**But it is the lowest-value milestone for a portfolio**, because nobody evaluating you
downloads a desktop binary. Its real payoff is native workspaces — plus the fact that a
typed-IPC / `sandbox: true` / custom-protocol setup is itself a nice teachable artifact.

**What it costs**

| | |
|---|---|
| Deps | `electron`, `electron-builder`, `@types/node`, `concurrently` + `wait-on` |
| New files | `electron/main.ts` (BrowserWindow, menus, `ipcMain.handle`, dialogs), `electron/preload.ts` (`contextBridge`, `ipcRenderer.invoke` only), `electron/ipc.ts` (typed channels), `electron-builder.yml`, `tsconfig.electron.json` (current tsconfig is `module: es6` with no node types) |
| Webpack | Becomes a **multi-compiler array**: renderer (keep `target: web` — one bundle serves both), `electron-main`, `electron-preload`. A genuine config refactor, not a flag. |
| package.json | `main` must point at the built main process. It currently says `"main": "index.js"` — **a file that does not exist** — and `"name": "web-template"`. Both stale. |

**What breaks, and the fixes:**

- **`file://` gives you a `null` origin**, which kills OPFS and IndexedDB and trips
  module/worker restrictions. Don't fight it — register a custom `app://` scheme with
  `protocol.handle` and serve the bundle from it. That also fixes relative asset paths and
  gives you a real origin for CSP.
- **There is no CSP at all** in `src/index.html` today, and Electron warns loudly. Note MUI
  and emotion inject runtime `<style>` tags, so you need `style-src 'unsafe-inline'` (or an
  emotion nonce).
- **`sandbox: true` means the preload cannot `require("fs")`.** All filesystem work lives
  in main behind `ipcMain.handle`. The `Storage` interface above is already shaped for
  exactly this.
- **Asset paths do *not* break** — precisely because `Storage` hands out opaque `FileRef`s
  and `Uint8Array`s. That is the payoff of doing storage first.

**The real cost is distribution, not code.** A working shell is about a day.

| Target | Cost |
|---|---|
| Linux (AppImage/deb) | Free, no signing, works. |
| Windows | Unsigned `.exe` → SmartScreen "unknown publisher". OV cert ≈ $100–400/yr. **For a portfolio: ship unsigned and say so.** |
| macOS | Unsigned `.app` is **blocked** by Gatekeeper. Real distribution needs an Apple Developer account ($99/yr) + hardened runtime + **notarization**, and can only be built on macOS. Recurring. |

There is **no CI**; emitting all three artifacts needs a 3-OS GitHub Actions matrix.

**Verdict: build it, but keep the web build.** A portfolio piece has to be one click.

---

## Roadmap

Each row is one PR to `main` (small and reviewable — the house style), and each leaves the
app runnable. Verify main actually has it with the `git log FETCH_HEAD..<branch>` check in
`CLAUDE.md`.

| # | Milestone | Depends on | Why here |
|---|---|---|---|
| **M0** | Cheap fixes (below) | — | Removes noise from every later diff. |
| **M1** | **Asset registry + handle indirection** (no file I/O) | — | Unblocks everything. Zero visible behavior change. |
| **M2** | **`.ffscene` serialize/deserialize**, in-memory | M1 | The format. **Also *is* the undo system.** |
| **M3** | **Transform editing in the Inspector** (numeric T/R/S) | — | Independent. Today you cannot move an object; this costs a day and is the biggest "it's a creator now" payoff. |
| **M4** | **Storage + Save/Open a scene** | M2 | Text I/O only. Save/load working on the web. |
| **M5** | **Workspace** (asset bytes, recents, dockview layout) | M4 | What "workspace" means to a user. |
| **M6** | **Make texturing real** (shader samples; UVs; **VAOs**) | M1 | Prerequisite for glTF meaning anything. |
| **M7** | **Hand-rolled glTF 2.0 `.glb` parser** | M1, M5, M6 | The import format. |
| **M8** | **Transform gizmo** | M3, M6 | Polish on a working creator. |
| **M9** | **Electron shell** | M4, M5 | Last. Lowest value, highest ceremony. |

**M3 can be pulled forward** — it touches nothing M1/M2 touch. Ship it in parallel.

### M0 — cheap fixes worth doing first
- **`gl.enable(gl.CULL_FACE)`** — `Renderer.ts` calls `gl.cullFace(gl.BACK)` (which only
  selects *which* face) but never enables culling.
- **Transparency is dead**: blending is enabled, but the fragment shader hardcodes
  `alpha = 1`, discarding the material's alpha.
- **`devtool: "inline-source-map"` is applied in production** — most of why `dist/index.js`
  is 9.5 MB. Use `source-map` for prod.
- Fix `package.json` `name` / `main` (needed for Electron regardless).
- **No `gl.deleteBuffer`/`deleteProgram` exists anywhere** → every scene switch leaks GPU
  buffers. Give the registry a `dispose(id)` and the Renderer the matching deletes.

### M6 — texturing is bigger than it looks
- The fragment shader declares `u_texture` and **never samples it**. Sample and multiply
  into albedo. **Use a 1×1 white default texture rather than a `u_hasTexture` bool** — no
  branch, no extra uniform, and it's the standard trick worth teaching.
- **No mesh emits UVs**, and no `VertexBufferLayout` declares `a_texCoord`. `Sphere` is
  trivial (`u = θ/2π`, `v = φ/π`); `Box` needs per-face UVs. `Mesh.interleave` **throws** if
  a layout names an attribute the `Vertex` lacks, so this is not a one-liner.
- **⚠️ The latent bug this will detonate: there are no VAOs.** `setVertexAttributes` calls
  `enableVertexAttribArray` on the default VAO and **never disables anything**. It works
  today only because every mesh has the identical `[a_position, a_normal]` layout. The
  moment some meshes have `a_texCoord` and some don't, a slot enabled by mesh A stays
  enabled — still pointing at A's buffer with A's stride — while mesh B draws. The symptom
  is intermittent geometry corruption that looks like a shader bug. **Fix it properly: give
  each `Mesh` a VAO.** That is the correct WebGL2 answer, it deletes the per-draw attribute
  setup, and it belongs in a teaching renderer.
- `setMaterial` hardcodes `TEXTURE0` → **one texture per material** until a texture-unit
  allocator exists. There are currently **no `texParameteri` calls at all**, so set
  wrap/filter explicitly or non-power-of-two textures render black.
- **Pick a UV origin and write it down.** glTF is top-left; classic OBJ/OpenGL is
  bottom-left. Choose glTF (no `UNPACK_FLIP_Y_WEBGL`) and be consistent — getting this
  wrong produces vertically mirrored textures that look "almost right".

### M7 — glTF, with scope discipline
Support: `.glb` only (one binary — sidesteps external `.bin`/image URIs), triangles only,
`POSITION`/`NORMAL`/`TEXCOORD_0`, `pbrMetallicRoughness.baseColorFactor` +
`baseColorTexture`. **Explicitly not:** sparse accessors, animation, skinning, morph
targets, Draco, KHR extensions. Say so in the file header — **the stated boundary is the
portfolio artifact.**

- **glTF nodes are a hierarchy; the ECS is flat.** Flatten to world TRS at import.
  Decomposing a world matrix back to T/R/S is exact only when scale is uniform or
  axis-aligned with the rotation — accept and comment the approximation.
- **glTF rotations are quaternions; `TransformData.rotation` is Euler degrees.** Convert at
  import (lossy, gimbal-prone). Don't churn `TransformData` to a quat preemptively — the
  gizmo (M8) is what would justify it.
- **Satisfying finish:** convert `bunny.obj` / `dragon.obj` to `.glb`, load them at runtime
  through `Storage`, and delete the `asset/source` webpack rule. Removes ~4.1 MB of inlined
  text from the bundle and exercises the whole pipeline end to end.

### M8 — gizmo
Reuse the GPU picking: draw axis handles into the id-texture with **reserved ids** (the
`R16I` range is the constraint). `Renderer.render()` is a single loop over one list, so a
gizmo needs an **overlay pass** (depth test off, drawn after the scene) — a contained
change. Drag math goes in a `GizmoController`, matching the existing controller pattern.

---

## Verification

- **Unit (existing Jest, no GL):** scene round-trip — build a World, serialize, clear,
  deserialize, assert component data is deep-equal. Asset-registry resolution. glTF parsing
  against a small committed `.glb` fixture. `MemoryStorage` makes the persistence layer
  testable with zero mocking.
- **Manual** (`npm run start:dev` → http://localhost:8080): build a scene, move an object,
  save, hard-refresh, reopen — confirm it returns identically, *camera and lighting
  included*. Then import a `.glb` with a texture and confirm it renders textured.
- **Electron smoke (M9):** package it, open a scene from disk, save in place, and confirm
  the same file opens in both the web and desktop builds. That cross-check is the real proof
  the storage seam holds.
- Every milestone keeps `tsc --noEmit` clean, the suite green, and the production build
  compiling.
