import { createRoot } from "react-dom/client";
import { App } from "./App/App";
import { EngineProvider } from "./UI/EngineContext";
import { Editor } from "./UI/Editor";
import "./style.css";

// The persistent engine: owns the Scene and lives for the whole session. Panels
// (including the Scene panel that renders the WebGL view) attach to it.
const app = new App();

const container = document.getElementById("root");
if (container === null) {
	throw new Error("Root container #root was not found in the document.");
}

createRoot(container).render(
	<EngineProvider app={app}>
		<Editor />
	</EngineProvider>
);
