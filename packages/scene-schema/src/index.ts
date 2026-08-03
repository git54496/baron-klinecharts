/** 场景协议包版本；Scene version 仍保持 1。 */
export const SCENE_PACKAGE_VERSION = '0.2.3' as const;

export * from './canonical-json.js';
export * from './canonicalize.js';
export * from './errors.js';
export * from './generated/chart-scene.js';
export * from './generated/schemas.js';
export * from './semantic-validator.js';
export * from './validator.js';
export * from './version.js';
