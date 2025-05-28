// src/components/Hotspot.tsx
import { Html } from '@react-three/drei'

export function Hotspot({
  position,
  label,
  onClick
}: {
  position: [number, number, number]
  label: string
  onClick?: () => void
}) {
  return (
    <Html position={position}>
      <button
        className="bg-white px-2 py-1 rounded shadow"
        onClick={onClick}
      >
        {label}
      </button>
    </Html>
  )
}
