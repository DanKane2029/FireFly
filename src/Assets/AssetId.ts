/**
 * Opaque identifier for a registered asset (a mesh or a material). Components
 * hold one of these instead of the live GPU object it names - see
 * `AssetRegistry` for why.
 */
export type AssetId = string;
