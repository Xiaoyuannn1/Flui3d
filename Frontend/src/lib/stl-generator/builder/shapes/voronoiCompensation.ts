// src/lib/stl-generator/builder/shapes/voronoiCompensation.ts

import { fromPoints } from '@jscad/modeling/src/geometries/geom2'
import { extrudeLinear } from '@jscad/modeling/src/operations/extrusions'
import { translate } from '@jscad/modeling/src/operations/transforms'
import type { Vec2 } from '@jscad/modeling/src/maths/types'

export interface VoronoiCompensationData {
    elevation: number
    regions: VoronoiCompensationRegion[]
}

export interface VoronoiCompensationRegion {
    polygon: { x: number, y: number }[]  // Voronoi区域边界（像素坐标）
    compensation: number                 // 补偿高度（μm）
    seedPoint: { x: number, y: number } // 种子点（用于调试）
    canvasHeight: number                 // 画布高度（用于Y轴翻转）
}
/**
 * 构建单个Voronoi补偿区域
 * 关键：向下拉伸，坐标×10转换
 */
export function buildVoronoiCompensationRegion(region: VoronoiCompensationRegion, elevation: number): any {
    const { polygon, compensation, canvasHeight } = region

    if (polygon.length < 3 || compensation <= 0) {
        return null  // 无效多边形或负补偿
    }

    // 1. 像素坐标转换为STL坐标（×10）
    const stlPoints: Vec2[] = polygon.map(point => [
        point.x * 10,  // 像素 → STL坐标
        (region.canvasHeight - point.y) * 10  // Y轴翻转
    ])

    // 2. 检查并修正点的顺序（逆时针）
    const correctedPoints = ensureCounterClockwise(stlPoints)

    // 3. 创建2D多边形
    let poly2D
    try {
        poly2D = fromPoints(correctedPoints)
    } catch (error) {
        console.warn('[VoronoiComp] 创建2D多边形失败:', error)
        return null
    }

    // 4. 向下拉伸（关键差异：负高度）
    let solid = extrudeLinear({ height: compensation }, poly2D)

    // 5. 平移到正确的elevation，并向下偏移
    // 重要：从elevation开始向下延伸compensation的距离
    solid = translate([0, 0, elevation - compensation], solid)

    console.log(`[VoronoiComp] 区域: ${polygon.length}边形, STL坐标范围${correctedPoints[0][0].toFixed(0)}-${correctedPoints[correctedPoints.length-1][0].toFixed(0)}, 向下${compensation}μm`)

    return solid
}

/**
 * 确保点序列为逆时针（JSCAD要求）
 */
function ensureCounterClockwise(points: Vec2[]): Vec2[] {
    // 计算有符号面积
    let signedArea = 0
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length
        signedArea += (points[j][0] - points[i][0]) * (points[j][1] + points[i][1])
    }

    // 如果面积为负（顺时针），则反转
    if (signedArea > 0) {
        return [...points].reverse()
    }

    return points
}

/**
 * 批量构建所有Voronoi补偿结构
 */
export function buildAllVoronoiCompensation(data: VoronoiCompensationData[]): any[] {
    const compensationStructures: any[] = []
    let totalRegions = 0

    console.log(`[VoronoiComp] 开始构建 ${data.length} 个elevation的Voronoi补偿...`)

    data.forEach((elevationData, elevIndex) => {
        const { elevation, regions } = elevationData

        console.log(`[VoronoiComp] Elevation ${elevation}: 处理${regions.length}个区域`)

        regions.forEach((region, regionIndex) => {
            const structure = buildVoronoiCompensationRegion(region, elevation)
            if (structure) {
                compensationStructures.push(structure)
                totalRegions++
            }

            // 每50个输出进度
            if ((totalRegions) % 50 === 0) {
                console.log(`[VoronoiComp] 已构建: ${totalRegions} 个区域`)
            }
        })
    })

    console.log(`[VoronoiComp] 构建完成: ${compensationStructures.length} 个Voronoi补偿结构`)
    return compensationStructures
}