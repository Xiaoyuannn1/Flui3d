declare module 'mesh-slice-polygon' {
    interface Point {
        x: number;
        y: number;
    }

    interface Polygon {
        points: Point[];
    }

    interface Slicer {
        addTriangle(triangle: number[][]): void;
        slice(z: number): Polygon[];
    }

    function createSlicer(): Slicer;
    export = createSlicer;
}