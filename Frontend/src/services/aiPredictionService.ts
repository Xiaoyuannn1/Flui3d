import { aiService, PredictionResult } from './aiService'
import { ImageProcessor } from './imageProcessor'
import { SlicerService } from './slicerService'

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
            console.log('[AIPrediction] ✅ AI服务已初始化')
            return
        }

        try {
            progressCallback?.({
                stage: 'loading',
                message: '正在加载AI模型...',
                progress: 0
            })

            console.log('[AIPrediction] 🚀 开始初始化AI预测服务...')

            // 加载ONNX模型
            await aiService.loadModel()

            this.isInitialized = true

            progressCallback?.({
                stage: 'completed',
                message: 'AI模型加载完成！',
                progress: 100
            })

            console.log('[AIPrediction] ✅ AI预测服务初始化完成')

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error('[AIPrediction] ❌ AI服务初始化失败:', error)

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
    static async performPrediction(progressCallback?: (progress: AIPredictionProgress) => void): Promise<PredictionResult[]> {

        // 1. 检查AI服务是否就绪
        if (!this.isInitialized || !aiService.isReady()) {
            throw new Error('AI服务未初始化，请先调用initialize()')
        }

        // 2. 检查切片图像是否可用
        if (!SlicerService.areAISlicesReady()) {
            throw new Error('切片图像未准备好，请先生成STL切片')
        }

        try {
            progressCallback?.({
                stage: 'processing',
                message: '正在处理切片图像...',
                progress: 10
            })

            // 3. 获取保存的切片图像
            const savedSlices = SlicerService.getSavedSlicesForAI()
            const slice0Canvas = savedSlices.slice0!
            const slice100Canvas = savedSlices.slice100!

            console.log('[AIPrediction] 📸 获取切片图像:')
            console.log(`  - slice_0: ${slice0Canvas.width}x${slice0Canvas.height}`)
            console.log(`  - slice_100: ${slice100Canvas.width}x${slice100Canvas.height}`)

            progressCallback?.({
                stage: 'processing',
                message: '正在提取图像patches...',
                progress: 20
            })

            // 4. 从两张图像中提取所有的小块
            console.log('[AIPrediction] ✂️  开始提取图像patches...')
            const slice0Patches = ImageProcessor.extractAllPatches(slice0Canvas)
            const slice100Patches = ImageProcessor.extractAllPatches(slice100Canvas)

            if (slice0Patches.length !== slice100Patches.length) {
                throw new Error(`patches数量不匹配: slice0=${slice0Patches.length}, slice100=${slice100Patches.length}`)
            }

            const totalPatches = slice0Patches.length
            console.log(`[AIPrediction] 🧩 成功提取 ${totalPatches} 对图像patches`)

            progressCallback?.({
                stage: 'predicting',
                message: `正在AI预测... (0/${totalPatches})`,
                progress: 30
            })

            // 5. 准备批量预测数据
            const imagePairs = []
            for (let i = 0; i < totalPatches; i++) {
                imagePairs.push({
                    fused: slice100Patches[i].data,    // slice_100作为fused_image
                    extra: slice0Patches[i].data,      // slice_0作为extra_image
                    x: slice0Patches[i].x,
                    y: slice0Patches[i].y
                })
            }

            // 6. 执行AI批量预测
            console.log('[AIPrediction] 🤖 开始AI批量预测...')
            console.log('[AIPrediction] 📊 预测详情:')

            const results: PredictionResult[] = []

            for (let i = 0; i < imagePairs.length; i++) {
                const pair = imagePairs[i]

                try {
                    // 执行单次预测
                    const prediction = await aiService.predictSingle(pair.fused, pair.extra)

                    // 保存结果
                    results.push({
                        x: pair.x,
                        y: pair.y,
                        prediction: prediction
                    })

                    // 🎯 在控制台输出每个点的预测结果（这是您要求的功能）
                    console.log(`[AI] Point (${pair.x.toString().padStart(4)}, ${pair.y.toString().padStart(4)}): Z_metric_pred = ${prediction.toFixed(6)}`)

                    // 更新进度
                    const progress = 30 + (i + 1) / imagePairs.length * 60  // 30% 到 90%
                    progressCallback?.({
                        stage: 'predicting',
                        message: `正在AI预测... (${i + 1}/${totalPatches})`,
                        progress: Math.round(progress)
                    })

                } catch (error) {
                    console.error(`[AIPrediction] ❌ 预测失败 - 位置(${pair.x}, ${pair.y}):`, error)
                    // 预测失败时使用默认值
                    results.push({
                        x: pair.x,
                        y: pair.y,
                        prediction: 0.0
                    })
                }
            }

            // 7. 输出总结
            const successCount = results.filter(r => r.prediction !== 0.0).length
            console.log('[AIPrediction] 🎉 AI预测完成!')
            console.log(`[AIPrediction] 📈 成功预测: ${successCount}/${totalPatches} 个样本`)
            console.log('[AIPrediction] 📋 预测结果汇总:')

            // 计算统计信息
            const predictions = results.map(r => r.prediction).filter(p => p !== 0.0)
            if (predictions.length > 0) {
                const mean = predictions.reduce((a, b) => a + b, 0) / predictions.length
                const min = Math.min(...predictions)
                const max = Math.max(...predictions)

                console.log(`  - 平均预测值: ${mean.toFixed(6)}`)
                console.log(`  - 最小预测值: ${min.toFixed(6)}`)
                console.log(`  - 最大预测值: ${max.toFixed(6)}`)
                console.log(`  - 预测范围: [${min.toFixed(6)}, ${max.toFixed(6)}]`)
            }

            progressCallback?.({
                stage: 'completed',
                message: `AI预测完成！成功预测 ${successCount}/${totalPatches} 个样本`,
                progress: 100
            })

            return results

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error('[AIPrediction] ❌ AI预测流程失败:', error)

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
        console.log('[AIPrediction] 🧹 已清理AI预测资源')
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