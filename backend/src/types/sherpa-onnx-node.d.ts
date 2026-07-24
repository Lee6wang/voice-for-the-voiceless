// sherpa-onnx-node 官方未附带类型声明，这里给出本项目用到的最小面
declare module 'sherpa-onnx-node' {
  export interface OfflineRecognizerConfig {
    featConfig?: { sampleRate: number; featureDim: number };
    modelConfig: {
      senseVoice?: { model: string; useInverseTextNormalization?: number };
      tokens: string;
      numThreads?: number;
      provider?: string;
      debug?: number;
    };
  }
  export interface OfflineStream {
    acceptWaveform(w: { samples: Float32Array; sampleRate: number }): void;
  }
  export class OfflineRecognizer {
    constructor(config: OfflineRecognizerConfig);
    createStream(): OfflineStream;
    decode(stream: OfflineStream): void;
    getResult(stream: OfflineStream): { text: string };
  }
  // CJS 包：ESM 下默认导入拿到整个 module.exports
  const sherpaOnnx: { OfflineRecognizer: typeof OfflineRecognizer };
  export default sherpaOnnx;
}
