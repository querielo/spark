import { WebGPURenderer, NodeMaterial } from 'three/webgpu';
import { SparkRenderer, SparkRendererMutableOptions, SparkRendererOptions } from './SparkRenderer';
import * as THREE from "three";
export type SparkWebGpuRendererOptions = Omit<SparkRendererOptions, "renderer"> & {
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
     * @default 1.0
     */
    pixelRatioFactor?: number;
};
export declare class SparkWebGpuRenderer extends THREE.Mesh<THREE.PlaneGeometry, NodeMaterial> {
    readonly renderer: WebGPURenderer;
    readonly webglRenderer: THREE.WebGLRenderer;
    readonly spark: SparkRenderer;
    readonly texture: THREE.CanvasTexture;
    private readonly depthMaterial;
    private canvasWidth;
    private canvasHeight;
    private pixelRatio;
    private pixelRatioFactor;
    private appliedPixelRatioFactor;
    private sparkOptions;
    constructor(options: SparkWebGpuRendererOptions);
    dispose(): void;
    update(args: Parameters<SparkRenderer["update"]>[0]): Promise<void>;
    renderCubeMap(args: Parameters<SparkRenderer["renderCubeMap"]>[0]): Promise<THREE.CubeTexture>;
    renderEnvMap(args: Parameters<SparkRenderer["renderEnvMap"]>[0]): Promise<THREE.Texture>;
    recurseSetEnvMap(root: THREE.Object3D, envMap: THREE.Texture): void;
    setPixelRatioFactor(factor: number): void;
    getPixelRatioFactor(): number;
    setSparkOptions(options: SparkRendererMutableOptions): void;
    getSparkOptions(): {
        covSplats?: boolean | undefined;
        sortRadial?: boolean | undefined;
        vertexShader?: string | undefined;
        fragmentShader?: string | undefined;
        transparent?: boolean | undefined;
        depthTest?: boolean | undefined;
        depthWrite?: boolean | undefined;
        premultipliedAlpha?: boolean | undefined;
        target?: ({
            width: number;
            height: number;
            doubleBuffer?: boolean;
            superXY?: number;
        } & THREE.RenderTargetOptions) | undefined;
        onDirty?: (() => void) | undefined;
        encodeLinear?: boolean | undefined;
        clock?: THREE.Clock | undefined;
        autoUpdate?: boolean | undefined;
        preUpdate?: boolean | undefined;
        maxStdDev?: number | undefined;
        minPixelRadius?: number | undefined;
        maxPixelRadius?: number | undefined;
        accumExtSplats?: boolean | undefined;
        minAlpha?: number | undefined;
        enable2DGS?: boolean | undefined;
        preBlurAmount?: number | undefined;
        blurAmount?: number | undefined;
        focalDistance?: number | undefined;
        apertureAngle?: number | undefined;
        falloff?: number | undefined;
        clipXY?: number | undefined;
        focalAdjustment?: number | undefined;
        minSortIntervalMs?: number | undefined;
        enableLod?: boolean | undefined;
        enableDriveLod?: boolean | undefined;
        enableLodFetching?: boolean | undefined;
        lodSplatCount?: number | undefined;
        lodSplatScale?: number | undefined;
        lodRenderScale?: number | undefined;
        lodInflate?: boolean | undefined;
        pagedExtSplats?: boolean | undefined;
        maxPagedSplats?: number | undefined;
        numLodFetchers?: number | undefined;
        coneFov0?: number | undefined;
        coneFov?: number | undefined;
        coneFoveate?: number | undefined;
        behindFoveate?: number | undefined;
        lodRaycast?: number | undefined;
        lodRaycastIntervalMs?: number | undefined;
        extraUniforms?: Record<string, unknown> | undefined;
    };
    private syncRenderSize;
    private prepareComposite;
    onBeforeRender(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void;
}
