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
    // Main edge detection pipeline using D3 contour detection
    static detectEdges(canvas: HTMLCanvasElement, elevation: number): EdgeDetectionResult {
        console.log(`[EdgeDetection] Processing elevation ${elevation}`)

        const ctx = canvas.getContext('2d')!
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

        const blackValues = this.imageToValues(imageData, canvas.width, canvas.height, true)
        const blackContours = contours()
            .size([canvas.width, canvas.height])
            .thresholds([0.5])(blackValues)

        const whiteValues = this.imageToValues(imageData, canvas.width, canvas.height, false)
        const whiteContours = contours()
            .size([canvas.width, canvas.height])
            .thresholds([0.5])(whiteValues)

        const shapes = this.combineContours(blackContours, whiteContours, canvas.width, canvas.height)

        console.log(`[EdgeDetection] Elevation ${elevation}: detected ${shapes.length} composite shapes`)
        shapes.forEach((shape, idx) => {
            console.log(`[EdgeDetection]   Shape ${idx}: outer contour ${shape.outer.length} points, ${shape.holes.length} holes, net area ${shape.area.toFixed(0)}`)
        })

        this.generateContourVisualization(canvas, shapes, elevation)

        return {
            elevation,
            shapes,
            totalShapes: shapes.length
        }
    }

    // Generate visualization overlay showing detected contours
    private static generateContourVisualization(
        originalCanvas: HTMLCanvasElement,
        shapes: Shape[],
        elevation: number
    ): void {
        const vizCanvas = document.createElement('canvas')
        vizCanvas.width = originalCanvas.width
        vizCanvas.height = originalCanvas.height
        const ctx = vizCanvas.getContext('2d')!

        ctx.globalAlpha = 0.3
        ctx.drawImage(originalCanvas, 0, 0)
        ctx.globalAlpha = 1.0

        shapes.forEach((shape, shapeIndex) => {
            const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF']
            const color = colors[shapeIndex % colors.length]

            // outer contour
            ctx.strokeStyle = color
            ctx.lineWidth = 3
            ctx.beginPath()

            if (shape.outer.length > 0) {
                ctx.moveTo(shape.outer[0].x, shape.outer[0].y)
                for (let i = 1; i < shape.outer.length; i++) {
                    ctx.lineTo(shape.outer[i].x, shape.outer[i].y)
                }
                ctx.closePath()
            }
            ctx.stroke()

            // Mark outer contour points
            ctx.fillStyle = color
            shape.outer.forEach(point => {
                ctx.beginPath()
                ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI)
                ctx.fill()
            })

            // holes
            shape.holes.forEach((hole) => {
                ctx.strokeStyle = color
                ctx.lineWidth = 2
                ctx.setLineDash([5, 5])

                ctx.beginPath()
                if (hole.length > 0) {
                    ctx.moveTo(hole[0].x, hole[0].y)
                    for (let i = 1; i < hole.length; i++) {
                        ctx.lineTo(hole[i].x, hole[i].y)
                    }
                    ctx.closePath()
                }
                ctx.stroke()
                ctx.setLineDash([])

                ctx.fillStyle = color
                hole.forEach(point => {
                    ctx.beginPath()
                    ctx.arc(point.x, point.y, 1, 0, 2 * Math.PI)
                    ctx.fill()
                })
            })

            // Add shape labels
            if (shape.outer.length > 0) {
                const centerX = shape.outer.reduce((sum, p) => sum + p.x, 0) / shape.outer.length
                const centerY = shape.outer.reduce((sum, p) => sum + p.y, 0) / shape.outer.length

                ctx.fillStyle = color
                ctx.font = '16px Arial'
                ctx.fillText(`Shape ${shapeIndex}`, centerX - 30, centerY)
                ctx.fillText(`Area: ${shape.area.toFixed(0)}`, centerX - 30, centerY + 16)
            }
        })

        ctx.fillStyle = '#000000'
        ctx.font = 'bold 20px Arial'
        ctx.fillText(`Elevation ${elevation} - Contour Detection`, 10, 30)
        ctx.font = '14px Arial'
        ctx.fillText(`${shapes.length} shapes detected`, 10, 50)

        this.downloadVisualization(vizCanvas, elevation)
    }

    // Download the contour visualization as a PNG image
    private static downloadVisualization(canvas: HTMLCanvasElement, elevation: number): void {
        canvas.toBlob((blob) => {
            if (blob) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
                const filename = `contour_visualization_elevation_${elevation}_${timestamp}.png`

                const url = URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = filename
                link.style.display = 'none'

                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)

                URL.revokeObjectURL(url)

                console.log(`[EdgeDetection] Contour visualization downloaded: ${filename}`)
            }
        }, 'image/png')
    }


    /// Convert image data to value array for contour detection
    private static imageToValues(imageData: ImageData, width: number, height: number, invert = false): number[] {
        const values: number[] = []
        const data = imageData.data

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            const gray = (r + g + b) / 3

            if (invert) {
                values.push((255 - gray) / 255)
            } else {
                values.push(gray / 255)
            }
        }

        return values
    }

    // Combine black and white contours into composite shapes
    private static combineContours(blackContours: any[], whiteContours: any[], canvasWidth: number, canvasHeight: number): Shape[] {
        const shapes: Shape[] = []

        const blackShapes = this.parseD3Contours(blackContours, canvasWidth, canvasHeight, 'black')
        const whiteShapes = this.parseD3Contours(whiteContours, canvasWidth, canvasHeight, 'white')

        blackShapes.forEach(blackShape => {
            const matchedHoles: EdgePoint[][] = []
            let totalHoleArea = 0

            whiteShapes.forEach(whiteShape => {
                if (this.isShapeInsideShape(whiteShape.outer, blackShape.outer)) {
                    matchedHoles.push(whiteShape.outer)
                    totalHoleArea += whiteShape.area
                }
            })

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

    // Parse D3 contour data into Shape objects
    private static parseD3Contours(contourData: any[], canvasWidth: number, canvasHeight: number, type: 'black' | 'white'): Shape[] {
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

                let shouldKeep = false
                if (type === 'black') {
                    shouldKeep = area > 100 && !isImageBorder
                } else {
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

    // Check if the shape is likely an image border
    private static isImageBorderShape(points: EdgePoint[], width: number, height: number): boolean {
        const tolerance = 5
        const hasTopEdge = points.some(p => p.y <= tolerance)
        const hasBottomEdge = points.some(p => p.y >= height - tolerance)
        const hasLeftEdge = points.some(p => p.x <= tolerance)
        const hasRightEdge = points.some(p => p.x >= width - tolerance)
        const edgeCount = [hasTopEdge, hasBottomEdge, hasLeftEdge, hasRightEdge].filter(Boolean).length
        return edgeCount >= 3
    }

    // Check if one shape is completely inside another
    private static isShapeInsideShape(innerShape: EdgePoint[], outerShape: EdgePoint[]): boolean {
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

    // Calculate polygon area
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

    static isPointInShape(x: number, y: number, shape: Shape): boolean {
        const outerPolygon = shape.outer.map(p => [p.x, p.y])
        if (!pointInPolygon([x, y], outerPolygon)) {
            return false
        }

        for (const hole of shape.holes) {
            const holePolygon = hole.map(p => [p.x, p.y])
            if (pointInPolygon([x, y], holePolygon)) {
                return false
            }
        }

        return true
    }
}