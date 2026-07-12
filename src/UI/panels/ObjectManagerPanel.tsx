import { useEditorStore } from "../EngineContext";

/**
 * Lists the objects currently in the scene. Clicking a row selects that object
 * (which the Inspector then edits); the ✕ button removes it. Deliberately
 * minimal - its job is to prove the React <-> imperative-Scene state bridge
 * end to end and to serve as a template for richer object management later.
 */
export function ObjectManagerPanel() {
	const app = useEditorStore();
	const objects = app.scene.objectList;

	const remove = (id: number) => {
		app.scene.deleteObject(id);
		// deleteObject does not itself notify; clearing an equal selection emits,
		// otherwise emit explicitly so the list re-renders.
		if (app.selectedId === id) {
			app.select(null);
		} else {
			app.notifyChanged();
		}
	};

	return (
		<div
			style={{
				height: "100%",
				overflow: "auto",
				font: "13px sans-serif",
			}}
		>
			{objects.length === 0 && (
				<div style={{ padding: 8, opacity: 0.6 }}>
					No objects in the scene.
				</div>
			)}
			{objects.map((obj) => {
				const selected = obj.id === app.selectedId;
				return (
					<div
						key={obj.id}
						onClick={() => app.select(obj.id)}
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							padding: "4px 8px",
							cursor: "pointer",
							background: selected ? "#0a84ff" : "transparent",
							color: selected ? "#fff" : "inherit",
						}}
					>
						<span>{obj.name || `Object #${obj.id}`}</span>
						<button
							onClick={(event) => {
								event.stopPropagation();
								remove(obj.id);
							}}
							title="Remove"
							style={{
								background: "none",
								border: "none",
								color: "inherit",
								cursor: "pointer",
							}}
						>
							✕
						</button>
					</div>
				);
			})}
		</div>
	);
}
