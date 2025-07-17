class IdManager {
	private static _counter = 1;

	static getId(): number {
		return IdManager._counter++;
	}
}

export { IdManager };
