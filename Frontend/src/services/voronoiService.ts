// src/services/voronoiService.ts
import { Delaunay } from 'd3-delaunay'
import { EdgeDetectionService, Shape } from './edgeDetectionService'
import polygonClipping from 'polygon-clipping'

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

        console.log(`[Voronoi] 形状内有${seedPoints.length}个种子点，开始Voronoi划分`)

        // 1. 提取坐标用于Delaunay三角剖分
        const points: [number, number][] = seedPoints.map(p => [p.x, p.y] as [number, number])

        // 2. 构建Delaunay三角剖分
        const delaunay: Delaunay<[number, number]> = Delaunay.from(points)

        // 3. 生成Voronoi图
        const voronoi = delaunay.voronoi([0, 0, canvasWidth, canvasHeight])

        // 4. 使用像素级方法构建约束的Voronoi单元
        const cells: VoronoiCell[] = []

        for (let i = 0; i < seedPoints.length; i++) {
            const seedPoint = seedPoints[i]

            // 获取该种子点的Voronoi区域像素
            const regionPixels = this.getVoronoiRegionPixels(
                i,
                delaunay,            // ← 新增
                voronoi,
                shape,
                canvasWidth,
                canvasHeight
            )

            if (regionPixels.length > 0) {
                // 从像素构建简化的多边形边界
                const polygon = this.pixelsToPolygon(regionPixels, seedPoint)

                if (polygon.length >= 3) {
                    cells.push({
                        seedPoint: { x: seedPoint.x, y: seedPoint.y },
                        polygon: polygon,
                        compensation: seedPoint.compensation
                    })
                }
            }
        }

        console.log(`[Voronoi] 生成${cells.length}个约束Voronoi单元（应该等于${seedPoints.length}个种子点）`)
        return cells
    }

    /**
     * 获取Voronoi区域内且在形状内的所有像素
     */
    private static getVoronoiRegionPixels(
        seedIndex: number,
        delaunay: Delaunay<[number, number]>,
        voronoi: any,
        shape: Shape,
        canvasWidth: number,
        canvasHeight: number
    ): { x: number, y: number }[] {

        const regionPixels: {x: number, y: number}[] = []

        // 采样步长，可以调整以平衡精度和性能
        const step = 2

        for (let x = 0; x < canvasWidth; x += step) {
            for (let y = 0; y < canvasHeight; y += step) {
                // 检查该像素是否属于当前种子点的Voronoi区域
                const closestSeed = delaunay.find(x, y)

                if (closestSeed === seedIndex) {
                    // 检查该像素是否在形状内部（排除孔洞）
                    if (EdgeDetectionService.isPointInShape(x, y, shape)) {
                        regionPixels.push({ x, y })
                    }
                }
            }
        }

        return regionPixels
    }

    /**
     * 从像素点构建简化的多边形边界
     */
    private static pixelsToPolygon(
        pixels: {x: number, y: number}[],
        seedPoint: {x: number, y: number}
    ): {x: number, y: number}[] {

        if (pixels.length === 0) return []

        // 简化方法：找到像素的凸包作为多边形边界
        return this.convexHull(pixels)
    }

    /**
     * Graham扫描算法计算凸包
     */
    private static convexHull(points: {x: number, y: number}[]): {x: number, y: number}[] {
        if (points.length < 3) return points

        // 找到y坐标最小的点（如果有多个，选择x坐标最小的）
        let start = points[0]
        for (const point of points) {
            if (point.y < start.y || (point.y === start.y && point.x < start.x)) {
                start = point
            }
        }

        // 按极角排序
        const sorted = points
            .filter(p => p !== start)
            .sort((a, b) => {
                const angleA = Math.atan2(a.y - start.y, a.x - start.x)
                const angleB = Math.atan2(b.y - start.y, b.x - start.x)
                if (Math.abs(angleA - angleB) < 1e-9) {
                    // 角度相同时，选择距离较近的
                    const distA = (a.x - start.x) ** 2 + (a.y - start.y) ** 2
                    const distB = (b.x - start.x) ** 2 + (b.y - start.y) ** 2
                    return distA - distB
                }
                return angleA - angleB
            })

        // Graham扫描
        const hull = [start]

        for (const point of sorted) {
            // 移除不构成左转的点
            while (hull.length >= 2) {
                const p1 = hull[hull.length - 2]
                const p2 = hull[hull.length - 1]
                const cross = (p2.x - p1.x) * (point.y - p1.y) - (p2.y - p1.y) * (point.x - p1.x)
                if (cross > 0) break  // 左转，保留
                hull.pop()  // 右转或共线，移除
            }
            hull.push(point)
        }

        return hull
    }

    /**
     * 生成Voronoi划分可视化图像
     */
    static generateVoronoiVisualization(
        originalCanvas: HTMLCanvasElement,
        voronoiResult: VoronoiResult,
        allValidPoints: Array<{x: number, y: number, compensation: number}>
    ): void {

        console.log(`[Voronoi] 开始绘制可视化，总共${allValidPoints.length}个有效点`)

        // 创建可视化Canvas
        const vizCanvas = document.createElement('canvas')
        vizCanvas.width = originalCanvas.width
        vizCanvas.height = originalCanvas.height
        const ctx = vizCanvas.getContext('2d')!

        // 1. 绘制原始切片作为背景（半透明）
        ctx.globalAlpha = 0.3
        ctx.drawImage(originalCanvas, 0, 0)
        ctx.globalAlpha = 1.0

        // 2. 绘制Voronoi划分
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
            '#F1948A', '#82E0AA', '#85C1E9', '#F8C471', '#D2B4DE'
        ]

        let totalDrawnCells = 0

        voronoiResult.shapes.forEach((shapeVoronoi, shapeIndex) => {
            console.log(`[Voronoi] 绘制形状${shapeIndex}的${shapeVoronoi.cells.length}个Voronoi单元`)

            shapeVoronoi.cells.forEach((cell, cellIndex) => {
                const colorIndex = (shapeIndex * 15 + cellIndex) % colors.length
                const color = colors[colorIndex]

                // 绘制Voronoi单元边界
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
                    ctx.fillStyle = color + '50'
                    ctx.fill()
                    ctx.stroke()

                    totalDrawnCells++
                }

                // 绘制种子点
                ctx.fillStyle = color
                ctx.beginPath()
                ctx.arc(cell.seedPoint.x, cell.seedPoint.y, 3, 0, 2 * Math.PI)
                ctx.fill()

                // 绘制黑色边框
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
        ctx.fillText(`Elevation ${voronoiResult.elevation} - Voronoi划分`, 10, 25)

        ctx.font = '12px Arial'
        const totalCells = voronoiResult.shapes.reduce((sum, s) => sum + s.cells.length, 0)
        ctx.fillText(`有效点: ${allValidPoints.length}, 生成区域: ${totalCells}, 绘制区域: ${totalDrawnCells}`, 10, 45)
        ctx.fillText(`${voronoiResult.shapes.length} 个形状，严格约束在形状内部`, 10, 65)

        // 如果数量不匹配，显示警告
        if (totalCells !== allValidPoints.length) {
            ctx.fillStyle = '#FF0000'
            ctx.font = 'bold 12px Arial'
            ctx.fillText(`⚠️ 警告：区域数量(${totalCells})与有效点数量(${allValidPoints.length})不匹配`, 10, 85)
        }

        // 4. 自动下载
        this.downloadVoronoiVisualization(vizCanvas, voronoiResult.elevation)
    }

    private static downloadVoronoiVisualization(canvas: HTMLCanvasElement, elevation: number): void {
        canvas.toBlob((blob) => {
            if (blob) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
                const filename = `voronoi_pixel_elevation_${elevation}_${timestamp}.png`

                const url = URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = filename
                link.style.display = 'none'

                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)

                URL.revokeObjectURL(url)

                console.log(`[Voronoi] 像素级Voronoi图已下载: ${filename}`)
            }
        }, 'image/png')
    }
}