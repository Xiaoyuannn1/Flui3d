import { aiService, PredictionResult } from './aiService'
import { ImageProcessor, SamplingPoint } from './imageProcessor'
import { SlicerService } from './slicerService'
import { EdgeDetectionService, EdgeDetectionResult, Shape } from './edgeDetectionService'  // 添加 Shape 导入
import { CompensationBlock } from '@/lib/stl-generator/builder/shapes/compensation'
import { useContentStore } from '@/stores/content'


export interface AIPredictionProgress {
    stage: 'loading' | 'processing' | 'predicting' | 'completed' | 'error'
    message: string
    progress?: number  // 0-100
}

export class AIPredictionService {
    private static isInitialized = false
    private static shapeHeightData: Map<number, number[]> = new Map()

    static async initialize(progressCallback?: (progress: AIPredictionProgress) => void): Promise<void> {
        if (this.isInitialized) {
            return
        }

        try {
            progressCallback?.({
                stage: 'loading',
                message: '正在加载AI模型...',
                progress: 0
            })

            await aiService.loadModel()
            this.isInitialized = true

            progressCallback?.({
                stage: 'completed',
                message: 'AI模型加载完成！',
                progress: 100
            })

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)

            progressCallback?.({
                stage: 'error',
                message: `AI模型加载失败: ${errorMessage}`
            })

            throw error
        }
    }

    static async performPrediction(
        progressCallback?: (progress: AIPredictionProgress) => void,
        chipJSON?: any
    ): Promise<PredictionResult[]> {

        if (!this.isInitialized || !aiService.isReady()) {
            throw new Error('AI服务未初始化，请先调用initialize()')
        }

        try {
            progressCallback?.({
                stage: 'processing',
                message: '正在解析JSON数据...',
                progress: 10
            })

            // 解析elevations和precision
            let elevations: number[] = []
            let precision = 'Medium'

            if (chipJSON && chipJSON.layers && Array.isArray(chipJSON.layers)) {
                elevations = chipJSON.layers.map((layer: any) => layer.elevation)
                console.log(`[AI] 从JSON解析到${elevations.length}个层级:`, elevations)
            } else {
                elevations = [0, 100]
                console.log(`[AI] 未提供有效JSON，使用默认elevations:`, elevations)
            }

            if (chipJSON && chipJSON.general && chipJSON.general.precision) {
                precision = chipJSON.general.precision
                console.log(`[AI] 从JSON解析到precision: ${precision}`)
            } else {
                console.log(`[AI] 未找到precision，使用默认值: ${precision}`)
            }

            const availableElevations = SlicerService.getAvailableElevations()

            // 边缘检测
            console.log(`[AI]  开始边缘检测 ${elevations.length} 个elevation...`)
            const edgeResults: EdgeDetectionResult[] = []

            for (const elevation of elevations) {
                const canvas = SlicerService.getSlice(elevation)
                if (canvas) {
                    try {
                        const result = EdgeDetectionService.detectEdges(canvas, elevation)
                        edgeResults.push(result)
                    } catch (error) {
                        console.error(`[EdgeDetection] Elevation ${elevation} 检测失败:`, error)
                    }
                }
            }

            // 新增：形状高度检测
            console.log(`[AI]  开始形状高度检测...`)
            await this.detectShapeHeights(edgeResults, availableElevations, precision)

            // 生成采样点
            const firstElevation = availableElevations[0]
            const firstCanvas = SlicerService.getSlice(firstElevation)
            if (!firstCanvas) {
                throw new Error('无法获取切片画布尺寸')
            }
            const allSamplingPoints = ImageProcessor.generateSamplingPoints(firstCanvas.width, firstCanvas.height, precision)

            progressCallback?.({
                stage: 'predicting',
                message: `开始AI预测...`,
                progress: 30
            })

            const allResults: PredictionResult[] = []
            let completedCount = 0

            // AI预测循环
            for (let elevationIndex = 0; elevationIndex < elevations.length; elevationIndex++) {
                const elevation = elevations[elevationIndex]

                // 过滤有效采样点
                const edgeResult = edgeResults.find(r => r.elevation === elevation)
                const validSamplingPoints = this.filterValidSamplingPoints(allSamplingPoints, edgeResult)

                console.log(`[AI] Elevation ${elevation}: 从${allSamplingPoints.length}个点过滤到${validSamplingPoints.length}个有效点`)

                // 重新计算总预测次数
                const totalPredictions = elevations.reduce((sum, elev) => {
                    const elevEdgeResult = edgeResults.find(r => r.elevation === elev)
                    const validPoints = this.filterValidSamplingPoints(allSamplingPoints, elevEdgeResult)
                    return sum + validPoints.length
                }, 0)

                for (let pointIndex = 0; pointIndex < validSamplingPoints.length; pointIndex++) {
                    const point = validSamplingPoints[pointIndex]

                    try {
                        const imagePair = ImageProcessor.generateImagePairForPoint(
                            elevation,
                            point,
                            availableElevations
                        )

                        if (!imagePair) {
                            console.warn(`[AI] 跳过 elevation=${elevation}, point=(${point.x}, ${point.y})`)
                            completedCount++
                            continue
                        }

                        const prediction = await aiService.predictSingle(
                            imagePair.fusedImage,
                            imagePair.extraImage
                        )

                        allResults.push({
                            x: point.x,
                            y: point.y,
                            prediction: prediction
                        })

                        // 显示形状信息
                        let shapeInfo = ''
                        if (edgeResult) {
                            for (let i = 0; i < edgeResult.shapes.length; i++) {
                                if (EdgeDetectionService.isPointInShape(point.x, point.y, edgeResult.shapes[i])) {
                                    shapeInfo = ` [在形状${i}内]`
                                    break
                                }
                            }
                        }

                        // 计算补偿值
                        let compensationInfo = ''
                        if (edgeResult && shapeInfo) {  // 如果点在某个形状内
                            for (let i = 0; i < edgeResult.shapes.length; i++) {
                                if (EdgeDetectionService.isPointInShape(point.x, point.y, edgeResult.shapes[i])) {
                                    const shapeHeights = this.shapeHeightData.get(elevation)  // 获取保存的形状高度
                                    if (shapeHeights && shapeHeights[i] !== undefined) {
                                        const compensation = shapeHeights[i] * (prediction - 1)  // 计算补偿值
                                        compensationInfo = ` [补偿值: ${compensation.toFixed(1)}μm]`
                                    }
                                    break
                                }
                            }
                        }

                        console.log(`[AI] Elevation ${elevation} Point (${point.x.toString().padStart(4)}, ${point.y.toString().padStart(4)}): Z_metric_pred = ${prediction.toFixed(6)}${shapeInfo}${compensationInfo}`)

                    } catch (error) {
                        console.error(`[AI] 预测失败 elevation=${elevation}, point=(${point.x}, ${point.y}):`, error)
                        allResults.push({
                            x: point.x,
                            y: point.y,
                            prediction: 0.0
                        })
                    }

                    completedCount++

                    if (completedCount % 10 === 0) {
                        const progress = 30 + (completedCount / totalPredictions) * 60
                        progressCallback?.({
                            stage: 'predicting',
                            message: `AI预测中... (${completedCount}/${totalPredictions})`,
                            progress: Math.round(progress)
                        })
                    }
                }
            }

            // 输出汇总
            console.log(`[EdgeDetection] 🎯 边缘检测汇总:`)
            edgeResults.forEach(result => {
                const totalArea = result.shapes.reduce((sum, s) => sum + s.area, 0)
                console.log(`[EdgeDetection] Elevation ${result.elevation}: ${result.totalShapes} 个形状，总面积 ${totalArea.toFixed(0)} 像素²`)
            })


            // 新增：收集补偿数据并生成补偿STL
            console.log(`[AI] 开始收集补偿数据...`)

            const compensationBlocks: CompensationBlock[] = []
            let precisionValue: number

            // 解析precision数值
            switch (precision) {
                case 'High': precisionValue = 20; break
                case 'Medium': precisionValue = 28; break
                case 'Low': precisionValue = 36; break
                default: precisionValue = 28
            }

            // 遍历所有AI预测结果，收集补偿数据
            allResults.forEach(result => {
                // 为每个预测点找到对应的elevation和形状
                for (const elevation of elevations) {
                    const edgeResult = edgeResults.find(r => r.elevation === elevation)
                    if (!edgeResult) continue

                    // 检查该点在哪个形状内
                    for (let shapeIndex = 0; shapeIndex < edgeResult.shapes.length; shapeIndex++) {
                        if (EdgeDetectionService.isPointInShape(result.x, result.y, edgeResult.shapes[shapeIndex])) {
                            const shapeHeights = this.shapeHeightData.get(elevation)
                            if (shapeHeights && shapeHeights[shapeIndex] !== undefined) {
                                // 计算补偿值：形状高度 × (预测值 - 1)
                                const compensation = shapeHeights[shapeIndex] * (result.prediction - 1)
                                const compensationCeiled = Math.ceil(Math.abs(compensation))  // 向上取整

                                if (compensationCeiled > 0) {  // 只处理正补偿
                                    compensationBlocks.push({
                                        x: result.x,              // 像素坐标
                                        y: result.y,
                                        elevation: elevation,
                                        precision: precisionValue,
                                        compensation: compensationCeiled,
                                        canvasHeight: firstCanvas.height  // 新增：传入画布高度
                                    })

                                    console.log(`[AI] 补偿点: (${result.x},${result.y}) elevation=${elevation} 补偿=${compensationCeiled}μm`)
                                }
                            }
                            break  // 找到形状后退出循环
                        }
                    }
                }
            })

            console.log(`[AI] 收集到 ${compensationBlocks.length} 个补偿块`)

            // 新增：重新生成包含补偿的STL
            if (compensationBlocks.length > 0) {
                console.log(`[AI] 开始重新生成包含补偿的STL...`)

                try {
                    const contentStore = useContentStore()

                    // 关键：调用 requestNewStlData 并传入补偿数据
                    await contentStore.requestNewStlData(
                        precision,
                        false,  // globalCompCheck
                        0,      // globalComp
                        false,  // localCompCheck
                        0,      // localCompMin
                        0,      // minAt
                        0,      // localCompMax
                        0,      // maxAt
                        true,   // binary
                        compensationBlocks  // 传入补偿数据
                    )

                    console.log(`[AI] 补偿STL生成完成！前端预览已更新为补偿后的STL`)

                } catch (error) {
                    console.error(`[AI] 补偿STL生成失败:`, error)
                }
            } else {
                console.log(`[AI] 无需要补偿的点，保持原始STL`)
            }

            // 修改progress message
            progressCallback?.({
                stage: 'completed',
                message: `AI预测+补偿STL生成完成！`,
                progress: 100
            })

            return allResults

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error('[AI] 预测流程失败:', error)

            progressCallback?.({
                stage: 'error',
                message: `AI预测失败: ${errorMessage}`
            })

            throw error
        }
    }

    /**
     * 过滤出在形状内的有效采样点
     */
    private static filterValidSamplingPoints(
        allPoints: SamplingPoint[],
        edgeResult: EdgeDetectionResult | undefined
    ): SamplingPoint[] {
        if (!edgeResult || edgeResult.shapes.length === 0) {
            console.warn('[AI] 没有检测到形状，返回所有采样点')
            return allPoints
        }

        const validPoints: SamplingPoint[] = []
        const shapePointCounts: number[] = new Array(edgeResult.shapes.length).fill(0)  // 新增：统计每个形状的点数

        // 1. 原有逻辑：收集所有在形状内的有效点
        allPoints.forEach(point => {
            let isInAnyShape = false

            // 检查点在哪个形状内，并统计
            edgeResult.shapes.forEach((shape, shapeIndex) => {
                if (EdgeDetectionService.isPointInShape(point.x, point.y, shape)) {
                    if (!isInAnyShape) {  // 避免重复计入validPoints
                        validPoints.push(point)
                        isInAnyShape = true
                    }
                    shapePointCounts[shapeIndex]++  // 统计该形状的点数
                }
            })
        })

        // 2. 输出每个形状的点数统计（保持原有逻辑）
        console.log(`[AI] 各形状内有效点数量:`)
        edgeResult.shapes.forEach((shape, index) => {
            console.log(`[AI]   形状${index}: ${shapePointCounts[index]} 个点`)
        })

        // 3. 新增：为每个形状选择并输出5个分散点（仅用于显示）
        console.log(`[AI] 各形状的4个分散代表点:`)
        edgeResult.shapes.forEach((shape, shapeIndex) => {
            // 收集当前形状内的所有候选点
            const candidatePoints: SamplingPoint[] = []
            allPoints.forEach(point => {
                if (EdgeDetectionService.isPointInShape(point.x, point.y, shape)) {
                    candidatePoints.push(point)
                }
            })

            if (candidatePoints.length === 0) {
                console.log(`[AI]   形状${shapeIndex}: 无候选点`)
                return
            }

            // 选择5个分散点
            const dispersedPoints = this.selectDispersedPoints(candidatePoints, shape, 5)

            // 输出分散点坐标
            const coordsStr = dispersedPoints.map(p => `(${p.x},${p.y})`).join(', ')
            console.log(`[AI]   形状${shapeIndex}: ${coordsStr}`)
        })

        const filterRatio = ((allPoints.length - validPoints.length) / allPoints.length * 100).toFixed(1)
        console.log(`[AI] 过滤掉 ${allPoints.length - validPoints.length} 个空白区域点，节省 ${filterRatio}% 预测时间`)

        // 4. 返回所有有效点（保持原有预测逻辑）
        return validPoints


    }

    /**
     * 新增：使用贪心算法选择分散的点（仅用于输出显示）
     */
    private static selectDispersedPoints(
        candidatePoints: SamplingPoint[],
        shape: Shape,
        targetCount: number
    ): SamplingPoint[] {
        if (candidatePoints.length <= targetCount) {
            return [...candidatePoints]
        }

        const selectedPoints: SamplingPoint[] = []
        const remainingPoints = [...candidatePoints]

        // 1. 选择第一个点：距离形状几何中心最近的点
        const shapeCenterX = shape.outer.reduce((sum, p) => sum + p.x, 0) / shape.outer.length
        const shapeCenterY = shape.outer.reduce((sum, p) => sum + p.y, 0) / shape.outer.length

        let firstPointIndex = 0
        let minDistanceToCenter = Infinity

        remainingPoints.forEach((point, index) => {
            const distance = this.calculateDistance(point.x, point.y, shapeCenterX, shapeCenterY)
            if (distance < minDistanceToCenter) {
                minDistanceToCenter = distance
                firstPointIndex = index
            }
        })

        selectedPoints.push(remainingPoints[firstPointIndex])
        remainingPoints.splice(firstPointIndex, 1)

        // 2. 贪心选择剩余点：每次选择距离已选点最远的点
        for (let i = 1; i < targetCount && remainingPoints.length > 0; i++) {
            let bestPointIndex = 0
            let maxMinDistance = -1

            remainingPoints.forEach((candidate, candidateIndex) => {
                let minDistanceToSelected = Infinity
                selectedPoints.forEach(selectedPoint => {
                    const distance = this.calculateDistance(
                        candidate.x, candidate.y,
                        selectedPoint.x, selectedPoint.y
                    )
                    minDistanceToSelected = Math.min(minDistanceToSelected, distance)
                })

                if (minDistanceToSelected > maxMinDistance) {
                    maxMinDistance = minDistanceToSelected
                    bestPointIndex = candidateIndex
                }
            })

            selectedPoints.push(remainingPoints[bestPointIndex])
            remainingPoints.splice(bestPointIndex, 1)
        }

        return selectedPoints
    }

    /**
     * 新增：计算两点间距离
     */
    private static calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    }


    /**
     * 新增：检测每个形状的高度
     */
    private static async detectShapeHeights(
        edgeResults: EdgeDetectionResult[],
        availableElevations: number[],
        precision: string
    ): Promise<void> {

        for (const edgeResult of edgeResults) {
            const baseElevation = edgeResult.elevation
            console.log(`[ShapeHeight] 检测elevation ${baseElevation}的形状高度...`)

            if (edgeResult.shapes.length === 0) {
                console.log(`[ShapeHeight] elevation ${baseElevation}无形状，跳过`)
                continue
            }

            // 为每个形状检测高度
            const shapeHeights: number[] = []

            for (let shapeIndex = 0; shapeIndex < edgeResult.shapes.length; shapeIndex++) {
                const shape = edgeResult.shapes[shapeIndex]

                // 1. 收集当前形状内的候选点
                const firstCanvas = SlicerService.getSlice(baseElevation)
                if (!firstCanvas) continue

                const allSamplingPoints = ImageProcessor.generateSamplingPoints(firstCanvas.width, firstCanvas.height, precision)
                const candidatePoints: SamplingPoint[] = []
                allSamplingPoints.forEach(point => {
                    if (EdgeDetectionService.isPointInShape(point.x, point.y, shape)) {
                        candidatePoints.push(point)
                    }
                })

                // 2. 选择5个分散点
                const dispersedPoints = this.selectDispersedPoints(candidatePoints, shape, 5)

                if (dispersedPoints.length === 0) {
                    shapeHeights.push(0)
                    continue
                }

                // 3. 沿Z方向检测高度
                const shapeHeight = this.detectSingleShapeHeight(
                    dispersedPoints,
                    baseElevation,
                    availableElevations
                )
                shapeHeights.push(shapeHeight)
            }
            // 保存形状高度数据
            this.shapeHeightData.set(baseElevation, shapeHeights)

            // 输出结果
            console.log(`[ShapeHeight] Elevation ${baseElevation}的形状高度结果:`)
            edgeResult.shapes.forEach((shape, index) => {
                const startElev = baseElevation
                const endElev = baseElevation + shapeHeights[index] - 100  // 减去100因为最后一层是失效的
                console.log(`[ShapeHeight]   形状${index}: 高度 ${shapeHeights[index]}μm (从elevation ${startElev} 到 ${endElev})`)
            })
        }
    }



    /**
     * 检测单个形状的高度
     */
    private static detectSingleShapeHeight(
        dispersedPoints: SamplingPoint[],
        baseElevation: number,
        availableElevations: number[]
    ): number {
        console.log(`[ShapeHeight] 开始检测形状高度，基准elevation: ${baseElevation}`)
        console.log(`[ShapeHeight] 检测点坐标: ${dispersedPoints.map(p => `(${p.x},${p.y})`).join(', ')}`)

        // 获取从baseElevation开始向上的所有切片
        const upperElevations = availableElevations
            .filter(elev => elev >= baseElevation)
            .sort((a, b) => a - b)

        console.log(`[ShapeHeight] 可用的上层elevations: ${upperElevations.join(', ')}`)

        let lastValidElevation = baseElevation

        // 逐层检查
        for (const elevation of upperElevations) {
            console.log(`[ShapeHeight] 检查elevation ${elevation}...`)

            const canvas = SlicerService.getSlice(elevation)
            if (!canvas) {
                console.log(`[ShapeHeight] elevation ${elevation}的切片不存在，跳过`)
                continue
            }

            // 检查5个分散点是否都是黑色
            const allPointsBlack = this.areAllPointsBlack(dispersedPoints, canvas)

            if (allPointsBlack) {
                lastValidElevation = elevation
                console.log(`[ShapeHeight] elevation ${elevation}: 所有点都是黑色 ✓`)
            } else {
                console.log(`[ShapeHeight] elevation ${elevation}: 发现白色像素 ✗，停止检测`)
                break
            }
        }

        const height = lastValidElevation - baseElevation + 100
        console.log(`[ShapeHeight] 计算高度: ${lastValidElevation} - ${baseElevation} + 100 = ${height}μm`)

        return height
    }

    /**
     * 检查所有点是否都是黑色像素
     */
    private static areAllPointsBlack(points: SamplingPoint[], canvas: HTMLCanvasElement): boolean {
        const ctx = canvas.getContext('2d')!

        for (const point of points) {
            // 1. 确保点在画布范围内
            if (point.x < 0 || point.x >= canvas.width || point.y < 0 || point.y >= canvas.height) {
                console.log(`[ShapeHeight] 点(${point.x}, ${point.y})超出画布范围，跳过`)
                continue
            }

            // 2. 获取该点的像素颜色
            const imageData = ctx.getImageData(point.x, point.y, 1, 1)
            const [r, g, b, a] = imageData.data  // RGBA四个值

            // 3. 计算灰度值（RGB平均值）
            const grayValue = (r + g + b) / 3

            // 4. 判断是否为黑色
            const isBlack = grayValue < 128  // 小于128认为是黑色

            // 5. 调试输出（可选）
            console.log(`[ShapeHeight] 点(${point.x}, ${point.y}): RGB(${r},${g},${b}) = 灰度${grayValue.toFixed(1)} → ${isBlack ? '黑色' : '白色'}`)

            if (!isBlack) {
                console.log(`[ShapeHeight] 发现白色像素，停止检测`)
                return false  // 有一个点不是黑色，立即返回false
            }
        }

        return true  // 所有点都是黑色
    }


    static cleanup(): void {
        SlicerService.clearSavedSlices()
    }

    static getStatus(): { initialized: boolean, ready: boolean, message: string } {
        if (!this.isInitialized) {
            return { initialized: false, ready: false, message: '未初始化' }
        }

        if (!aiService.isReady()) {
            return { initialized: true, ready: false, message: '模型未加载' }
        }

        return { initialized: true, ready: true, message: '准备就绪' }
    }
}