import { vec2, vec3 } from "gl-matrix";

class Mesh {
	private _vertexList: vec3[];
	private _textureCoordList: vec2[];
	private _normalList: vec3[];
	private _indicesList: number[][];

	constructor(
		vertexList: vec3[],
		textureCoordList: vec2[],
		normalList: vec3[],
		indicesList: number[][]
	) {
		this._vertexList = vertexList;
		this._textureCoordList = textureCoordList;
		this._normalList = normalList;
		this._indicesList = indicesList;
	}

	get vertexList(): vec3[] {
		return this._vertexList;
	}

	set vertexList(vertexList: vec3[]) {
		this._vertexList = vertexList;
	}

	get textureCoordList(): vec2[] {
		return this._textureCoordList;
	}

	set textureCoordList(textureCoordList: vec2[]) {
		this._textureCoordList = textureCoordList;
	}

	get normalList(): vec3[] {
		return this._normalList;
	}

	set normalList(normalList: vec3[]) {
		this._normalList = normalList;
	}

	get indicesList(): number[][] {
		return this._indicesList;
	}

	set indicesList(indicesList: number[][]) {
		this._indicesList = indicesList;
	}
}

export { Mesh };
