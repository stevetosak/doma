/**
 * Small env-var helper so required config fails loudly, at the point of use,
 * with a message that says which variable is missing — instead of a bare
 * `undefined` propagating into a connection string or a `fetch` call.
 */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name]
  return value && value.trim() !== '' ? value : fallback
}
