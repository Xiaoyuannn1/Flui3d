<template>
  <div
    class="modal fade"
    data-bs-backdrop="static"
    data-bs-keyboard="false"
    id="outputOptionModal"
    tabindex="-1"
    aria-hidden="true"
  >
    <div
      class="modal-dialog modal-dialog-centered"
      :class="{ 'xl-width': showStlPreview }"
    >
      <STLPreviewVue v-if="showStlPreview" />
      <div class="modal-content" v-else>
        <div class="modal-header">
          <h5 class="modal-title">Output Options</h5>
          <button
            type="button"
            class="btn-close"
            data-bs-dismiss="modal"
            aria-label="Close"
          ></button>
        </div>

        <div class="modal-body">
          <form @submit.prevent="loadSTL()">
            <div class="mb-4">
              <label class="form-label" for="presicionSelect"
                >Precision: {{ precisionValue[precisionIdx] }}</label
              >
              <div class="px-5">
                <input
                  class="form-range px-1"
                  type="range"
                  min="0"
                  max="2"
                  v-model="precisionIdx"
                />
                <ul
                  class="w-100 d-flex justify-content-between p-0 m-0"
                  style="list-style-type: none; font-size: small"
                >
                  <li>low</li>
                  <li>medium</li>
                  <li>high</li>
                </ul>
              </div>
            </div>

            <div class="mb-4">
              <label class="form-label" for="presicionSelect"
                >Output Format:</label
              >
              <select
                id="presicionSelect"
                class="form-select"
                aria-label="Default select example"
                required
                v-model="isBinary"
              >
                <option :value="true">Binary</option>
                <option :value="false">ASCII</option>
              </select>
            </div>

            <div class="mb-4">
              <label class="form-label" for="presicionSelect"
                >Exposure Penetration Compensation:</label
              >


              <div class="form-check form-switch">
                <input
                  class="form-check-input"
                  type="checkbox"
                  role="switch"
                  id="globalEPC"
                  v-model="globalChecked"
                />
                <label class="form-check-label" for="globalEPC">Global</label>
              </div>
              <div class="mb-3">
                <label class="form-check-label" for="heightCompensation"
                  >Compensation per layer:</label
                >
                <div class="input-group flex-nowrap">
                  <input
                    class="form-control"
                    min="0"
                    type="number"
                    step="50"
                    id="heightCompensation"
                    v-model="globalCompensation"
                    :disabled="!globalChecked"
                    :required="globalChecked"
                  />
                  <span class="input-group-text">µm</span>
                </div>
              </div>

              <div class="form-check form-switch">
                <input
                  class="form-check-input"
                  type="checkbox"
                  role="switch"
                  id="localEPC"
                  v-model="localChecked"
                />
                <label class="form-check-label" for="localEPC">Local</label>
              </div>
              <div class="mb-3 row">
                <div class="col">
                  <label class="form-check-label" for="compensationMin"
                    >Compensation min.:</label
                  >
                  <div class="input-group flex-nowrap">
                    <input
                      class="form-control"
                      min="0"
                      step="50"
                      type="number"
                      id="compensationMin"
                      v-model="localCompensationMin"
                      :disabled="!localChecked"
                      :required="localChecked"
                    />
                    <span class="input-group-text">µm</span>
                  </div>
                </div>
                <div class="col">
                  <label class="form-check-label" for="minAt">at:</label>
                  <div class="input-group flex-nowrap">
                    <input
                      class="form-control"
                      min="0"
                      type="number"
                      id="minAt"
                      step="50"
                      v-model="minAt"
                      :disabled="!localChecked"
                      :required="localChecked"
                    />
                    <span class="input-group-text">µm</span>
                  </div>
                </div>
              </div>
              <div class="mb-3 row">
                <div class="col">
                  <label class="form-check-label" for="compensationMax"
                    >Compensation max:</label
                  >
                  <div class="input-group flex-nowrap">
                    <input
                      class="form-control"
                      :min="localCompensationMin"
                      type="number"
                      id="compensationMax"
                      step="50"
                      v-model="localCompensationMax"
                      :disabled="!localChecked"
                      :required="localChecked"
                    />
                    <span class="input-group-text">µm</span>
                  </div>
                </div>
                <div class="col">
                  <label class="form-check-label" for="maxAt">at:</label>
                  <div class="input-group flex-nowrap">
                    <input
                      class="form-control"
                      :min="minAt"
                      type="number"
                      step="50"
                      id="maxAt"
                      v-model="maxAt"
                      :disabled="!localChecked"
                      :required="localChecked"
                    />
                    <span class="input-group-text">µm</span>
                  </div>
                </div>
              </div>
              <div class="form-check form-switch">
                <input
                    class="form-check-input"
                    type="checkbox"
                    role="switch"
                    id="aiEPC"
                    v-model="aiChecked"
                />
                <label class="form-check-label" for="aiEPC">AI</label>
              </div>
              <!-- 🔥 在这里添加AI状态显示区域 -->
              <div v-if="aiChecked" class="mt-2 p-2 border rounded" style="background-color: #f8f9fa;">
                <!-- AI模型状态 -->
                <div class="d-flex align-items-center mb-1">
                  <small class="text-muted">AI模型状态:</small>
                  <span class="ms-2 badge" :class="aiModelLoaded ? 'bg-success' : 'bg-secondary'">
      {{ aiModelLoaded ? '已加载' : '未加载' }}
    </span>
                </div>

                <!-- AI处理进度 -->
                <div v-if="aiProgress" class="mb-1">
                  <small class="text-muted">{{ aiProgress.message }}</small>
                  <div v-if="aiProgress.progress !== undefined" class="progress mt-1" style="height: 4px;">
                    <div class="progress-bar" :style="`width: ${aiProgress.progress}%`"></div>
                  </div>
                </div>

                <!-- AI错误信息 -->
                <div v-if="aiError" class="alert alert-danger py-1 px-2 mb-1" style="font-size: 0.8em;">
                  {{ aiError }}
                </div>

                <!-- AI处理状态 -->
                <div v-if="aiProcessing" class="d-flex align-items-center">
                  <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                  <small class="text-primary">AI正在处理中...</small>
                </div>
              </div>
            </div>
            <hr />
            <div class="d-flex">
              <button
                type="button"
                class="btn btn-outline-secondary position-absolute"
                @click="downloadSVGZip"
              >
                Download SVG
              </button>
              <button type="submit" class="btn btn-primary m-auto">
                Generate
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import { useContentStore } from "@/stores/content";
import { defineComponent, onMounted, ref, onUnmounted} from "vue";
import STLPreviewVue from "./STLPreview.vue";
// import JSZip from "jszip";
// import { saveAs } from "file-saver";
import { SlicerService } from '@/services/slicerService'
import { DownloadService } from '@/services/downloadService'
import { AIPredictionService } from '@/services/aiPredictionService'
interface AIPredictionProgress {
  stage: 'loading' | 'processing' | 'predicting' | 'completed' | 'error'
  message: string
  progress?: number
}
import { runWebGLTest } from '@/services/webglTest'
import { buildRequestBody } from '@/library/utilities/payloadBuilder'

