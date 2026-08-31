/**
 * Full-workflow NL synthesis is forbidden in v1 (ROX §15 / §43).
 * This module only emits a single custom node.
 */
export { generateCustomNode as buildFromInstruction, draftCustomNode, generateCustomNode } from "./customNode";
