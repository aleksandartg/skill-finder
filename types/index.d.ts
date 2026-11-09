declare module 'claude-code' {
  interface PluginState {
    'skill-finder': { query: Shaped<string>; project: Shaped<string> }
  }
}
export {}
