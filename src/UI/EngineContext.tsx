import {
	createContext,
	useContext,
	useSyncExternalStore,
	ReactNode,
} from "react";
import { App } from "../App/App";

/**
 * React glue for the imperative core. The whole app shares one `App` instance
 * (the persistent engine that owns the Scene and the selection store). Panels
 * reach it through this context instead of prop-drilling.
 */
const AppContext = createContext<App | null>(null);

interface EngineProviderProps {
	app: App;
	children: ReactNode;
}

/**
 * Makes the shared App instance available to every panel rendered below it.
 */
export function EngineProvider({ app, children }: EngineProviderProps) {
	return <AppContext.Provider value={app}>{children}</AppContext.Provider>;
}

/**
 * Returns the shared App instance. Throws if used outside an EngineProvider.
 */
export function useApp(): App {
	const app = useContext(AppContext);
	if (!app) {
		throw new Error("useApp must be used within an EngineProvider.");
	}
	return app;
}

/**
 * Like `useApp`, but also re-renders the calling component whenever the app's
 * store changes (the selection, or the scene's contents). Panels that display
 * scene/selection state should use this so they stay in sync with the
 * imperative world. Backed by React's `useSyncExternalStore` over the App's
 * `subscribe`/`getSnapshot`.
 */
export function useEditorStore(): App {
	const app = useApp();
	useSyncExternalStore(app.subscribe, app.getSnapshot);
	return app;
}
