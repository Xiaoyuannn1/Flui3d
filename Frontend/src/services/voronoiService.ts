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

    /**
     * 为单个形状内的有效点进行Voronoi划分
     */
    static divideShape(
        seedPoints: Array<{x: number, y: number, compensation: number}>,
        shape: Shape,
        canvasWidth: number,
        canvasHeight: number
    ): VoronoiCell[] {

        if (seedPoints.length === 0) return []

        console.log(`[Voronoi] 形状内有${seedPoints.length}个种子点，开始精确Voronoi划分`)

        // 1. 提取坐标用于Delaunay三角剖分
        const points: [number, number][] = seedPoints.map(p => [p.x, p.y] as [number, number])

        // 2. 构建Delaunay三角剖分
        const delaunay = Delaunay.from(points)

        // 3. 生成Voronoi图
        const voronoi = delaunay.voronoi([0, 0, canvasWidth, canvasHeight])

        // 4. 准备形状的裁剪多边形（支持holes）
        const clipPolygon = this.shapeToClipPolygon(shape)

        // 5. 为每个种子点进行精确裁剪
        const cells: VoronoiCell[] = []

        for (let i = 0; i < seedPoints.length; i++) {
            const seedPoint = seedPoints[i]

            // 获取原始Voronoi单元
            const cell = voronoi.cellPolygon(i)
            if (!cell) continue

            // 转换为polygon-clipping格式
            const voronoiPolygon: polygonClipping.Polygon = [
                cell.map(point => [point[0], point[1]] as [number, number])
            ]

            try {
                // 使用polygon-clipping进行精确交集
                const clippedPolygons = polygonClipping.intersection(voronoiPolygon, clipPolygon)

                // 处理裁剪结果（可能有多个片段）
                clippedPolygons.forEach(clippedPoly => {
                    if (clippedPoly.length > 0 && clippedPoly[0].length >= 3) {
                        // 取第一个环作为外轮廓
                        const polygon = clippedPoly[0].map(point => ({
                            x: point[0],
                            y: point[1]
                        }))

                        // 验证种子点在裁剪后的多边形内
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
                console.warn(`[Voronoi] 种子点${i}裁剪失败:`, error)
                // 降级处理：如果种子点在形状内，创建一个小圆形区域
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

        console.log(`[Voronoi] 精确裁剪完成，生成${cells.length}个Voronoi单元（目标${seedPoints.length}个）`)

        // 检查是否有遗漏的种子点
        const coveredSeeds = new Set(cells.map(cell => `${cell.seedPoint.x},${cell.seedPoint.y}`))
        const missedSeeds = seedPoints.filter(seed =>
            !coveredSeeds.has(`${seed.x},${seed.y}`)
        )

        if (missedSeeds.length > 0) {
            console.warn(`[Voronoi] ${missedSeeds.length}个种子点未生成区域，添加降级处理`)

            // 为遗漏的种子点创建小圆形区域
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

        console.log(`[Voronoi] 最终生成${cells.length}个Voronoi单元`)
        return cells
    }

    /**
     * 将形状转换为polygon-clipping格式（支持holes）
     */
    private static shapeToClipPolygon(shape: Shape): polygonClipping.Polygon {
        // 外轮廓
        const outerRing: [number, number][] = shape.outer.map(point => [point.x, point.y] as [number, number])

        // 内部holes
        const holes: [number, number][][] = shape.holes.map(hole =>
            hole.map(point => [point.x, point.y] as [number, number])
        )

        // polygon-clipping格式：[外轮廓, ...holes]
        return [outerRing, ...holes]
    }

    /**
     * 检查点是否在多边形内（简单版本）
     */
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

    /**
     * 创建降级圆形区域
     */
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

    /**
     * 生成Voronoi划分可视化图像
     */
    static generateVoronoiVisualization(
        originalCanvas: HTMLCanvasElement,
        voronoiResult: VoronoiResult,
        allValidPoints: Array<{x: number, y: number, compensation: number}>
    ): void {

        console.log(`[Voronoi] 开始绘制精确裁剪的Voronoi图，${allValidPoints.length}个有效点`)

        // 创建可视化Canvas
        const vizCanvas = document.createElement('canvas')
        vizCanvas.width = originalCanvas.width
        vizCanvas.height = originalCanvas.height
        const ctx = vizCanvas.getContext('2d')!

        // 1. 绘制原始切片作为背景（半透明）
        ctx.globalAlpha = 0.3
        ctx.drawImage(originalCanvas, 0, 0)
        ctx.globalAlpha = 1.0

        // 2. 绘制精确裁剪的Voronoi划分
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
            '#F1948A', '#82E0AA', '#85C1E9', '#F8C471', '#D2B4DE'
        ]

        let totalDrawnCells = 0

        voronoiResult.shapes.forEach((shapeVoronoi, shapeIndex) => {
            console.log(`[Voronoi] 绘制形状${shapeIndex}的${shapeVoronoi.cells.length}个精确Voronoi单元`)

            shapeVoronoi.cells.forEach((cell, cellIndex) => {
                const colorIndex = (shapeIndex * 15 + cellIndex) % colors.length
                const color = colors[colorIndex]

                // 绘制精确裁剪的Voronoi单元
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

                    // 填充（半透明）
                    ctx.fillStyle = color + '40'
                    ctx.fill()
                    ctx.stroke()

                    totalDrawnCells++
                }

                // 绘制种子点
                ctx.fillStyle = color
                ctx.beginPath()
                ctx.arc(cell.seedPoint.x, cell.seedPoint.y, 3, 0, 2 * Math.PI)
                ctx.fill()

                // 黑色边框
                ctx.strokeStyle = '#000000'
                ctx.lineWidth = 1
                ctx.stroke()

                // 标注补偿值
                ctx.fillStyle = '#000000'
                ctx.font = 'bold 9px Arial'
                const text = `${cell.compensation.toFixed(0)}`
                ctx.fillText(text, cell.seedPoint.x + 5, cell.seedPoint.y - 5)
            })
        })

        // 3. 添加详细统计信息
        ctx.fillStyle = '#000000'
        ctx.font = 'bold 16px Arial'
        ctx.fillText(`Elevation ${voronoiResult.elevation} - 精确Voronoi划分`, 10, 25)

        ctx.font = '12px Arial'
        const totalCells = voronoiResult.shapes.reduce((sum, s) => sum + s.cells.length, 0)
        ctx.fillText(`有效点: ${allValidPoints.length}, 生成区域: ${totalCells}, 绘制区域: ${totalDrawnCells}`, 10, 45)
        ctx.fillText(`使用polygon-clipping精确裁剪，保留所有边界细节`, 10, 65)

        // 显示匹配状态
        if (totalCells === allValidPoints.length) {
            ctx.fillStyle = '#00AA00'
            ctx.font = 'bold 12px Arial'
            ctx.fillText(`✓ 完美匹配：所有有效点都有对应区域`, 10, 85)
        } else {
            ctx.fillStyle = '#FF6600'
            ctx.font = 'bold 12px Arial'
            ctx.fillText(`⚠️ 部分匹配：${totalCells}/${allValidPoints.length} 个区域生成`, 10, 85)
        }

        // 4. 自动下载
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

                console.log(`[Voronoi] 精确裁剪Voronoi图已下载: ${filename}`)
            }
        }, 'image/png')
    }
}