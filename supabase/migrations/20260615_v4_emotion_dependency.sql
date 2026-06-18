-- V4 情绪依赖系统 - personality_memories 增加 emotion_context 字段
ALTER TABLE personality_memories
ADD COLUMN IF NOT EXISTS emotion_context TEXT;
