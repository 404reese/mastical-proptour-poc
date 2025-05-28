// src/components/PropertyModel.tsx
import { useGLTF, OrbitControls, PerspectiveCamera, Html } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

export function PropertyModel(props: any) {
  const { scene } = useGLTF('/property.glb')

  // compute the center of the loaded scene
  const center = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    return box.getCenter(new THREE.Vector3())
  }, [scene])

  return (
    <>
      {/* ...existing camera & controls… */}
      <group {...props} scale={[1, 1, 1]}>
        <primitive object={scene} />
        {/* Html is now centered at the model’s true center */}
        <Html position={center.toArray()} center>
          Property Label
        </Html>
      </group>
    </>
  )
}
