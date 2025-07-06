import * as ort from 'onnxruntime-web'


export interface PredictionResult {
    x: number
    y: number
    prediction: number
}

export class AIService {
    private session: ort.InferenceSession | null = null
    private isModelLoaded = false

    // Load ONNX model with WebGL/WASM fallback
    async loadModel(): Promise<void> {
        console.log('Loading ONNX model...')
        // Set WASM resource path for CPU backend
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/'

        let providerUsed = ''

        try {
            // Try WebGL backend first
            console.log('Attempting WebGL backend loading (GPU priority)...')
            this.session = await ort.InferenceSession.create(
                '/models/compensation_model_no_bn_fixed.onnx',
                { executionProviders: ['webgl'] }
            )
            providerUsed = 'webgl'
            console.log('WebGL backend loaded successfully, using GPU')
        } catch (webglErr: any) {
            console.warn('WebGL backend initialization failed, falling back to WASM (CPU)...', webglErr.message)
            // Fallback to WASM
            this.session = await ort.InferenceSession.create(
                '/models/compensation_model_no_bn_fixed.onnx',
                { executionProviders: ['wasm'] }
            )
            providerUsed = 'wasm'
            console.log('WASM backend loaded successfully, using CPU')
        }

        // //只使用cpu进行测试
        // try {
        //     console.log('[AI]  使用 WASM 后端加载（CPU 测试模式）...')
        //     this.session = await ort.InferenceSession.create(
        //         '/models/compensation_model_no_bn_fixed.onnx',
        //         { executionProviders: ['wasm'] }
        //     )
        //     providerUsed = 'wasm'
        //     console.log('[AI] ✅ WASM 后端加载成功，使用 CPU 运行')
        //
        // } catch (wasmErr: any) {
        //     console.error('[AI] ❌ WASM 后端失败了:', wasmErr.message)
        //     throw wasmErr
        // }


        this.isModelLoaded = true

        console.log('Backend in use:', providerUsed)

        console.log('Model input details:')
        this.session.inputNames.forEach((name, index) => {
            console.log(`  Input ${index}: name="${name}"`)
        })

        console.log('Model output details:')
        this.session.outputNames.forEach((name, index) => {
            console.log(`  Output ${index}: name="${name}"`)
        })

    }


    // Execute single prediction with two 256x256 images
    async predictSingle(fusedImageData: Float32Array, extraImageData: Float32Array): Promise<number> {
        if (!this.isModelLoaded || !this.session) {
            throw new Error('AI模型未加载，请先调用loadModel()')
        }

        try {
            // Validate data length
            const expectedLength = 1 * 1 * 256 * 256; // 65536
            if (fusedImageData.length !== expectedLength) {
                throw new Error(`Fused image数据长度不匹配: 实际${fusedImageData.length}, 期望${expectedLength}`)
            }
            if (extraImageData.length !== expectedLength) {
                throw new Error(`Extra image数据长度不匹配: 实际${extraImageData.length}, 期望${expectedLength}`)
            }


            const fusedTensor = new ort.Tensor('float32', fusedImageData, [1, 1, 256, 256])
            const extraTensor = new ort.Tensor('float32', extraImageData, [1, 1, 256, 256])

            // Execute inference
            const outputs = await this.session.run({
                'fused_image': fusedTensor,
                'extra_image': extraTensor
            })

            const prediction = outputs['z_metric_pred'].data[0] as number
            return prediction

        } catch (error) {
            console.error('[AI] Single prediction failed:', error)
            throw new Error(`AI prediction failed: ${String(error)}`)
        }
    }

    // Batch prediction for multiple image pairs
    async predictBatch(imagePairs: Array<{
        fused: Float32Array,
        extra: Float32Array,
        x: number,
        y: number
    }>): Promise<PredictionResult[]> {

        const results: PredictionResult[] = []
        const totalSamples = imagePairs.length


        for (let i = 0; i < imagePairs.length; i++) {
            const pair = imagePairs[i]

            try {
                const prediction = await this.predictSingle(pair.fused, pair.extra)

                results.push({
                    x: pair.x,
                    y: pair.y,
                    prediction: prediction
                })

                console.log(`[AI] Point (${pair.x.toString().padStart(4)}, ${pair.y.toString().padStart(4)}): Z_metric_pred = ${prediction.toFixed(6)}`)

                if ((i + 1) % 20 === 0) {
                    const progress = ((i + 1) / totalSamples * 100).toFixed(1)
                    console.log(`[AI] Prediction progress: ${i + 1}/${totalSamples} (${progress}%)`)
                }

            } catch (error) {
                console.error(`[AI] Prediction failed at position (${pair.x}, ${pair.y}):`, error)
                // Use default value to avoid breaking entire pipeline
                results.push({
                    x: pair.x,
                    y: pair.y,
                    prediction: 0.0
                })
            }
        }

        console.log(`Successfully predicted ${results.filter(r => r.prediction !== 0.0).length}/${totalSamples} samples`)

        return results
    }

    /**
     *  Check if model is ready for inference
     */
    isReady(): boolean {
        return this.isModelLoaded && this.session !== null
    }

    getStatus(): string {
        if (this.isModelLoaded) {
            return '模型已加载，准备就绪'
        } else {
            return '模型未加载'
        }
    }
}
// Export a singleton instance of AIService
export const aiService = new AIService()