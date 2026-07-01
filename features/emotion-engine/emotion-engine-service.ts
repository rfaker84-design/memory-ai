import { EmotionDetector } from "./emotion-detector";
import { EmotionContextBuilder } from "./emotion-context-builder";
import { AIEmotionBuilder } from "./ai-emotion-builder";
import type { EmotionContext, EmotionDetectionInput } from "./types";

export class EmotionEngineService {
  private detector = new EmotionDetector();
  private contextBuilder = new EmotionContextBuilder();
  private aiEmotionBuilder = new AIEmotionBuilder();

  analyze(input: EmotionDetectionInput): EmotionContext {
    const detection = this.detector.detect(input);
    const context = this.contextBuilder.build(detection);

    context.aiEmotionState = this.aiEmotionBuilder.build(context);

    return context;
  }
}
