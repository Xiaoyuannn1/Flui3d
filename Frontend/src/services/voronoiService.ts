// src/services/voronoiService.ts
import { Delaunay } from 'd3-delaunay'
import { EdgeDetectionService, Shape } from './edgeDetectionService'
import * as polygonClipping from 'polygon-clipping'

export interface VoronoiCell {
    seedPoint: { x: number, y: number }
    polygon: { x: number, y: number }[]
    compensation: number
}

export interface ShapeVoronoi {
    shapeIndex: number
    cells: VoronoiCell[]
}

export interface VoronoiResult {
    elevation: number
    shapes: ShapeVoronoi[]
}

export class VoronoiService {

    // Perform Voronoi division for valid points within a single shape
    static divideShape(
        seedPoints: Array<{x: number, y: number, compensation: number}>,
        shape: Shape,
        canvasWidth: number,
        canvasHeight: number
    ): VoronoiCell[] {

        if (seedPoints.length === 0) return []
        console.log(`[Voronoi] Shape has ${seedPoints.length} seed points, starting precise Voronoi division`)

        const points: [number, number][] = seedPoints.map(p => [p.x, p.y] as [number, number])

        const delaunay = Delaunay.from(points)

        const voronoi = delaunay.voronoi([0, 0, canvasWidth, canvasHeight])

        const clipPolygon = this.shapeToClipPolygon(shape)

        const cells: VoronoiCell[] = []

        for (let i = 0; i < seedPoints.length; i++) {
            const seedPoint = seedPoints[i]

            const cell = voronoi.cellPolygon(i)
            if (!cell) continue

            const voronoiPolygon: polygonClipping.Polygon = [
                cell.map(point => [point[0], point[1]] as [number, number])
            ]

            try {
                const clippedPolygons = polygonClipping.intersection(voronoiPolygon, clipPolygon)

                clippedPolygons.forEach(clippedPoly => {
                    if (clippedPoly.length > 0 && clippedPoly[0].length >= 3) {
                        const polygon = clippedPoly[0].map(point => ({
                            x: point[0],
                            y: point[1]
                        }))
                        if (this.isPointInPolygon(seedPoint.x, seedPoint.y, polygon)) {
                            cells.push({
                                seedPoint: { x: seedPoint.x, y: seedPoint.y },
                                polygon: polygon,
                                compensation: seedPoint.compensation
                            })
                        }
                    }
                })

            } catch (error) {
                console.warn(`[Voronoi] Clipping failed for seed point ${i}:`, error)
                if (EdgeDetectionService.isPointInShape(seedPoint.x, seedPoint.y, shape)) {
                    const fallbackPolygon = this.createFallbackCircle(seedPoint.x, seedPoint.y, 5)
                    cells.push({
                        seedPoint: { x: seedPoint.x, y: seedPoint.y },
                        polygon: fallbackPolygon,
                        compensation: seedPoint.compensation
                    })
                }
            }
        }

        console.log(`[Voronoi] Precise clipping completed, generated ${cells.length} Voronoi cells (target ${seedPoints.length})`)

        const coveredSeeds = new Set(cells.map(cell => `${cell.seedPoint.x},${cell.seedPoint.y}`))
        const missedSeeds = seedPoints.filter(seed =>
            !coveredSeeds.has(`${seed.x},${seed.y}`)
        )

        if (missedSeeds.length > 0) {
            console.warn(`[Voronoi] ${missedSeeds.length} seed points failed to generate regions, adding fallback handling`)

            missedSeeds.forEach(seed => {
                if (EdgeDetectionService.isPointInShape(seed.x, seed.y, shape)) {
                    const fallbackPolygon = this.createFallbackCircle(seed.x, seed.y, 3)
                    cells.push({
                        seedPoint: { x: seed.x, y: seed.y },
                        polygon: fallbackPolygon,
                        compensation: seed.compensation
                    })
                }
            })
        }

        console.log(`[Voronoi] Final generated ${cells.length} Voronoi cells`)
        return cells
    }

    // Convert shape to polygon-clipping format with holes support
    private static shapeToClipPolygon(shape: Shape): polygonClipping.Polygon {
        const outerRing: [number, number][] = shape.outer.map(point => [point.x, point.y] as [number, number])

        const holes: [number, number][][] = shape.holes.map(hole =>
            hole.map(point => [point.x, point.y] as [number, number])
        )
        return [outerRing, ...holes]
    }

