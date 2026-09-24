// worklet-loader.js — builds and registers the pitch worklet module.
//
// AudioWorklet module scripts are supposed to support static `import`, but
// support has historically been unreliable on iOS Safari. Rather than keep two
// copies of the DSP code (one for the worklet, one for tests), we fetch the two
// plain scripts, concatenate them into a Blob, and register that. One source of
// truth, and it works everywhere AudioWorklet itself works.

let modulePromise = null;

/**
 * @param {AudioContext} ctx
 * @param {string} base path prefix to the js/audio directory
 * @returns {Promise<void>} resolves once 'pitch-processor' is registered
 */
export function loadPitchWorklet(ctx, base = 'js/audio/') {
  if (modulePromise) return modulePromise;

  modulePromise = (async () => {
    const [dsp, processor] = await Promise.all([
      fetch(base + 'dsp.js').then(r => {
        if (!r.ok) throw new Error(`Failed to load dsp.js (${r.status})`);
        return r.text();
      }),
      fetch(base + 'pitch-processor.js').then(r => {
        if (!r.ok) throw new Error(`Failed to load pitch-processor.js (${r.status})`);
        return r.text();
      })
    ]);

    const source = `${dsp}\n;\n${processor}\n`;
    const url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  })();

  return modulePromise;
}
