// src/lib/stl-generator/builder/shapes/compensation.ts

import { cuboid } from '@jscad/modeling/src/primitives/index'
import { translate } from '@jscad/modeling/src/operations/transforms/index'

export interface CompensationBlock {
    x: number           // 像素坐标X
    y: number           // 像素坐标Y
    elevation: number   // 所在elevation高度
    precision: number   // 精度值（20/28/36）
    compensation: number // 补偿值（向上取整后）
    canvasHeight: number  // 新增：画布高度
}

/**
 * 构建单个补偿长方体
 * 关键：坐标需要×10转换，方向向下延伸
 */
export function buildCompensationBlock(block: CompensationBlock): any {
    const { x, y, elevation, precision, compensation, canvasHeight } = block  // 确保解构了canvasHeight

    // 1. 像素坐标转换为STL真实坐标（×10）
    const realX = x * 10  // 例如：像素828 → STL坐标8280
    //const realY = y * 10  // 例如：像素604 → STL坐标6040
    const realY = (canvasHeight - y) * 10  // Y坐标翻转
    const realZ = elevation

    // 2. 计算长方体尺寸（STL真实单位）
    const width = precision * 10   // 例如：precision=28 → 280μm
    const height = precision * 10
    const depth = compensation     // 例如：61μm

    if (depth <= 0) {
        return null  // 负补偿或零补偿不创建结构
    }

    // 3. 创建长方体，关键：向下延伸
    let compensationBox = cuboid({
        size: [width, height, depth],
        center: [0, 0, -depth/2]  // Z中心向下偏移depth/2，实现向下延伸
    })

    // 4. 平移到目标位置
    compensationBox = translate([realX, realY, realZ], compensationBox)

    console.log(`[Compensation] 补偿块: STL坐标(${realX}, ${realY}, ${realZ}) 尺寸${width}×${height}×${depth}μm`)

    return compensationBox
}

/**
 * 批量构建所有补偿结构
 */
export function buildAllCompensationBlocks(blocks: CompensationBlock[]): any[] {
    const compensationStructures: any[] = []

    console.log(`[Compensation] 开始构建 ${blocks.length} 个补偿结构...`)

    blocks.forEach((block, index) => {
        const structure = buildCompensationBlock(block)
        if (structure) {
            compensationStructures.push(structure)
        }

        // 每50个输出一次进度
        if ((index + 1) % 50 === 0) {
            console.log(`[Compensation] 已构建: ${index + 1}/${blocks.length}`)
        }
    })

    console.log(`[Compensation] 成功构建 ${compensationStructures.length} 个补偿结构`)
    return compensationStructures
}