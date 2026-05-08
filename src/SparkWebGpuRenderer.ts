import * as THREE from "three";
import { Fn, positionGeometry, texture, uv, vec4 } from "three/tsl";
import type { WebGPURenderer } from "three/webgpu";
import { NodeMaterial } from "three/webgpu";
import {
  SparkRenderer,
  type SparkRendererMutableOptions,
  type SparkRendererOptions,
} from "./SparkRenderer";

export type SparkWebGpuRendererOptions = Omit<
  SparkRendererOptions,
  "renderer"
> & {
  /**
   * Pass in your THREE.WebGPURenderer instance. Spark splats are rendered by an
   * internal WebGL SparkRenderer, then composited into WebGPU with a TSL material.
   */
  renderer: WebGPURenderer;
  /**
   * Optional WebGLRenderer to use for the internal Spark pass.
   * @default new THREE.WebGLRenderer({ alpha: true, antialias: false })
   */
  webglRenderer?: THREE.WebGLRenderer;
  /**
   * Scales internal GS composite resolution relative to main renderer.
   * 1.0 = full resolution, 0.5 = half resolution.
   * @default 0.75
   */
  pixelRatioFactor?: number;
};

const DEFAULT_PIXEL_RATIO_FACTOR = 0.75;

const hiddenSize = new THREE.Vector2();

type HiddenObject = { object: THREE.Object3D; visible: boolean };

type MaterialObject = THREE.Object3D & {
  material?: THREE.Material | THREE.Material[];
};

function restoreHidden(hidden: HiddenObject[]) {
  for (const { object, visible } of hidden) {
    object.visible = visible;
  }
}

function isRenderableObject(object: THREE.Object3D) {
  return (
    object instanceof THREE.Mesh ||
    object instanceof THREE.Line ||
    object instanceof THREE.Points ||
    object instanceof THREE.Sprite
  );
}

function getObjectMaterials(object: THREE.Object3D) {
  const material = (object as MaterialObject).material;
  if (!material) {
    return [];
  }
  return Array.isArray(material) ? material : [material];
}

function writesDepth(object: THREE.Object3D) {
  const materials = getObjectMaterials(object);
  return materials.some((material) => material.visible && material.depthWrite);
}

function syncCameraMatrices(camera: THREE.Camera) {
  camera.updateMatrixWorld();

  if (
    camera instanceof THREE.PerspectiveCamera ||
    camera instanceof THREE.OrthographicCamera
  ) {
    camera.updateProjectionMatrix();
  }
}

function clampPixelRatioFactor(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0.5, value));
}

export class SparkWebGpuRenderer extends THREE.Mesh<
  THREE.PlaneGeometry,
  NodeMaterial
