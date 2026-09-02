import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold">doma</h1>
      <p className="mt-4 text-lg">
        The household hub is under construction. Milestone 1 (skeleton) — the
        real UI lands from Milestone 5 onward, built into the locked direction
        in <code>docs/design-direction.md</code>.
      </p>
    </div>
  )
}
