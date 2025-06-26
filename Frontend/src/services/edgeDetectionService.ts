// src/services/edgeDetectionService.ts
import { contours } from 'd3-contour'
import pointInPolygon from 'point-in-polygon'

export interface EdgePoint {
    x: number
    y: number
}

export interface Shape {
    id: number
    outer: EdgePoint[]
    holes: EdgePoint[][]
    area: number
}

export interface EdgeDetectionResult {
    elevation: number
    shapes: Shape[]
    totalShapes: number
}

export class EdgeDetectionService {

    static detectEdges(canvas: HTMLCanvasElement, elevation: number): EdgeDetectionResult {
        console.log(`[EdgeDetection] 开始处理 Elevation ${elevation}`)

        const ctx = canvas.getContext('2d')!
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

        // 方法1：检测黑色区域的轮廓（实体结构）
        const blackValues = this.imageToValues(imageData, canvas.width, canvas.height, true)  // 黑→1
        const blackContours = contours()
            .size([canvas.width, canvas.height])
            .thresholds([0.5])(blackValues)

        // 方法2：检测白色区域的轮廓（挖空区域）
        const whiteValues = this.imageToValues(imageData, canvas.width, canvas.height, false) // 白→1
        const whiteContours = contours()
            .size([canvas.width, canvas.height])
            .thresholds([0.5])(whiteValues)

        // 组合检测结果
        const shapes = this.combineContours(blackContours, whiteContours, canvas.width, canvas.height)

        console.log(`[EdgeDetection] Elevation ${elevation}: 检测到 ${shapes.length} 个复合形状`)
        shapes.forEach((shape, idx) => {
            console.log(`[EdgeDetection]   形状${idx}: 外轮廓${shape.outer.length}点, 内孔${shape.holes.length}个, 净面积${shape.area.toFixed(0)}`)
        })

        return {
            elevation,
            shapes,
            totalShapes: shapes.length
        }
    }

    /**
     * 将图像数据转换为数值数组
     */
    private static imageToValues(imageData: ImageData, width: number, height: number, invert = false): number[] {
        const values: number[] = []
        const data = imageData.data

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            const gray = (r + g + b) / 3

            if (invert) {
                // 反转：黑色(0) -> 1，白色(255) -> 0
                values.push((255 - gray) / 255)
            } else {
                // 原逻辑：白色 -> 1，黑色 -> 0
                values.push(gray / 255)
            }
        }

        return values
    }

    /**
     * 组合黑色和白色轮廓检测结果
     */
    private static combineContours(
        blackContours: any[],
        whiteContours: any[],
        canvasWidth: number,
        canvasHeight: number
    ): Shape[] {
        const shapes: Shape[] = []

        // 1. 解析黑色轮廓作为主要形状
        const blackShapes = this.parseD3Contours(blackContours, canvasWidth, canvasHeight, 'black')

        // 2. 解析白色轮廓作为潜在的holes
        const whiteShapes = this.parseD3Contours(whiteContours, canvasWidth, canvasHeight, 'white')

        // 3. 为每个黑色形状匹配对应的白色holes
        blackShapes.forEach(blackShape => {
            const matchedHoles: EdgePoint[][] = []
            let totalHoleArea = 0

            // 检查哪些白色形状在这个黑色形状内部
            whiteShapes.forEach(whiteShape => {
                if (this.isShapeInsideShape(whiteShape.outer, blackShape.outer)) {
                    matchedHoles.push(whiteShape.outer)
                    totalHoleArea += whiteShape.area
                }
            })

            // 计算净面积：外轮廓面积 - 所有挖空面积
            const netArea = blackShape.area - totalHoleArea

            shapes.push({
                id: shapes.length,
                outer: blackShape.outer,
                holes: matchedHoles,
                area: netArea
            })
        })

        return shapes
    }

    /**
     * 解析轮廓数据
     */
    private static parseD3Contours(
        contourData: any[],
        canvasWidth: number,
        canvasHeight: number,
        type: 'black' | 'white'
    ): Shape[] {
        const shapes: Shape[] = []

        contourData.forEach((contour) => {
            if (!contour.coordinates || contour.coordinates.length === 0) return

            contour.coordinates.forEach((polygon: any) => {
                if (polygon.length === 0) return

                const outerRing = polygon[0]
                if (!outerRing || outerRing.length < 3) return

                const outer = outerRing.map((point: number[]) => ({
                    x: Math.round(point[0]),
                    y: Math.round(point[1])
                }))

                const area = this.calculatePolygonArea(outer)
                const isImageBorder = this.isImageBorderShape(outer, canvasWidth, canvasHeight)

                // 不同类型的过滤条件
                let shouldKeep = false
                if (type === 'black') {
                    // 黑色形状：面积大且不是图像边界
                    shouldKeep = area > 100 && !isImageBorder
                } else {
                    // 白色形状：面积大，可以是图像边界
                    shouldKeep = area > 50
                }

                if (shouldKeep) {
                    shapes.push({
                        id: shapes.length,
                        outer,
                        holes: [],
                        area
                    })
                }
            })
        })

        return shapes
    }

    /**
     * 检查是否是图像边界形状
     */
    private static isImageBorderShape(points: EdgePoint[], width: number, height: number): boolean {
        const tolerance = 5

        const hasTopEdge = points.some(p => p.y <= tolerance)
        const hasBottomEdge = points.some(p => p.y >= height - tolerance)
        const hasLeftEdge = points.some(p => p.x <= tolerance)
        const hasRightEdge = points.some(p => p.x >= width - tolerance)

        const edgeCount = [hasTopEdge, hasBottomEdge, hasLeftEdge, hasRightEdge].filter(Boolean).length

        return edgeCount >= 3
    }

    /**
     * 检查一个形状是否在另一个形状内部
     */
    private static isShapeInsideShape(innerShape: EdgePoint[], outerShape: EdgePoint[]): boolean {
        // 检查内部形状的几个关键点是否都在外部形状内
        const testPoints = [
            innerShape[0],
            innerShape[Math.floor(innerShape.length / 2)],
            innerShape[innerShape.length - 1]
        ]

        const outerPolygon = outerShape.map(p => [p.x, p.y])

        return testPoints.every(point =>
            pointInPolygon([point.x, point.y], outerPolygon)
        )
    }

    /**
     * 计算多边形面积
     */
    private static calculatePolygonArea(points: EdgePoint[]): number {
        if (points.length < 3) return 0

        let area = 0
        for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length
            area += points[i].x * points[j].y
            area -= points[j].x * points[i].y
        }
        return Math.abs(area) / 2
    }

    /**
     * 判断点是否在黑色实体部分内
     * 关键：必须在外轮廓内，且不能在任何挖空区域内
     */
    static isPointInShape(x: number, y: number, shape: Shape): boolean {
        // 1. 检查是否在外轮廓内
        const outerPolygon = shape.outer.map(p => [p.x, p.y])
        if (!pointInPolygon([x, y], outerPolygon)) {
            return false  // 不在外轮廓内，肯定不在形状内
        }

        // 2. 检查是否在任何挖空区域内
        for (const hole of shape.holes) {
            const holePolygon = hole.map(p => [p.x, p.y])
            if (pointInPolygon([x, y], holePolygon)) {
                return false  // 在挖空区域内，不算在黑色实体部分
            }
        }

        // 3. 在外轮廓内且不在任何挖空区域内 = 在黑色实体部分内
        return true
    }
}