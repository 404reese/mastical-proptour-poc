// src/App.tsx
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { PointerLockControls, OrbitControls } from '@react-three/drei'
import { useEffect, useRef, useState, useCallback } from 'react' // useMemo removed, useCallback added
import { Vector3 } from 'three'
import { useSpring, animated, config as springConfig, useChain, useSpringRef } from '@react-spring/three' // Added useChain and useSpringRef
import { PropertyModel } from './components/PropertyModel'
import { Hotspot } from './components/Hotspot'

const MOVE_SPEED = 5 // units per second
const PLAYER_HEIGHT = 1.6

// Define room coordinates (base for camera states)
const baseRoomCoordinates = {
  hall: new Vector3(5, PLAYER_HEIGHT, 8),
  bedroom: new Vector3(4, PLAYER_HEIGHT, 4),
  kitchen: new Vector3(10, PLAYER_HEIGHT, 3),
  default: new Vector3(0, PLAYER_HEIGHT, 5)
};

// Define target camera states for each view
const viewCameraStates = {
  topView: {
    id: 'topView',
    position: new Vector3(0, 25, 5), // Adjusted Z for a slightly better angle if model is centered around Z=0
    lookAt: new Vector3(0, 0, 0),
    fov: 60,
  },
  hall: {
    id: 'hall',
    position: baseRoomCoordinates.hall.clone(),
    lookAt: new Vector3(baseRoomCoordinates.hall.x, PLAYER_HEIGHT, baseRoomCoordinates.hall.z - 5), // Look "forward"
    fov: 50, // Standard FPS FOV
  },
  bedroom: {
    id: 'bedroom',
    position: baseRoomCoordinates.bedroom.clone(),
    lookAt: new Vector3(baseRoomCoordinates.bedroom.x, PLAYER_HEIGHT, baseRoomCoordinates.bedroom.z - 5),
    fov: 50,
  },
  kitchen: {
    id: 'kitchen',
    position: baseRoomCoordinates.kitchen.clone(),
    lookAt: new Vector3(baseRoomCoordinates.kitchen.x, PLAYER_HEIGHT, baseRoomCoordinates.kitchen.z - 5),
    fov: 50,
  },
  default: {
    id: 'default',
    position: baseRoomCoordinates.default.clone(),
    lookAt: new Vector3(baseRoomCoordinates.default.x, PLAYER_HEIGHT, baseRoomCoordinates.default.z - 5),
    fov: 50,
  }
};

type ViewKey = keyof typeof viewCameraStates;

// Define waypoints for the guided tour
const tourWaypoints: ViewKey[] = ['hall', 'bedroom', 'kitchen'];
const WAYPOINT_TRANSITION_TIME = 3000; // 3 seconds
const WAYPOINT_PAUSE_TIME = 1000; // 1 second

// Navigation Bar Component
interface NavigationBarProps {
  onNavigate: (view: ViewKey) => void;
  onStartTour: () => void;
  isTourActive: boolean;
}

