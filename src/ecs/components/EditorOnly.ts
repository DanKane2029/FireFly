import { defineComponent } from "../Component";

/**
 * Marks an entity as an editor-only visual aid - present so it can be seen
 * and interacted with in the interactive Scene view, but with no business
 * appearing in a final production render (see the Render panel, which
 * queries the world excluding anything tagged with this). The transform
 * gizmo's handles and a camera entity's frustum icon both carry this tag;
 * the camera entity itself is a real, persisted scene object and is *not*
 * excluded from anything else - only from the final render.
 *
 * A tag: there is nothing to store, mere presence is the information (see
 * PointLight's doc comment for the same pattern).
 */
export type EditorOnlyData = Record<string, never>;

export const EditorOnly = defineComponent<EditorOnlyData>("EditorOnly");
