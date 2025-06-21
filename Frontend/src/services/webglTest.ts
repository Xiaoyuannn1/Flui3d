import * as ort from 'onnxruntime-web'

export class WebGLTest {
    private session: ort.InferenceSession | null = null

    /**
     * 检测WebGL支持情况
     */
    checkWebGLSupport(): boolean {
        try {
            console.log('[WebGL Test] 🔍 检测WebGL支持...')

            const canvas = document.createElement('canvas')
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')

            if (!gl) {
                console.log('[WebGL Test] ❌ 浏览器不支持WebGL')
                return false
            }

            console.log('[WebGL Test] ✅ WebGL基本支持检测通过')
            console.log('[WebGL Test] 📋 WebGL信息:')
            console.log('  - 版本:', gl.getParameter(gl.VERSION))
            console.log('  - 渲染器:', gl.getParameter(gl.RENDERER))
            console.log('  - 供应商:', gl.getParameter(gl.VENDOR))

            // 检查Float32纹理支持
            const floatExt = gl.getExtension('OES_texture_float') || gl.getExtension('EXT_color_buffer_float')
            if (!floatExt) {
                console.log('[WebGL Test] ❌ 不支持Float32纹理')
                return false
            }

            console.log('[WebGL Test] ✅ Float32纹理支持检测通过')

            // 检查最大纹理尺寸
            const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE)
            console.log('[WebGL Test] 📏 最大纹理尺寸:', maxTextureSize)

            if (maxTextureSize < 2048) {
                console.log('[WebGL Test] ⚠️ 纹理尺寸可能不足')
                return false
            }

            return true

        } catch (error) {
            console.log('[WebGL Test] ❌ WebGL检测异常:', error)
            return false
        }
    }


    /**
     * 测试ONNX Runtime Web的WebGL执行提供程序
     */
    async testONNXWebGL(): Promise<void> {
        try {
            console.log('[WebGL Test] 🚀 测试ONNX Runtime WebGL...')

            // 🔥 WebGL优化配置
            ort.env.webgl = {
                contextId: 'webgl2',
                matmulMaxBatchSize: 1,        // 减小批处理，提高稳定性
                textureCacheMode: 'initializerOnly',
                pack: false,                  // 禁用打包，提高兼容性
                async: false                  // 禁用异步，避免竞争条件
            };

            console.log('[WebGL Test] 🔧 WebGL优化配置已设置')

            // 使用您当前的WASM路径设置
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/'

            console.log('[WebGL Test] 🔧 尝试加载WebGL兼容模型...')

            const startLoadTime = performance.now()

            // 🔥 使用WebGL兼容的模型
            this.session = await ort.InferenceSession.create('/models/compensation_model_no_bn_fixed.onnx', {
                executionProviders: ['webgl', 'wasm']
            })

            const loadTime = performance.now() - startLoadTime
            console.log(`[WebGL Test] ✅ WebGL兼容模型加载成功! 耗时: ${loadTime.toFixed(1)}ms`)

            // 获取实际使用的执行提供程序信息
            console.log('[WebGL Test] 📋 模型信息:')
            console.log('  - 输入:', this.session.inputNames)
            console.log('  - 输出:', this.session.outputNames)

        } catch (error) {
            console.log('[WebGL Test] ❌ ONNX WebGL测试失败:', error)
            throw error
        }
    }

    /**
     * 性能基准测试：WebGL vs WASM
     */
    async performanceBenchmark(): Promise<void> {
        if (!this.session) {
            throw new Error('模型未加载')
        }

        console.log('[WebGL Test] ⚡ 开始性能基准测试...')

        // 准备测试数据
        const testData1 = new Float32Array(256 * 256)
        const testData2 = new Float32Array(256 * 256)

        // 填充测试数据（模拟真实场景）
        // for (let i = 0; i < testData1.length; i++) {
        //     testData1[i] = Math.random()
        //     testData2[i] = Math.random()
        // }
        // 🔥 替换为更简单的测试数据：
        testData1.fill(0.5)  // 全部填充为0.5
        testData2.fill(0.5)  // 全部填充为0.5

        console.log('[WebGL Test] 📊 测试数据准备完成')

        // 执行多次推理测试
        const testRounds = 5
        const times: number[] = []

        for (let round = 0; round < testRounds; round++) {
            const fusedTensor = new ort.Tensor('float32', testData1, [1, 1, 256, 256])
            const extraTensor = new ort.Tensor('float32', testData2, [1, 1, 256, 256])

            const startTime = performance.now()

            const outputs = await this.session.run({
                'fused_image': fusedTensor,
                'extra_image': extraTensor
            })

            const endTime = performance.now()
            const duration = endTime - startTime
            times.push(duration)

            const prediction = outputs['z_metric_pred'].data[0] as number
            console.log(`[WebGL Test] 🔄 第${round + 1}轮: ${duration.toFixed(1)}ms, 预测值: ${prediction.toFixed(6)}`)
        }

        // 计算统计信息
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length
        const minTime = Math.min(...times)
        const maxTime = Math.max(...times)

        console.log('[WebGL Test] 📈 性能统计:')
        console.log(`  - 平均耗时: ${avgTime.toFixed(1)}ms`)
        console.log(`  - 最快耗时: ${minTime.toFixed(1)}ms`)
        console.log(`  - 最慢耗时: ${maxTime.toFixed(1)}ms`)

        // 性能判断
        if (avgTime < 30) {
            console.log('[WebGL Test] 🚀 性能优秀! 很可能使用了WebGL加速')
        } else if (avgTime < 100) {
            console.log('[WebGL Test] 🟡 性能良好，可能使用了优化的WASM')
        } else {
            console.log('[WebGL Test] 🐌 性能一般，可能回退到标准WASM')
        }
    }

    /**
     * 对比测试：强制WASM vs 混合模式
     */
    /**
     * 对比测试：强制WASM vs 混合模式
     */
    async compareWASMvsWebGL(): Promise<void> {
        console.log('[WebGL Test] 🔬 开始对比测试...')

        try {
            // 测试1：强制WASM
            console.log('[WebGL Test] 🧪 测试1: 强制WASM模式')
            const wasmSession = await ort.InferenceSession.create('/models/compensation_model_no_bn_fixed.onnx', {
                executionProviders: ['wasm']
            })

            const testData = new Float32Array(256 * 256).fill(0.5)
            const startWasm = performance.now()

            await wasmSession.run({
                'fused_image': new ort.Tensor('float32', testData, [1, 1, 256, 256]),
                'extra_image': new ort.Tensor('float32', testData, [1, 1, 256, 256])
            })

            const wasmTime = performance.now() - startWasm
            console.log(`[WebGL Test] ⏱️ WASM耗时: ${wasmTime.toFixed(1)}ms`)

            // 测试2：WebGL + WASM混合
            console.log('[WebGL Test] 🧪 测试2: WebGL优先模式')

            // 🔥 设置WebGL优化配置
            ort.env.webgl = {
                contextId: 'webgl2',
                matmulMaxBatchSize: 1,
                textureCacheMode: 'initializerOnly',
                pack: false,
                async: false
            };

            const webglSession = await ort.InferenceSession.create('/models/compensation_model_no_bn_fixed.onnx', {
                executionProviders: ['webgl', 'wasm']
            })

            const startWebGL = performance.now()

            await webglSession.run({
                'fused_image': new ort.Tensor('float32', testData, [1, 1, 256, 256]),
                'extra_image': new ort.Tensor('float32', testData, [1, 1, 256, 256])
            })

            const webglTime = performance.now() - startWebGL
            console.log(`[WebGL Test] ⏱️ WebGL模式耗时: ${webglTime.toFixed(1)}ms`)

            // 对比结果
            const speedup = wasmTime / webglTime
            console.log(`[WebGL Test] 🏁 性能对比结果:`)
            console.log(`  - 加速比: ${speedup.toFixed(2)}x`)

            if (speedup > 2) {
                console.log(`[WebGL Test] 🎉 WebGL加速明显! 速度提升${((speedup - 1) * 100).toFixed(0)}%`)
            } else if (speedup > 1.2) {
                console.log(`[WebGL Test] ✅ WebGL有一定加速效果`)
            } else {
                console.log(`[WebGL Test] 🤔 WebGL加速不明显，可能回退到WASM`)
            }

        } catch (error) {
            console.log('[WebGL Test] ❌ 对比测试失败:', error)
        }
    }

    /**
     * 运行完整测试套件
     */
    async runFullTest(): Promise<void> {
        console.log('[WebGL Test] 🎯 开始完整WebGL兼容性测试')
        console.log('='.repeat(50))

        try {
            // 1. 基础WebGL支持检测
            const webglSupported = this.checkWebGLSupport()
            if (!webglSupported) {
                console.log('[WebGL Test] ❌ WebGL基础支持检测失败，终止测试')
                return
            }

            console.log('='.repeat(50))

            // 2. ONNX Runtime WebGL测试
            await this.testONNXWebGL()

            console.log('='.repeat(50))

            // 3. 性能基准测试
            await this.performanceBenchmark()

            console.log('='.repeat(50))

            // 4. 对比测试
            await this.compareWASMvsWebGL()

            console.log('='.repeat(50))
            console.log('[WebGL Test] 🎉 完整测试完成!')

        } catch (error) {
            console.log('[WebGL Test] ❌ 测试过程中发生错误:', error)
        }
    }
}

// 创建全局测试实例
export const webglTest = new WebGLTest()

// 导出便捷测试函数
export async function runWebGLTest(): Promise<void> {
    await webglTest.runFullTest()
}