    // Point-in-polygon test using ray casting
    private static isPointInPolygon(x: number, y: number, polygon: {x: number, y: number}[]): boolean {
        let inside = false
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            if (((polygon[i].y > y) !== (polygon[j].y > y)) &&
                (x < (polygon[j].x - polygon[i].x) * (y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
                inside = !inside
            }
        }
        return inside
    }

    // Create fallback circular polygon for missed points
    private static createFallbackCircle(centerX: number, centerY: number, radius: number): {x: number, y: number}[] {
        const points: {x: number, y: number}[] = []
        const segments = 8

        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * 2 * Math.PI
            points.push({
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius
            })
        }

        return points
    }

    // Generate and download Voronoi visualization
    static generateVoronoiVisualization(
        originalCanvas: HTMLCanvasElement,
        voronoiResult: VoronoiResult,
        allValidPoints: Array<{x: number, y: number, compensation: number}>
    ): void {

        console.log(`[Voronoi] Starting to draw precisely clipped Voronoi diagram, ${allValidPoints.length} valid points`)

        const vizCanvas = document.createElement('canvas')
        vizCanvas.width = originalCanvas.width
        vizCanvas.height = originalCanvas.height
        const ctx = vizCanvas.getContext('2d')!

        ctx.globalAlpha = 0.3
        ctx.drawImage(originalCanvas, 0, 0)
        ctx.globalAlpha = 1.0

        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
            '#F1948A', '#82E0AA', '#85C1E9', '#F8C471', '#D2B4DE'
        ]

        let totalDrawnCells = 0

        voronoiResult.shapes.forEach((shapeVoronoi, shapeIndex) => {
            console.log(`[Voronoi] Drawing ${shapeVoronoi.cells.length} precise Voronoi cells for shape ${shapeIndex}`)

            shapeVoronoi.cells.forEach((cell, cellIndex) => {
                const colorIndex = (shapeIndex * 15 + cellIndex) % colors.length
                const color = colors[colorIndex]

                if (cell.polygon.length >= 3) {
                    ctx.strokeStyle = color
                    ctx.lineWidth = 1.5
                    ctx.setLineDash([])

                    ctx.beginPath()
                    ctx.moveTo(cell.polygon[0].x, cell.polygon[0].y)
                    for (let i = 1; i < cell.polygon.length; i++) {
                        ctx.lineTo(cell.polygon[i].x, cell.polygon[i].y)
                    }
                    ctx.closePath()

                    ctx.fillStyle = color + '40'
                    ctx.fill()
                    ctx.stroke()

                    totalDrawnCells++
                }

                ctx.fillStyle = color
                ctx.beginPath()
                ctx.arc(cell.seedPoint.x, cell.seedPoint.y, 3, 0, 2 * Math.PI)
                ctx.fill()

                ctx.strokeStyle = '#000000'
                ctx.lineWidth = 1
                ctx.stroke()

                ctx.fillStyle = '#000000'
                ctx.font = 'bold 9px Arial'
                const text = `${cell.compensation.toFixed(0)}`
                ctx.fillText(text, cell.seedPoint.x + 5, cell.seedPoint.y - 5)
            })
        })

        ctx.fillStyle = '#000000'
        ctx.font = 'bold 16px Arial'
        ctx.fillText(`Elevation ${voronoiResult.elevation} - Precise Voronoi Division`, 10, 25)

        ctx.font = '12px Arial'
        const totalCells = voronoiResult.shapes.reduce((sum, s) => sum + s.cells.length, 0)
        ctx.fillText(`Valid points: ${allValidPoints.length}, Generated regions: ${totalCells}, Drawn regions: ${totalDrawnCells}`, 10, 45)
        ctx.fillText(`Using polygon-clipping for precise clipping, preserving all boundary details`, 10, 65)

        if (totalCells === allValidPoints.length) {
            ctx.fillStyle = '#00AA00'
            ctx.font = 'bold 12px Arial'
            ctx.fillText(`✓ Perfect match: all valid points have corresponding regions`, 10, 85)
        } else {
            ctx.fillStyle = '#FF6600'
            ctx.font = 'bold 12px Arial'
            ctx.fillText(`Partial match: ${totalCells}/${allValidPoints.length} regions generated`, 10, 85)
        }

        this.downloadVoronoiVisualization(vizCanvas, voronoiResult.elevation)
    }

    private static downloadVoronoiVisualization(canvas: HTMLCanvasElement, elevation: number): void {
        canvas.toBlob((blob) => {
            if (blob) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
                const filename = `voronoi_precise_elevation_${elevation}_${timestamp}.png`

                const url = URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = filename
                link.style.display = 'none'

                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)

                URL.revokeObjectURL(url)
            }
        }, 'image/png')
    }
}