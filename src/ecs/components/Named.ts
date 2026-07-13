import { defineComponent } from "../Component";

/**
 * A human-readable label for an entity, shown in the UI (e.g. the Object
 * manager panel). Optional - entities without a Named component just show their
 * id.
 */
export interface NamedData {
	name: string;
}

export const Named = defineComponent<NamedData>("Named");
