/** 生成任务 ID（时间戳 + 随机后缀，全应用唯一实现） */
export function genTaskId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** 生成选题 ID */
export function genTopicId(): string {
  return `topic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