function NavigationBar({ onNavigate, onStartTour, isTourActive }: NavigationBarProps) {
  const navStyle: React.CSSProperties = {
    position: 'absolute',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 100,
    background: 'rgba(0, 0, 0, 0.7)',
    padding: '10px',
    borderRadius: '8px',
    display: 'flex',
    gap: '10px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
  };
  const buttonStyleInitial: React.CSSProperties = {
    color: 'white',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.5)',
    padding: '8px 15px',
    cursor: 'pointer',
    borderRadius: '5px',
    fontSize: '14px',
    transition: 'background-color 0.2s, color 0.2s',
  };

  const [buttonStyles, setButtonStyles] = useState({
    topView: {...buttonStyleInitial},
    hall: {...buttonStyleInitial},
    bedroom: {...buttonStyleInitial},
    kitchen: {...buttonStyleInitial},
    tour: {...buttonStyleInitial, background: 'rgba(40, 167, 69, 0.7)'},
  });

  const handleMouseEnter = (key: keyof typeof buttonStyles) => {
    setButtonStyles(prev => ({...prev, [key]: {...prev[key], backgroundColor: key === 'tour' ? 'rgba(40, 167, 69, 0.9)' : 'rgba(255, 255, 255, 0.2)'}}));
  };
  const handleMouseLeave = (key: keyof typeof buttonStyles) => {
    setButtonStyles(prev => ({...prev, [key]: {...prev[key], backgroundColor: key === 'tour' ? 'rgba(40, 167, 69, 0.7)' : 'transparent'}}));
  };

  return (
    <div style={navStyle}>
      <button style={buttonStyles.topView} onMouseEnter={() => handleMouseEnter('topView')} onMouseLeave={() => handleMouseLeave('topView')} onClick={() => onNavigate('topView')}>Top View</button>
      <button style={buttonStyles.hall} onMouseEnter={() => handleMouseEnter('hall')} onMouseLeave={() => handleMouseLeave('hall')} onClick={() => onNavigate('hall')}>Hall</button>
      <button style={buttonStyles.bedroom} onMouseEnter={() => handleMouseEnter('bedroom')} onMouseLeave={() => handleMouseLeave('bedroom')} onClick={() => onNavigate('bedroom')}>Bedroom</button>
      <button style={buttonStyles.kitchen} onMouseEnter={() => handleMouseEnter('kitchen')} onMouseLeave={() => handleMouseLeave('kitchen')} onClick={() => onNavigate('kitchen')}>Kitchen</button>
      <button 
        style={{
          ...buttonStyles.tour,
          opacity: isTourActive ? 0.6 : 1,
          cursor: isTourActive ? 'default' : 'pointer'
        }} 
        onMouseEnter={() => !isTourActive && handleMouseEnter('tour')} 
        onMouseLeave={() => !isTourActive && handleMouseLeave('tour')} 
        onClick={() => !isTourActive && onStartTour()}
        disabled={isTourActive}
      >
        {isTourActive ? 'Tour Active...' : 'Start Tour'}
      </button>
    </div>
  );
}


// PlayerControls component
function PlayerControls({ initialPosition, enabled }: { initialPosition: Vector3, enabled: boolean }) {
  const { camera, gl } = useThree()
  const movement = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false
  })
  const velocity = useRef(new Vector3())
  const direction = useRef(new Vector3())

  useEffect(() => {
    if (enabled) {
      // Position is set by animation; this ensures camera is at the correct spot if re-enabled.
      // LookAt is managed by PointerLockControls.
      camera.position.copy(initialPosition);
    }
  }, [camera, initialPosition, enabled]);

  useEffect(() => {
    if (!enabled) {
        if (document.pointerLockElement === gl.domElement) {
            document.exitPointerLock();
        }
        // Clear movement flags when disabled
        movement.current.forward = false;
        movement.current.backward = false;
        movement.current.left = false;
        movement.current.right = false;
        velocity.current.set(0,0,0);
        return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          movement.current.forward = true
          break
        case 'KeyS':
        case 'ArrowDown':
          movement.current.backward = true
          break
        case 'KeyA':
        case 'ArrowLeft':
          movement.current.left = true
          break
        case 'KeyD':
        case 'ArrowRight':
          movement.current.right = true
          break
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          movement.current.forward = false
          break
        case 'KeyS':
        case 'ArrowDown':
          movement.current.backward = false
          break
        case 'KeyA':
        case 'ArrowLeft':
          movement.current.left = false
          break
        case 'KeyD':
        case 'ArrowRight':
          movement.current.right = false
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)

    // Attempt to lock pointer when controls are enabled and canvas is focused
    // This might require a user interaction like a click on the canvas first
    // gl.domElement.requestPointerLock(); // This can be aggressive, usually lock on click

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      if (document.pointerLockElement === gl.domElement) {
        document.exitPointerLock();
      }
    }
  }, [enabled, gl.domElement]) 

  useFrame((_state, delta) => {
    if (!enabled || document.pointerLockElement !== gl.domElement) { 
      velocity.current.set(0,0,0);
      return;
    }

    velocity.current.x = 0
    velocity.current.z = 0

    camera.getWorldDirection(direction.current)
    direction.current.y = 0 // Move on XZ plane
    direction.current.normalize()

    const speedDelta = MOVE_SPEED * delta

    if (movement.current.forward) {
      velocity.current.add(direction.current.clone().multiplyScalar(speedDelta))
    }
    if (movement.current.backward) {
      velocity.current.add(direction.current.clone().multiplyScalar(-speedDelta))
    }

    const rightVector = new Vector3()
    rightVector.crossVectors(camera.up, direction.current).normalize()

    if (movement.current.left) {
      velocity.current.add(rightVector.clone().multiplyScalar(-speedDelta))
    }
    if (movement.current.right) {
      velocity.current.add(rightVector.clone().multiplyScalar(speedDelta))
    }

    camera.position.add(velocity.current)
  })

  return enabled ? <PointerLockControls args={[camera, gl.domElement]} /> : null;
}

