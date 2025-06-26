import { aiService, PredictionResult } from './aiService'
import { ImageProcessor } from './imageProcessor'
import { SlicerService } from './slicerService'
import { EdgeDetectionService, EdgeDetectionResult } from './edgeDetectionService'

export interface AIPredictionProgress {
    stage: 'loading' | 'processing' | 'predicting' | 'completed' | 'error'
    message: string
    progress?: number  // 0-100
}

export class AIPredictionService {
    private static isInitialized = false

    /**
     * 初始化AI预测服务
     * 这个函数在干什么：
     * 1. 加载ONNX模型到浏览器内存
     * 2. 确保AI服务准备就绪
     */
    static async initialize(progressCallback?: (progress: AIPredictionProgress) => void): Promise<void> {
        if (this.isInitialized) {
            //console.log('[AIPrediction] ✅ AI服务已初始化')
            return
        }

        try {
            progressCallback?.({
                stage: 'loading',
                message: '正在加载AI模型...',
                progress: 0
            })

            //console.log('[AIPrediction] 🚀 开始初始化AI预测服务...')

            // 加载ONNX模型
            await aiService.loadModel()

            this.isInitialized = true

            progressCallback?.({
                stage: 'completed',
                message: 'AI模型加载完成！',
                progress: 100
            })

            //console.log('[AIPrediction] ✅ AI预测服务初始化完成')

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            //console.error('[AIPrediction] ❌ AI服务初始化失败:', error)

            progressCallback?.({
                stage: 'error',
                message: `AI模型加载失败: ${errorMessage}`
            })

            throw error
        }
    }

    /**
     * 执行完整的AI预测流程
     * 这个函数在干什么：
     * 1. 获取切片图像
     * 2. 提取图像小块
     * 3. 执行AI预测
     * 4. 输出结果到控制台
     */
    /**
     * 执行AI预测（支持JSON elevation）
     */
    static async performPrediction(
        progressCallback?: (progress: AIPredictionProgress) => void,
        chipJSON?: any  // 新增：接收JSON数据
    ): Promise<PredictionResult[]> {

        // 1. 检查AI服务状态
        if (!this.isInitialized || !aiService.isReady()) {
            throw new Error('AI服务未初始化，请先调用initialize()')
        }

        try {
            progressCallback?.({
                stage: 'processing',
                message: '正在解析JSON数据...',
                progress: 10
            })

            // 2. 解析JSON获取所有elevation
            let elevations: number[] = []
            if (chipJSON && chipJSON.layers && Array.isArray(chipJSON.layers)) {
                elevations = chipJSON.layers.map((layer: any) => layer.elevation)
                console.log(`[AI] 从JSON解析到${elevations.length}个层级:`, elevations)
            } else {
                // 如果没有JSON，回退到默认值
                elevations = [0, 100]
                console.log(`[AI] 未提供有效JSON，使用默认elevations:`, elevations)
            }

            // 3. 获取可用的切片和采样点
            const availableElevations = SlicerService.getAvailableElevations()

            // !!边缘检测
            console.log(`[AI] 🔍 开始边缘检测 ${elevations.length} 个elevation...`)
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

            // 获取第一个可用切片的画布尺寸
            const firstElevation = availableElevations[0]
            const firstCanvas = SlicerService.getSlice(firstElevation)
            if (!firstCanvas) {
                throw new Error('无法获取切片画布尺寸')
            }
            const samplingPoints = ImageProcessor.generateSamplingPoints(firstCanvas.width, firstCanvas.height)


            //console.log(`[AI] 可用切片:`, availableElevations)
            //console.log(`[AI] 预测任务: ${elevations.length}层 × ${samplingPoints.length}点 = ${elevations.length * samplingPoints.length}次`)

            progressCallback?.({
                stage: 'predicting',
                message: `开始AI预测...`,
                progress: 30
            })


            const allResults: PredictionResult[] = []
            let completedCount = 0
            const totalPredictions = elevations.length * samplingPoints.length

            // 4. 双重循环：为每个elevation的每个采样点进行预测
            for (let elevationIndex = 0; elevationIndex < elevations.length; elevationIndex++) {
                const elevation = elevations[elevationIndex]
                //console.log(`[AI] 🎯 处理第${elevationIndex + 1}/${elevations.length}层: elevation=${elevation}`)

                for (let pointIndex = 0; pointIndex < samplingPoints.length; pointIndex++) {
                    const point = samplingPoints[pointIndex]

                    try {
                        // 5. 为当前elevation和采样点生成融合图像
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

                        // 6. 执行AI预测
                        const prediction = await aiService.predictSingle(
                            imagePair.fusedImage,   // fused_image（8张图融合）
                            imagePair.extraImage    // extra_image（2张图平均）
                        )

                        // 7. 保存结果
                        allResults.push({
                            x: point.x,
                            y: point.y,
                            prediction: prediction
                        })

                        // !!增强输出：显示点是否在检测到的形状内
                        const edgeResult = edgeResults.find(r => r.elevation === elevation)
                        let shapeInfo = ''

                        if (edgeResult) {
                            for (let i = 0; i < edgeResult.shapes.length; i++) {
                                if (EdgeDetectionService.isPointInShape(point.x, point.y, edgeResult.shapes[i])) {
                                    shapeInfo = ` [在形状${i}内]`
                                    break
                                }
                            }
                        }


                        // 8. 输出预测结果到控制台
                        console.log(`[AI] Elevation ${elevation} Point (${point.x.toString().padStart(4)}, ${point.y.toString().padStart(4)}): Z_metric_pred = ${prediction.toFixed(6)}${shapeInfo}`)
                    } catch (error) {
                        console.error(`[AI] 预测失败 elevation=${elevation}, point=(${point.x}, ${point.y}):`, error)
                        // 预测失败时记录0值
                        allResults.push({
                            x: point.x,
                            y: point.y,
                            prediction: 0.0
                        })
                    }

                    completedCount++

                    // 9. 更新进度（每10次更新一次）
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

            // 输出边缘检测汇总
            console.log(`[EdgeDetection] 🎯 边缘检测汇总:`)
            edgeResults.forEach(result => {
                const totalArea = result.shapes.reduce((sum, s) => sum + s.area, 0)
                console.log(`[EdgeDetection] Elevation ${result.elevation}: ${result.totalShapes} 个形状，总面积 ${totalArea.toFixed(0)} 像素²`)
            })

            progressCallback?.({
                stage: 'completed',
                message: `AI预测完成！共${allResults.length}个结果`,
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
     * 清理资源
     */
    static cleanup(): void {
        SlicerService.clearSavedSlices()
       // console.log('[AIPrediction] 🧹 已清理AI预测资源')
    }

    /**
     * 检查服务状态
     */
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