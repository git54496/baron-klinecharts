/** 场景协议包版本，与首版 Runtime 版本保持一致。 */
export const SCENE_PACKAGE_VERSION = '0.1.0' as const;

export * from './canonical-json.js';
export * from './canonicalize.js';
export * from './errors.js';
export * from './generated/chart-scene.js';
export * from './generated/schemas.js';
export * from './semantic-validator.js';
export * from './validator.js';
export * from './version.js';
