/** Live optical effects are reserved for the small, fixed navigation surfaces. */
export function shouldUseOpticalGlass(
  platform: string,
  nativeAvailable: boolean,
  lightweight: boolean,
  reduceTransparency: boolean,
  chrome: boolean,
) {
  return platform === 'ios' && chrome && nativeAvailable && !lightweight && !reduceTransparency;
}
