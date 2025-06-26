// src/types/opencv.d.ts
declare module '@techstark/opencv-js' {
    interface Mat {
        rows: number
        cols: number
        data: any
        data32S: Int32Array
        delete(): void
    }

    interface MatVector {
        size(): number
        get(index: number): Mat
        delete(): void
    }

    const cv: {
        Mat: new () => Mat
        MatVector: new () => MatVector
        onRuntimeInitialized?: () => void

        // 常量
        COLOR_RGBA2GRAY: number
        RETR_TREE: number
        CHAIN_APPROX_SIMPLE: number

        // 函数
        imread(canvas: HTMLCanvasElement): Mat
        cvtColor(src: Mat, dst: Mat, code: number): void
        findContours(
            image: Mat,
            contours: MatVector,
            hierarchy: Mat,
            mode: number,
            method: number
        ): void
        contourArea(contour: Mat): number
    }

    export = cv
}