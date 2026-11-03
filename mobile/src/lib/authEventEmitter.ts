import { EventEmitter } from 'eventemitter3';

/** Token rotations update the active session without logging the operator out. */
export const authEventEmitter = new EventEmitter();
