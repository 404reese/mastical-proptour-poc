// src/components/PropertyModel.tsx
import { useGLTF, OrbitControls, PerspectiveCamera, Html } from '@react-three/drei'
import { useMemo, forwardRef } from 'react'
import * as THREE from 'three'

interface PropertyModelProps extends React.ComponentPropsWithoutRef<'group'> {
  isWalkModeActive?: boolean;
}

export const PropertyModel = forwardRef<THREE.Group, PropertyModelProps>(({ isWalkModeActive = false, ...props }, ref) => {
  const { scene } = useGLTF('/property.glb')

  // compute the center of the loaded scene
  const center = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    // Ensure all meshes are traversable for raycasting
    scene.traverse(child => {
      if (child instanceof THREE.Mesh) {
        // Optional: if experiencing issues, ensure bounding volumes are computed
        // child.geometry.computeBoundingBox();
        // child.geometry.computeBoundingSphere();
      }
    });
    return box.getCenter(new THREE.Vector3())
  }, [scene])

  return (
    <>
      {/* Assuming OrbitControls are defined here or nearby */}
      <OrbitControls enableDamping={false} enabled={!isWalkModeActive} />
      {/* If you have a PerspectiveCamera component here, it remains unchanged unless specified */}
      {/* e.g., <PerspectiveCamera makeDefault position={[...]} /> */}
      
      <group {...props} scale={[1, 1, 1]} ref={ref}>
        <primitive object={scene} />
        {/* Html is now centered at the model’s true center */}
        <Html position={center.toArray()} center>
          Property Label
        </Html>
      </group>
    </>
  )
});
