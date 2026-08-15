export interface AppEnv {
  Variables: {
    /** Always the single owner user once auth middleware has run. */
    authenticated: true
  }
}
