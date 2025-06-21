import * as ort from 'onnxruntime-web'


export interface PredictionResult {
    x: number           // 采样点的X坐标
    y: number           // 采样点的Y坐标
    prediction: number  // AI预测的Z_metric值
}

export class AIService {
    private session: ort.InferenceSession | null = null
    private isModelLoaded = false  // 移除类型标注，让TypeScript自动推断

    /**
     * 这个函数在干什么：
     * 1. 设置ONNX Runtime的WebAssembly路径
     * 2. 从public/models/目录加载ONNX模型
     * 3. 配置执行提供程序（GPU优先，CPU备用）
     */

    async loadModel(): Promise<void> {
        console.log('[AI] 🚀 开始加载ONNX模型...')

        // 设置 WASM 资源路径（CPU 后端用）
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/'

        let providerUsed = ''

        try {
            // 先尝试只用 WebGL
            console.log('[AI] 🔧 尝试 WebGL 后端加载（GPU 优先）...')
            this.session = await ort.InferenceSession.create(
                '/models/compensation_model_no_bn_fixed.onnx',
                { executionProviders: ['webgl'] }
            )
            providerUsed = 'webgl'
            console.log('[AI] ✅ WebGL 后端加载成功，使用 GPU 加速！')
        } catch (webglErr: any) {
            console.warn('[AI] ⚠️ WebGL 后端初始化失败，准备回退到 WASM（CPU）...', webglErr.message)
            // 回退到只用 WASM
            this.session = await ort.InferenceSession.create(
                '/models/compensation_model_no_bn_fixed.onnx',
                { executionProviders: ['wasm'] }
            )
            providerUsed = 'wasm'
            console.log('[AI] ✅ WASM 后端加载成功，使用 CPU 运行')
        }

        this.isModelLoaded = true

        // 打印实际使用的后端
        console.log('[AI] 🎯 实际使用后端：', providerUsed)

        // 🔥 重要：详细打印模型的输入输出信息
        console.log('[AI] 📥 输入信息详情:')
        this.session.inputNames.forEach((name, index) => {
            console.log(`  输入${index}: 名称="${name}"`)
        })

        console.log('[AI] 📤 输出信息详情:')
        this.session.outputNames.forEach((name, index) => {
            console.log(`  输出${index}: 名称="${name}"`)
        })

        // 🔥 1.14.0版本获取输入输出信息的正确方法
        console.log('[AI] 🎯 完整的session信息:')
        console.log('所有输入名称:', this.session.inputNames)
        console.log('所有输出名称:', this.session.outputNames)

        // 尝试用第一个样本数据测试模型接受的输入格式
        console.log('[AI] 🧪 准备测试模型输入格式...')
    }


    /**
     * 这个函数在干什么：
     * 1. 接收两个256x256的图像数据（Float32Array格式）
     * 2. 创建ONNX张量
     * 3. 执行AI推理
     * 4. 返回预测的Z_metric值
     */
    async predictSingle(fusedImageData: Float32Array, extraImageData: Float32Array): Promise<number> {
        if (!this.isModelLoaded || !this.session) {
            throw new Error('AI模型未加载，请先调用loadModel()')
        }

        try {
            // 🔥 修复：确保数据长度和形状匹配
            console.log('[AI] 数据检查 - fused长度:', fusedImageData.length, '期望:', 1*1*256*256)
            console.log('[AI] 数据检查 - extra长度:', extraImageData.length, '期望:', 1*1*256*256)

            console.log('[AI] fused前5个值:', fusedImageData.slice(0, 5))
            console.log('[AI] extra前5个值:', extraImageData.slice(0, 5))
            console.log('[AI] fused最小最大值:', Math.min(...fusedImageData), Math.max(...fusedImageData))
            console.log('[AI] extra最小最大值:', Math.min(...extraImageData), Math.max(...extraImageData))
            // 验证数据长度
            const expectedLength = 1 * 1 * 256 * 256; // 65536
            if (fusedImageData.length !== expectedLength) {
                throw new Error(`Fused image数据长度不匹配: 实际${fusedImageData.length}, 期望${expectedLength}`)
            }
            if (extraImageData.length !== expectedLength) {
                throw new Error(`Extra image数据长度不匹配: 实际${extraImageData.length}, 期望${expectedLength}`)
            }

            // 创建正确形状的张量
            const fusedTensor = new ort.Tensor('float32', fusedImageData, [1, 1, 256, 256])
            const extraTensor = new ort.Tensor('float32', extraImageData, [1, 1, 256, 256])

            console.log('[AI] 张量形状 - fused:', fusedTensor.dims)
            console.log('[AI] 张量形状 - extra:', extraTensor.dims)

            // 执行推理
            const outputs = await this.session.run({
                'fused_image': fusedTensor,
                'extra_image': extraTensor
            })

            // 获取预测结果
            const prediction = outputs['z_metric_pred'].data[0] as number
            return prediction

        } catch (error) {
            console.error('[AI] ❌ 单次预测失败:', error)
            throw new Error(`AI预测失败: ${String(error)}`)
        }
    }

    /**
     * 这个函数在干什么：
     * 1. 接收多个图像对
     * 2. 逐个进行AI预测
     * 3. 收集所有预测结果
     * 4. 在控制台显示进度
     */
    async predictBatch(imagePairs: Array<{
        fused: Float32Array,
        extra: Float32Array,
        x: number,
        y: number
    }>): Promise<PredictionResult[]> {

        const results: PredictionResult[] = []
        const totalSamples = imagePairs.length

        console.log(`[AI] 🔄 开始批量预测，共 ${totalSamples} 个采样点`)
        console.log(`[AI] 📊 预期处理时间: ${(totalSamples * 0.1).toFixed(1)}秒 (每个样本约100ms)`)

        for (let i = 0; i < imagePairs.length; i++) {
            const pair = imagePairs[i]

            try {
                // 执行单次预测
                const prediction = await this.predictSingle(pair.fused, pair.extra)

                // 保存结果
                results.push({
                    x: pair.x,
                    y: pair.y,
                    prediction: prediction
                })

                // 在控制台输出每个点的预测结果
                console.log(`[AI] Point (${pair.x.toString().padStart(4)}, ${pair.y.toString().padStart(4)}): Z_metric_pred = ${prediction.toFixed(6)}`)

                // 每处理10个样本显示进度
                if ((i + 1) % 10 === 0) {
                    const progress = ((i + 1) / totalSamples * 100).toFixed(1)
                    console.log(`[AI] 🏃‍♂️ 预测进度: ${i + 1}/${totalSamples} (${progress}%)`)
                }

            } catch (error) {
                console.error(`[AI] ❌ 预测失败 - 位置(${pair.x}, ${pair.y}):`, error)
                // 预测失败时使用默认值，避免整个流程中断
                results.push({
                    x: pair.x,
                    y: pair.y,
                    prediction: 0.0
                })
            }
        }

        console.log('[AI] 🎉 批量预测完成!')
        console.log(`[AI] 📈 成功预测 ${results.filter(r => r.prediction !== 0.0).length}/${totalSamples} 个样本`)

        return results
    }

    /**
     * 检查模型是否准备就绪
     */
    isReady(): boolean {
        return this.isModelLoaded && this.session !== null
    }

    /**
     * 获取模型加载状态
     */
    getStatus(): string {
        if (this.isModelLoaded) {
            return '模型已加载，准备就绪'
        } else {
            return '模型未加载'
        }
    }
}

// 创建全局单例实例
export const aiService = new AIService()