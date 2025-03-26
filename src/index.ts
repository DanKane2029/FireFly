import "./style.css";
import { App } from "./App/App";

// Gets the canvas element from the document
const canvas: HTMLCanvasElement = document.getElementById(
	"scene-view"
) as HTMLCanvasElement;

// Initializes the application
const app = new App(canvas);
app.setup();

// Every frame render to the canvas
function step() {
	app.render();
	requestAnimationFrame(step);
}
requestAnimationFrame(step);