// CameraAnimator Component
interface CameraAnimatorProps {
  targetState: typeof viewCameraStates[ViewKey] | null;
  onAnimationComplete: () => void;
  isTransitioning: boolean;
}

function CameraAnimator({ targetState, onAnimationComplete, isTransitioning }: CameraAnimatorProps) {
  const { camera } = useThree();

  const initialLookAt = useRef(new Vector3());
  
  // Capture initial lookAt direction when a new transition starts
  useEffect(() => {
    if (isTransitioning && targetState) {
      camera.getWorldDirection(initialLookAt.current);
      initialLookAt.current.multiplyScalar(5).add(camera.position); // Look 5 units in front
    }
  }, [isTransitioning, targetState, camera]);

  const { posX, posY, posZ, lookX, lookY, lookZ, fov } = useSpring({
    from: {
      posX: camera.position.x,
      posY: camera.position.y,
      posZ: camera.position.z,
      lookX: initialLookAt.current.x,
      lookY: initialLookAt.current.y,
      lookZ: initialLookAt.current.z,
      fov: camera.fov,
    },
    to: async (next) => {
      if (isTransitioning && targetState) {
        await next({
          posX: targetState.position.x,
          posY: targetState.position.y,
          posZ: targetState.position.z,
          lookX: targetState.lookAt.x,
          lookY: targetState.lookAt.y,
          lookZ: targetState.lookAt.z,
          fov: targetState.fov,
        });
      }
    },
    config: springConfig.slow, // Changed from springConfig.gentle to springConfig.slow
    reset: !isTransitioning, // Reset spring when not transitioning to use 'from' values next time
    onRest: () => {
      if (isTransitioning) { // Only call onRest if it was due to finishing an active transition
        onAnimationComplete();
      }
    },
  });

  useFrame(() => {
    if (isTransitioning) {
      camera.position.set(posX.get(), posY.get(), posZ.get());
      camera.lookAt(lookX.get(), lookY.get(), lookZ.get());
      camera.fov = fov.get();
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

// GuidedTour Component
interface GuidedTourProps {
  waypoints: ViewKey[];
  isActive: boolean;
  onNavigate: (view: ViewKey) => void;
  onTourComplete: () => void;
}

function GuidedTour({ waypoints, isActive, onNavigate, onTourComplete }: GuidedTourProps) {
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState(0);
  const [isRotating, setIsRotating] = useState(false);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [rotationCenter, setRotationCenter] = useState<Vector3 | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { camera } = useThree();
  
  // Constants for rotation control
  const ROTATION_DURATION = 10000; // 10 seconds for full 360 rotation
  const ROTATION_RADIUS = 2.5; // Distance from center point during rotation
  
  useEffect(() => {
    if (!isActive) {
      // Clear any pending timeouts when tour is stopped
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setIsRotating(false);
      return;
    }

    if (currentWaypointIndex < waypoints.length) {
      const currentWaypoint = waypoints[currentWaypointIndex];
      const roomCenter = baseRoomCoordinates[currentWaypoint].clone();
      
      // First navigate to the waypoint
      if (!isRotating) {
        onNavigate(currentWaypoint);
        
        // Start rotation after camera has reached the waypoint
        timeoutRef.current = setTimeout(() => {
          setIsRotating(true);
          setRotationAngle(0);
          setRotationCenter(roomCenter);
        }, WAYPOINT_TRANSITION_TIME + 500);
      }
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isActive, currentWaypointIndex, isRotating, onNavigate, waypoints]);

  // Reset index when tour is restarted
  useEffect(() => {
    if (isActive) {
      setCurrentWaypointIndex(0);
      setIsRotating(false);
    }
  }, [isActive]);

  // Handle the rotation animation
  useFrame(({ clock }) => {
    if (isActive && isRotating && rotationCenter) {
      // Calculate rotation progress (0 to 1)
      const elapsedTime = (clock.getElapsedTime() * 1000) % ROTATION_DURATION;
      const progress = elapsedTime / ROTATION_DURATION;
      const angle = progress * Math.PI * 2; // 0 to 2π (full circle)
      
      // Calculate new camera position in a circle
      const newX = rotationCenter.x + Math.cos(angle) * ROTATION_RADIUS;
      const newZ = rotationCenter.z + Math.sin(angle) * ROTATION_RADIUS;
      
      // Update camera and make it look at the center
      camera.position.set(newX, PLAYER_HEIGHT, newZ);
      camera.lookAt(rotationCenter.x, PLAYER_HEIGHT, rotationCenter.z);
      camera.updateProjectionMatrix();
      
      // When rotation completes one full circle
      if (Math.abs(angle - rotationAngle) > 0.1 && angle < rotationAngle) {
        setIsRotating(false);
        
        // Move to next waypoint or end tour
        timeoutRef.current = setTimeout(() => {
          if (currentWaypointIndex < waypoints.length - 1) {
            setCurrentWaypointIndex(currentWaypointIndex + 1);
          } else {
            onTourComplete();
          }
        }, 1000); // Pause briefly before moving to next waypoint
      }
      
      setRotationAngle(angle);
    }
  });

  return null; // This component has no visual representation
}

// SceneContent component
function SceneContent({ currentViewKey, navigateTo }: { currentViewKey: ViewKey, navigateTo: (view: ViewKey) => void }) {
  const { camera, gl } = useThree();
  
  const [playerInitialPos, setPlayerInitialPos] = useState<Vector3>(viewCameraStates.default.position.clone());
  const [activeControls, setActiveControls] = useState<'fps' | 'orbit' | 'none'>('fps'); // 'fps', 'orbit', 'none'
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [cameraAnimationTarget, setCameraAnimationTarget] = useState<typeof viewCameraStates[ViewKey] | null>(null);
  const [tourRotationActive, setTourRotationActive] = useState(false);

  useEffect(() => {
    if (tourRotationActive) {
      setActiveControls('none');
      return;
    }
    
    // Start transition
    setIsTransitioning(true);
    setActiveControls('none'); // Disable all controls during transition
    
    const targetState = viewCameraStates[currentViewKey] || viewCameraStates.default;
    setCameraAnimationTarget(targetState);

    if (currentViewKey !== 'topView') {
      setPlayerInitialPos(targetState.position.clone());
    }
  }, [currentViewKey, tourRotationActive]);

  const handleAnimationEnd = useCallback(() => {
    setIsTransitioning(false);
    setCameraAnimationTarget(null); // Clear animation target

    // Don't enable controls if tour rotation is active
    if (tourRotationActive) {
      setActiveControls('none');
      return;
    }

    const newControls = currentViewKey === 'topView' ? 'orbit' : 'fps';
    setActiveControls(newControls);

    if (newControls === 'fps' && document.pointerLockElement === gl.domElement) {
        // If pointer was locked, it might have been lost by disabling controls.
        // Re-locking might need a click, PointerLockControls handles this.
    }
    if (newControls === 'orbit' && document.pointerLockElement === gl.domElement) {
        document.exitPointerLock(); // Ensure pointer is unlocked for orbit controls
    }
  }, [currentViewKey, gl.domElement, tourRotationActive]);

  // Expose the tour rotation state to the parent (App)
  useEffect(() => {
    // This is a way to detect if a tour is active and rotating
    const checkForTourRotation = () => {
      // Simple check - we could enhance this with a proper state management system
      const isTourElement = document.getElementById('tour-rotating');
      return !!isTourElement;
    };
    
    // For demonstration - in reality, you'd use a proper state management approach
    const rotationActive = checkForTourRotation();
    setTourRotationActive(rotationActive);
  }, [currentViewKey]);

  return (
    <>
      <PropertyModel />

      <Hotspot
        position={[4, 2, 4]} 
        label="Bedroom"
        onClick={() => navigateTo('bedroom')}
      />
      <Hotspot
        position={[5, 2, 8]}
        label="Hall"
        onClick={() => navigateTo('hall')}
      />
      <Hotspot
        position={[10, 1, 3]}
        label="Kitchen"
        onClick={() => navigateTo('kitchen')}
      />
      
      <CameraAnimator
        targetState={cameraAnimationTarget}
        onAnimationComplete={handleAnimationEnd}
        isTransitioning={isTransitioning}
      />

      {activeControls === 'fps' && !isTransitioning && !tourRotationActive && (
        <PlayerControls initialPosition={playerInitialPos} enabled={true} />
      )}
      {activeControls === 'orbit' && !isTransitioning && currentViewKey === 'topView' && !tourRotationActive && (
        <OrbitControls 
            args={[camera, gl.domElement]} 
            enableZoom={true} 
            enablePan={true} 
            target={viewCameraStates.topView.lookAt}
        />
      )}
    </>
  )
}

export default function App() {
  const [currentViewKey, setCurrentViewKey] = useState<ViewKey>('default');
  const [isTourActive, setIsTourActive] = useState(false);
  
  const handleNavigate = (viewTargetKey: ViewKey) => {
    // Cancel tour if manual navigation is used
    if (isTourActive) setIsTourActive(false);
    setCurrentViewKey(viewTargetKey);
  };

  const handleStartTour = () => {
    setIsTourActive(true);
  };

  const handleTourComplete = () => {
    setIsTourActive(false);
    // Optionally switch to FPS controls by navigating to the last waypoint
    // already handled by the tour navigation
  };

  // Set initial view once on mount
  useEffect(() => {
    handleNavigate('default'); 
  }, []);

  return (
    <> 
      <NavigationBar 
        onNavigate={handleNavigate} 
        onStartTour={handleStartTour}
        isTourActive={isTourActive}
      />
      {isTourActive && (
        <GuidedTour 
          waypoints={tourWaypoints}
          isActive={isTourActive}
          onNavigate={setCurrentViewKey}
          onTourComplete={handleTourComplete}
        />
      )}
      <Canvas
        camera={{ fov: 50, near: 0.1, far: 1000, position: viewCameraStates.default.position.toArray() }}
        style={{ width: '100vw', height: '100vh', background: '#d9d9d9' }}
      >
        <ambientLight intensity={0.9} /> 
        <directionalLight 
            position={[10, 15, 10]} 
            intensity={1.2} 
        />
        <hemisphereLight skyColor={0xffffff} groundColor={0x444444} intensity={0.6} />

        <SceneContent currentViewKey={currentViewKey} navigateTo={handleNavigate} /> 
        
      </Canvas>
    </>
  )
}
