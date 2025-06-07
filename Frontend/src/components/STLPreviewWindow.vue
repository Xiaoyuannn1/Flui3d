<template>
  <div class="w-100 overflow-auto">
    <div id="stl-preview" class="px-0 mx-auto" style="width: 1000px"></div>
  </div>
</template>
<script>
import { useContentStore } from "@/stores/content";
import { useControlStore } from "@/stores/control";
import { defineComponent, onMounted } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
export default defineComponent({
  setup() {
    const controlStore = useControlStore();
    const contentStore = useContentStore();
    function isBinary(data) {
      const reader = new DataView(data);
      const face_size = (32 / 8) * 3 + (32 / 8) * 3 * 3 + 16 / 8;
      const n_faces = reader.getUint32(80, true);
      const expect = 80 + 32 / 8 + n_faces * face_size;

      if (expect === reader.byteLength) {
        return true;
      } // An ASCII STL data must begin with 'solid ' as the first six bytes.
      // However, ASCII STLs lacking the SPACE after the 'd' are known to be
      // plentiful.  So, check the first 5 bytes for 'solid'.
      // Several encodings, such as UTF-8, precede the text with up to 5 bytes:
      // https://en.wikipedia.org/wiki/Byte_order_mark#Byte_order_marks_by_encoding
      // Search for "solid" to start anywhere after those prefixes.
      // US-ASCII ordinal values for 's', 'o', 'l', 'i', 'd'

      const solid = [115, 111, 108, 105, 100];

      for (let off = 0; off < 5; off++) {
        // If "solid" text is matched to the current offset, declare it to be an ASCII STL.
        if (solid[off] !== reader.getUint8(off)) return true;
      } // Couldn't find "solid" text at the beginning; it is binary STL.

      return false;
    }

    function parseBinary(data) {
      const reader = new DataView(data);
      const faces = reader.getUint32(80, true);
      let r,
        g,
        b,
        hasColors = false;

      // check for default color in header ("COLOR=rgba" sequence).
      let index = 0;
      while (index < 70) {
        if (
          reader.getUint32(index, false) == 0x434f4c4f &&
          /*COLO*/
          reader.getUint8(index + 4) == 0x52 &&
          /*'R'*/
          reader.getUint8(index + 5) == 0x3d
          /*'='*/
        )
          break;
        ++index;
      }

      hasColors = true;
      const colors = new Float32Array(faces * 3 * 3);

      // process STL header
      const defaultR = reader.getUint8(index + 6) / 255;
      const defaultG = reader.getUint8(index + 7) / 255;
      const defaultB = reader.getUint8(index + 8) / 255;
      //   const alpha = reader.getUint8(index + 9) / 255;

      const dataOffset = 84;
      const faceLength = 12 * 4 + 2;
      const geometry = new THREE.BufferGeometry();
      const vertices = new Float32Array(faces * 3 * 3);
      const normals = new Float32Array(faces * 3 * 3);

      for (let face = 0; face < faces; face++) {
        const start = dataOffset + face * faceLength;
        const normalX = reader.getFloat32(start, true);
        const normalY = reader.getFloat32(start + 4, true);
        const normalZ = reader.getFloat32(start + 8, true);
        r = defaultR;
        g = defaultG;
        b = defaultB;

        if (hasColors) {
          const packedColor = reader.getUint16(start + 48, true);
          if ((packedColor & 0x8000) === 0) {
            // facet has its own unique color
            r = (packedColor & 0x1f) / 31;
            g = ((packedColor >> 5) & 0x1f) / 31;
            b = ((packedColor >> 10) & 0x1f) / 31;
          }
        }

        for (let i = 1; i <= 3; i++) {
          const vertexstart = start + i * 12;
          const componentIdx = face * 3 * 3 + (i - 1) * 3;
          vertices[componentIdx] = reader.getFloat32(vertexstart, true);
          vertices[componentIdx + 1] = reader.getFloat32(vertexstart + 4, true);
          vertices[componentIdx + 2] = reader.getFloat32(vertexstart + 8, true);
          normals[componentIdx] = normalX;
          normals[componentIdx + 1] = normalY;
          normals[componentIdx + 2] = normalZ;

          if (hasColors) {
            colors[componentIdx] = r;
            colors[componentIdx + 1] = g;
            colors[componentIdx + 2] = b;
          }
        }
      }

      geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));

      if (hasColors) {
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        // geometry.hasColors = true;
        // geometry.alpha = alpha;
      }

      return geometry;
    }

    function parseASCII(data) {
      const geometry = new THREE.BufferGeometry();
      const patternSolid = /solid([\s\S]*?)endsolid/g;
      const patternFace = /facet([\s\S]*?)endfacet/g;
      let faceCounter = 0;
      const patternFloat = /[\s]+([+-]?(?:\d*)(?:\.\d*)?(?:[eE][+-]?\d+)?)/
        .source;
      const patternVertex = new RegExp(
        "vertex" + patternFloat + patternFloat + patternFloat,
        "g"
      );
      const patternNormal = new RegExp(
        "normal" + patternFloat + patternFloat + patternFloat,
        "g"
      );
      const vertices = [];
      const normals = [];
      const normal = new THREE.Vector3();
      let result;
      let groupCount = 0;
      let startVertex = 0;
      let endVertex = 0;
      while ((result = patternSolid.exec(data)) !== null) {
        startVertex = endVertex;
        const solid = result[0];
        while ((result = patternFace.exec(solid)) !== null) {
          let vertexCountPerFace = 0;
          let normalCountPerFace = 0;
          const text = result[0];
          while ((result = patternNormal.exec(text)) !== null) {
            normal.x = parseFloat(result[1]);
            normal.y = parseFloat(result[2]);
            normal.z = parseFloat(result[3]);
            normalCountPerFace++;
          }
          while ((result = patternVertex.exec(text)) !== null) {
            vertices.push(
              parseFloat(result[1]),
              parseFloat(result[2]),
              parseFloat(result[3])
            );
            normals.push(normal.x, normal.y, normal.z);
            vertexCountPerFace++;
            endVertex++;
          } // every face have to own ONE valid normal

          if (normalCountPerFace !== 1) {
            console.error(
              "THREE.STLLoader: Something isn't right with the normal of face number " +
                faceCounter
            );
          } // each face have to own THREE valid vertices

          if (vertexCountPerFace !== 3) {
            console.error(
              "THREE.STLLoader: Something isn't right with the vertices of face number " +
                faceCounter
            );
          }
          faceCounter++;
        }

        const start = startVertex;
        const count = endVertex - startVertex;
        geometry.addGroup(start, count, groupCount);
        groupCount++;
      }

      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3)
      );
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(normals, 3)
      );
      return geometry;
    }

    function ensureString(buffer) {
      if (typeof buffer !== "string") {
        return THREE.LoaderUtils.decodeText(new Uint8Array(buffer));
      }
      return buffer;
    }

    function ensureBinary(buffer) {
      if (typeof buffer === "string") {
        const array_buffer = new Uint8Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
          array_buffer[i] = buffer.charCodeAt(i) & 0xff; // implicitly assumes little-endian
        }
        return array_buffer.buffer || array_buffer;
      } else {
        return buffer;
      }
    } // start
    const parseSTL = (data) => {
      const binData = ensureBinary(data);
      return isBinary(binData)
        ? parseBinary(binData)
        : parseASCII(ensureString(data));
    };


    const addMaterialAndRender = (geometry) => {
      console.log("🎨 addMaterialAndRender开始");

      // === 详细的几何体调试 ===
      window.debugGeometry = geometry; // 保存到全局变量

      console.log("📊 几何体原始信息:");
      console.log("- 顶点总数:", geometry.attributes.position.count);
      console.log("- 顶点数组长度:", geometry.attributes.position.array.length);
      console.log("- 有法向量:", !!geometry.attributes.normal);

      // 输出前30个坐标值（10个顶点）
      const positions = geometry.attributes.position.array;
      console.log("📍 前10个顶点坐标:");
      for (let i = 0; i < Math.min(30, positions.length); i += 3) {
        console.log(`  顶点${i/3}: (${positions[i].toFixed(2)}, ${positions[i+1].toFixed(2)}, ${positions[i+2].toFixed(2)})`);
      }

      // 计算和显示边界框
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      console.log("📦 边界框信息:", {
        min: `(${box.min.x.toFixed(2)}, ${box.min.y.toFixed(2)}, ${box.min.z.toFixed(2)})`,
        max: `(${box.max.x.toFixed(2)}, ${box.max.y.toFixed(2)}, ${box.max.z.toFixed(2)})`
      });

      // 计算尺寸和中心
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      console.log("📐 几何体尺寸:", `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
      console.log("📍 几何体中心:", `(${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`);

      // 检查几何体是否有效
      if (positions.length === 0) {
        console.error("❌ 几何体没有顶点数据!");
        return;
      }

      if (positions.length % 3 !== 0) {
        console.error("❌ 顶点数据不是3的倍数!");
        return;
      }

      console.log("✅ 几何体数据验证通过");

      // === 创建场景 ===
      const scene = new THREE.Scene();
      console.log("✅ 场景创建完成");

      // === 设置渲染器参数 ===
      let width = 1000, height = 720;
      let k = width / height;

      // === 创建材质（红色不透明，便于观察） ===
      let material1 = new THREE.MeshLambertMaterial({
        color: 0xff0000,        // 红色
        transparent: false,     // 不透明
        opacity: 1.0,
        side: THREE.DoubleSide
      });

      // === 创建网格 ===
      let mesh = new THREE.Mesh(geometry, material1);
      console.log("✅ 网格创建完成");
      console.log("🔍 网格位置:", mesh.position);
      console.log("🔍 网格可见性:", mesh.visible);

      scene.add(mesh);

      // === 添加光照 ===
      // 环境光（确保物体能被看到）
      const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
      scene.add(ambientLight);

      // 点光源
      const light1 = new THREE.PointLight(0xffffff, 1.0);
      light1.position.set(-50000, 100000, 0);
      scene.add(light1);

      const light2 = new THREE.PointLight(0x444444, 0.8);
      light2.position.set(50000, -50000, 10000);
      scene.add(light2);

      console.log("✅ 灯光添加完成");

      // === 设置相机（根据物体大小自动调整） ===
      const camera = new THREE.PerspectiveCamera(55, k, 1, 200000); // 增大远平面到20万

      // 根据物体实际尺寸计算合适的相机位置
      const maxDim = Math.max(size.x, size.y, size.z);
      const distance = maxDim * 1.5; // 距离是物体最大尺寸的1.5倍

      // 设置相机位置：在物体的斜上方
      camera.position.set(distance, distance * 0.8, distance * 0.6);
      camera.lookAt(center); // 让相机看向物体中心

      console.log("✅ 相机设置完成");
      console.log("📷 物体最大尺寸:", maxDim.toFixed(2));
      console.log("📷 相机距离:", distance.toFixed(2));
      console.log("📷 相机位置:", camera.position);
      console.log("👀 相机朝向:", center);

      // === 创建渲染器 ===
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      renderer.setClearColor(0xdddddd, 1); // 浅灰色背景
      console.log("✅ 渲染器创建完成");

      // === 添加到DOM ===
      let container = document.getElementById("stl-preview");
      console.log("📦 容器元素:", container);
      console.log("📦 容器子元素数量:", container.childNodes.length);

      if (container.childNodes.length > 0) {
        console.log("🔄 替换现有canvas");
        container.replaceChild(renderer.domElement, container.childNodes[0]);
      } else {
        console.log("➕ 添加新canvas");
        container.append(renderer.domElement);
      }

      console.log("📦 Canvas已添加到DOM");
      console.log("🖼️ Canvas尺寸:", renderer.domElement.width, "x", renderer.domElement.height);

      // === 首次渲染 ===
      console.log("🎬 执行首次渲染...");
      renderer.render(scene, camera);
      console.log("✅ 首次渲染完成");

      // === 添加控制器（可以拖拽旋转） ===
      let controls = new OrbitControls(camera, renderer.domElement);
      controls.addEventListener("change", () => {
        console.log("🔄 控制器触发重渲染");
        renderer.render(scene, camera);
      });
      console.log("✅ 控制器设置完成");
    };



    const init = () => {
      console.log("🎭 STLPreviewWindow开始初始化");

      // 添加短暂延迟，确保数据完全稳定
      setTimeout(() => {
        console.log("⏰ 延迟渲染开始");
        console.log("📊 延迟后数据检查:", {
          size: contentStore.stlData.byteLength,
          state: contentStore.stlLoadingState
        });

        try {
          const geometry = parseSTL(contentStore.stlData);
          console.log("✅ 延迟parseSTL成功!", geometry.attributes.position?.count);

          geometry.center();
          //geometry.scale(20, 20, 20);
          addMaterialAndRender(geometry);

        } catch (error) {
          console.error("❌ 延迟渲染失败:", error);
        }
      }, 1000); // 2000ms延迟
    };

    onMounted(init);

    return { controlStore, contentStore };
  }
});
</script>