export default defineComponent({
  components: { STLPreviewVue },
  setup() {
    const contentStore = useContentStore();
    const precisionIdx = ref(1);
    const precisionValue = ["Low", "Medium", "High"];
    const globalChecked = ref(false);
    const localChecked = ref(false);
    const aiChecked = ref(false);
    const globalCompensation = ref(100);
    const localCompensationMin = ref(100);
    const localCompensationMax = ref(800);
    const minAt = ref(200);
    const maxAt = ref(4000);
    const showStlPreview = ref(false);
    const isBinary = ref(true);


    //  新增：AI相关的响应式变量
    const aiModelLoaded = ref(false);           // AI模型是否已加载
    const aiProcessing = ref(false);            // AI是否正在处理
    const aiProgress = ref<AIPredictionProgress | null>(null); // AI处理进度
    const aiError = ref<string | null>(null);  // AI错误信息

    // 在setup()函数内部添加
    onUnmounted(() => {
      // 清理AI资源
      if (aiModelLoaded.value) {
        AIPredictionService.cleanup()
        console.log('[UI] 🧹 组件卸载，已清理AI资源')
      }
    })

    const loadSTL = async () => {
      try {
        // 1. AI初始化（如果需要）
        if (aiChecked.value) {
          const aiInitSuccess = await initializeAIModel()
          if (!aiInitSuccess) {
            aiChecked.value = false
          }
        }

        // 2. 生成STL
        await contentStore.requestNewStlData(
            precisionValue[precisionIdx.value],
            globalChecked.value,
            globalCompensation.value,
            localChecked.value,
            localCompensationMin.value,
            minAt.value,
            localCompensationMax.value,
            maxAt.value,
            isBinary.value
        );

        // 3. 检查STL生成成功
        if (contentStore.stlLoadingState === 2) {
          showStlPreview.value = true

          // 4. 🔥 关键修正：如果勾选AI，主动执行切片操作
          if (aiChecked.value && aiModelLoaded.value) {
            //console.log('[UI] 🔄 为AI预测执行切片操作...')

            // 执行切片操作（这会自动保存slice_0和slice_100）
            await SlicerService.generateSlices(
                contentStore.stlData,
                100.5,    // zStep
                10      // scaleFactor
            )

            // 然后执行AI预测
            setTimeout(async () => {
              await performAIPrediction()
            }, 100)
          }
        }

      } catch (error: any) {
        console.error('[UI] 流程失败:', error)
        alert(`生成失败: ${error.message}`)
      }
    }

    //  新增：AI模型初始化函数
    const initializeAIModel = async () => {
      if (aiModelLoaded.value) {
        console.log('[UI] AI模型已加载，跳过初始化')
        return true
      }

      try {
        //console.log('[UI] 🚀 开始初始化AI模型...')
        aiError.value = null

        await AIPredictionService.initialize((progress) => {
          aiProgress.value = progress
          console.log(`[UI] AI初始化进度: ${progress.message}`)
        })

        aiModelLoaded.value = true
        //console.log('[UI] ✅ AI模型初始化成功!')
        return true

      } catch (error: any) {
        //console.error('[UI] ❌ AI模型初始化失败:', error)
        aiError.value = `AI模型加载失败: ${error.message}`
        aiModelLoaded.value = false
        return false
      }
    }
    //  新增：执行AI预测的函数
// 新增：执行AI预测的函数
    const performAIPrediction = async () => {
      if (!aiChecked.value) {
        console.log('[UI] AI未勾选，跳过预测')
        return
      }

      try {
        //console.log('[UI] 🤖 开始执行AI预测...')
        aiProcessing.value = true
        aiError.value = null

        // 1. 构建JSON数据
        const chipJSONString = buildRequestBody(
            precisionValue[precisionIdx.value],
            globalChecked.value,
            globalCompensation.value,
            localChecked.value,
            localCompensationMin.value,
            minAt.value,
            localCompensationMax.value,
            maxAt.value
        )
        const chipJSON = JSON.parse(chipJSONString)
        //console.log('[UI] 📋 JSON数据构建完成，层数:', chipJSON.layers?.length || 0)

        // 2. 执行AI预测，传递JSON数据
        const predictions = await AIPredictionService.performPrediction((progress) => {
          aiProgress.value = progress
          console.log(`[UI] ${progress.message}`)
        }, chipJSON)  // 传递chipJSON

        //console.log('[UI] 🎉 AI预测完成!')
        //console.log(`[UI] 📊 获得 ${predictions.length} 个预测结果`)

        // 3. 输出结果汇总
        //console.log('[UI] 📋 AI预测结果汇总:')
        // predictions.forEach((result, index) => {
        //   console.log(`[UI] ${index + 1}. Point(${result.x}, ${result.y}): Z_metric = ${result.prediction.toFixed(6)}`)
        // })

      } catch (error: any) {
        //console.error('[UI] ❌ AI预测失败:', error)
        aiError.value = `AI预测失败: ${error.message}`
        alert(`AI预测失败: ${error.message}`)

      } finally {
        aiProcessing.value = false
        aiProgress.value = null
      }
    }

    // 新增：执行切片功能
    const performSlicing = async () => {
      try {


        const stlData = contentStore.stlData
        if (!stlData || stlData.byteLength === 0) {
          throw new Error('empty STL data')
        }


        // 执行切片
        const result = await SlicerService.generateSlices(
            stlData,
            100.5,    // Z步长
            10      // 缩放因子
        )


        // 生成文件名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const zipFilename = `${contentStore.title}_slices_${timestamp}.zip`

        // 下载ZIP文件
        await DownloadService.downloadSlicesAsZip(
            result.sliceImages,
            result.sliceInfo,
            zipFilename
        )


      } catch (error:any) {
        alert('Slicing failed: ' + error.message)
      }
    }
    //
    // const downloadSVGZip = () => {
    //   const zip = new JSZip();
    //   const color = "#0d6efd";
    //   const svgTag = `<svg width="${contentStore.chipLengthX / 10}" height="${
    //     contentStore.chipLengthY / 10
    //   }" viewBox="-5 -5 ${contentStore.chipLengthX + 5} ${
    //     contentStore.chipLengthY + 5
    //   }" xmlns="http://www.w3.org/2000/svg" fill="${color}" stroke="${color}">`;
    //
    //   const chipBoundary = `<rect x="0" y="0" width="${contentStore.chipLengthX}" height="${contentStore.chipLengthY}" fill="none" stroke-width="10" stroke="black"/>`;
    //   try {
    //     const svgContent = document.getElementById("svgContent");
    //     svgContent.childNodes.forEach((layerContent) => {
    //       const layer = contentStore.layers.get(layerContent.id);
    //       if (layer) {
    //         const svgData = `${svgTag}${chipBoundary}${layerContent.innerHTML}</svg>`;
    //         zip.file(`${layer.label}_${layer.height}.svg`, svgData);
    //       }
    //     })
    //     ;
    //     zip.generateAsync({ type: "blob" }).then(function (content) {
    //       saveAs(content, `${contentStore.title}_svg.zip`);
    //     });
    //   } catch (err) {
    //     console.log(err);
    //   }
    // };

    onMounted(() => {
      const myModalEl = document.getElementById("outputOptionModal");
      if (myModalEl) {  // 添加null检查
        myModalEl.addEventListener("hidden.bs.modal", () => {
          showStlPreview.value = false;
        });
      }
    });


    return {
      globalChecked,
      localChecked,
      aiChecked,
      performSlicing,
      globalCompensation,
      localCompensationMin,
      localCompensationMax,
      minAt,
      maxAt,
      showStlPreview,
      loadSTL,
      isBinary,
      precisionIdx,
      precisionValue,
      //downloadSVGZip,
      aiModelLoaded,
      aiProcessing,
      aiProgress,
      aiError,
      initializeAIModel,
      performAIPrediction
    };
  }
});
</script>

<style scoped>
.xl-width {
  min-width: 1100px;
}
</style>