> {
  readonly renderer: WebGPURenderer;
  readonly webglRenderer: THREE.WebGLRenderer;
  readonly spark: SparkRenderer;
  readonly texture: THREE.CanvasTexture;
  private readonly depthMaterial: THREE.MeshDepthMaterial;
  private canvasWidth = 0;
  private canvasHeight = 0;
  private pixelRatio = 0;
  private pixelRatioFactor = DEFAULT_PIXEL_RATIO_FACTOR;
  private appliedPixelRatioFactor = 0;
  private sparkOptions: SparkRendererMutableOptions = {};

  constructor(options: SparkWebGpuRendererOptions) {
    if (!options) {
      throw new Error("SparkWebGpuRenderer options are required");
    }
    if (!options.renderer) {
      throw new Error("renderer is required in SparkWebGpuRenderer options");
    }

    const webglRenderer =
      options.webglRenderer ??
      new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
        premultipliedAlpha: false,
      });
    webglRenderer.setClearColor(0x000000, 0);
    webglRenderer.autoClear = true;

    const canvasTexture = new THREE.CanvasTexture(webglRenderer.domElement);
    canvasTexture.colorSpace = THREE.SRGBColorSpace;
    canvasTexture.generateMipmaps = false;
    canvasTexture.minFilter = THREE.LinearFilter;
    canvasTexture.magFilter = THREE.LinearFilter;

    const depthMaterial = new THREE.MeshDepthMaterial();
    depthMaterial.colorWrite = false;
    depthMaterial.depthTest = true;
    depthMaterial.depthWrite = true;

    const material = new NodeMaterial();
    material.transparent = true;
    material.depthTest = false;
    material.depthWrite = false;
    material.toneMapped = false;
    material.fog = false;
    material.vertexNode = Fn(() => {
      return vec4(positionGeometry.xy, 0, 1);
    })();
    material.fragmentNode = Fn(() => {
      return texture(canvasTexture, uv());
    })();

    super(new THREE.PlaneGeometry(2, 2), material);

    this.renderer = options.renderer;
    this.webglRenderer = webglRenderer;
    this.texture = canvasTexture;
    this.depthMaterial = depthMaterial;
    const {
      renderer: _renderer,
      webglRenderer: _webglRenderer,
      pixelRatioFactor: _pixelRatioFactor,
      ...sparkOptions
    } = options;
    this.sparkOptions = { ...sparkOptions };
    this.spark = new SparkRenderer({
      ...sparkOptions,
      renderer: webglRenderer,
    });

    this.pixelRatioFactor = clampPixelRatioFactor(
      options.pixelRatioFactor ?? DEFAULT_PIXEL_RATIO_FACTOR,
    );

    this.frustumCulled = false;
    this.renderOrder = Number.MAX_SAFE_INTEGER;
  }

  dispose() {
    this.spark.dispose();
    this.texture.dispose();
    this.depthMaterial.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.webglRenderer.dispose();
  }

  async update(args: Parameters<SparkRenderer["update"]>[0]) {
    return this.spark.update(args);
  }

  async renderCubeMap(args: Parameters<SparkRenderer["renderCubeMap"]>[0]) {
    return this.spark.renderCubeMap(args);
  }

  async renderEnvMap(args: Parameters<SparkRenderer["renderEnvMap"]>[0]) {
    return this.spark.renderEnvMap(args);
  }

  recurseSetEnvMap(root: THREE.Object3D, envMap: THREE.Texture) {
    return this.spark.recurseSetEnvMap(root, envMap);
  }

  setPixelRatioFactor(factor: number) {
    this.pixelRatioFactor = clampPixelRatioFactor(factor);
  }

  getPixelRatioFactor() {
    return this.pixelRatioFactor;
  }

  setSparkOptions(options: SparkRendererMutableOptions) {
    this.sparkOptions = { ...this.sparkOptions, ...options };
    this.spark.applyOptions(options);
  }

  getSparkOptions() {
    return { ...this.sparkOptions };
  }

  private syncRenderSize(renderer: WebGPURenderer) {
    const drawSize = renderer.getDrawingBufferSize(hiddenSize);
    const pixelRatioFactor = this.pixelRatioFactor;
    const nextPixelRatio = Math.max(
      1,
      renderer.getPixelRatio() * pixelRatioFactor,
    );
    const nextCanvasWidth = Math.max(
      1,
      Math.round(drawSize.x * pixelRatioFactor),
    );
    const nextCanvasHeight = Math.max(
      1,
      Math.round(drawSize.y * pixelRatioFactor),
    );
    const resized =
      nextCanvasWidth !== this.canvasWidth ||
      nextCanvasHeight !== this.canvasHeight;
    const pixelRatioChanged = nextPixelRatio !== this.pixelRatio;
    const factorChanged = pixelRatioFactor !== this.appliedPixelRatioFactor;
    const logicalWidth = nextCanvasWidth / Math.max(nextPixelRatio, 1e-6);
    const logicalHeight = nextCanvasHeight / Math.max(nextPixelRatio, 1e-6);

    if (pixelRatioChanged) {
      this.webglRenderer.setPixelRatio(nextPixelRatio);
      this.pixelRatio = nextPixelRatio;
    }

    if (resized || pixelRatioChanged || factorChanged) {
      this.webglRenderer.setSize(logicalWidth, logicalHeight, false);

      this.canvasWidth = this.webglRenderer.domElement.width;
      this.canvasHeight = this.webglRenderer.domElement.height;
      this.appliedPixelRatioFactor = pixelRatioFactor;

      // WebGPU caches a GPU texture per THREE.Texture instance. When the backing
      // canvas size changes, dispose the old GPU texture so it is recreated with
      // the new dimensions on the next upload.
      this.texture.dispose();
    }
  }

  private prepareComposite(
    renderer: WebGPURenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.syncRenderSize(renderer);
    syncCameraMatrices(camera);

    const hidden: HiddenObject[] = [];
    const hide = (object: THREE.Object3D) => {
      hidden.push({ object, visible: object.visible });
      object.visible = false;
    };

    scene.traverse((object) => {
      if (object instanceof SparkWebGpuRenderer || object === this.spark) {
        hide(object);
        return;
      }
      if (isRenderableObject(object) && !writesDepth(object)) {
        hide(object);
      }
    });

    const background = scene.background;
    const overrideMaterial = scene.overrideMaterial;
    const autoClear = this.webglRenderer.autoClear;
    scene.background = null;

    try {
      this.webglRenderer.autoClear = false;
      scene.overrideMaterial = this.depthMaterial;
      this.webglRenderer.clear(true, true, true);
      this.webglRenderer.render(scene, camera);

      restoreHidden(hidden);
      hidden.length = 0;

      scene.traverse((object) => {
        if (object instanceof SparkWebGpuRenderer || object === this.spark) {
          hide(object);
          return;
        }
        if (isRenderableObject(object)) {
          hide(object);
        }
      });

      scene.overrideMaterial = overrideMaterial;
      scene.add(this.spark);
      this.spark.render(scene, camera);
    } finally {
      this.spark.removeFromParent();
      scene.overrideMaterial = overrideMaterial;
      scene.background = background;
      this.webglRenderer.autoClear = autoClear;
      restoreHidden(hidden);
    }

    this.texture.needsUpdate = true;
  }

  onBeforeRender(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.prepareComposite(renderer as unknown as WebGPURenderer, scene, camera);
  }
}
