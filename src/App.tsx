// src/App.tsx
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { PointerLockControls, OrbitControls } from '@react-three/drei'
import { useEffect, useRef, useState, useCallback } from 'react' 
import * as THREE from 'three'; // Import THREE
import { Vector3 } from 'three'
import { useSpring, animated, config as springConfig } from '@react-spring/three' 
import { PropertyModel } from './components/PropertyModel'
import { Hotspot } from './components/Hotspot'

const MOVE_SPEED = 5 // units per second
const PLAYER_HEIGHT = 1.6
const COLLISION_THRESHOLD = 0.6; // Player's approximate radius + buffer for collision

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
  },
  walkMode: { // New state for Walk Mode
    id: 'walkMode',
    position: baseRoomCoordinates.default.clone(), // Start at default position
    lookAt: new Vector3(baseRoomCoordinates.default.x, PLAYER_HEIGHT, baseRoomCoordinates.default.z - 5), // Look "forward"
    fov: 60, // Wider FOV for walking
  }
};

type ViewKey = keyof typeof viewCameraStates;


// Navigation Bar Component
interface NavigationBarProps {
  onNavigate: (view: ViewKey) => void;
  onStartTour: () => void;
}

function NavigationBar({ onNavigate, onStartTour }: NavigationBarProps) {
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
    walkMode: {...buttonStyleInitial}, // Style for Walk Mode button
  });

  const handleMouseEnter = (key: keyof typeof buttonStyles) => {
    setButtonStyles(prev => ({...prev, [key]: {...prev[key], backgroundColor: 'rgba(255, 255, 255, 0.2)'}}));
  };
  const handleMouseLeave = (key: keyof typeof buttonStyles) => {
     setButtonStyles(prev => ({...prev, [key]: {...prev[key], backgroundColor: 'transparent'}}));
  };

  return (
    <div style={navStyle}>
      <button style={buttonStyles.topView} onMouseEnter={() => handleMouseEnter('topView')} onMouseLeave={() => handleMouseLeave('topView')} onClick={() => onNavigate('topView')}>Top View</button>
      <button style={buttonStyles.hall} onMouseEnter={() => handleMouseEnter('hall')} onMouseLeave={() => handleMouseLeave('hall')} onClick={() => onNavigate('hall')}>Hall</button>
      <button style={buttonStyles.bedroom} onMouseEnter={() => handleMouseEnter('bedroom')} onMouseLeave={() => handleMouseLeave('bedroom')} onClick={() => onNavigate('bedroom')}>Bedroom</button>
      <button style={buttonStyles.kitchen} onMouseEnter={() => handleMouseEnter('kitchen')} onMouseLeave={() => handleMouseLeave('kitchen')} onClick={() => onNavigate('kitchen')}>Kitchen</button>
      <button style={buttonStyles.walkMode} onMouseEnter={() => handleMouseEnter('walkMode')} onMouseLeave={() => handleMouseLeave('walkMode')} onClick={() => onNavigate('walkMode')}>Walk Mode</button> {/* Walk Mode Button */}
      <button
        style={buttonStyleInitial}
        onClick={onStartTour}
      >
        Start Tour
      </button>
    </div>
  );
}


// PlayerControls component
function PlayerControls({
  initialPosition,
  enabled,
  model, // New prop: the 3D model for collision detection
  isWalkMode // New prop: flag for walk mode specific behaviors
}: {
  initialPosition: Vector3,
  enabled: boolean,
  model: THREE.Object3D | null | undefined, // Model can be Group or Scene
  isWalkMode: boolean 
}) {
  const { camera, gl } = useThree()
  const movement = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false
  })
  const velocity = useRef(new Vector3()) // Used for internal calculations, not directly for final movement
  const direction = useRef(new Vector3())
  const mouseIsDown = useRef(false); // For mouse click movement
  const raycaster = useRef(new THREE.Raycaster()).current; // Reusable Raycaster

  useEffect(() => {
    if (enabled) {
      camera.position.copy(initialPosition);
      camera.position.y = PLAYER_HEIGHT; // Ensure correct height
    }
  }, [camera, initialPosition, enabled]);

  useEffect(() => {
    if (!enabled) {
        if (document.pointerLockElement === gl.domElement) {
            document.exitPointerLock();
        }
        movement.current.forward = false;
        movement.current.backward = false;
        movement.current.left = false;
        movement.current.right = false;
        velocity.current.set(0,0,0);
        mouseIsDown.current = false; // Reset mouse state
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

    const handleMouseDown = (event: MouseEvent) => {
      if (isWalkMode && event.button === 0) { // Left click in walk mode
        if (document.pointerLockElement !== gl.domElement) {
          gl.domElement.requestPointerLock(); // Lock pointer if not already locked
        }
        mouseIsDown.current = true;
      }
    };
    const handleMouseUp = (event: MouseEvent) => {
      if (isWalkMode && event.button === 0) {
        mouseIsDown.current = false;
      }
    };

    if (isWalkMode) {
      gl.domElement.addEventListener('mousedown', handleMouseDown);
      gl.domElement.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      if (isWalkMode) {
        gl.domElement.removeEventListener('mousedown', handleMouseDown);
        gl.domElement.removeEventListener('mouseup', handleMouseUp);
      }
      if (document.pointerLockElement === gl.domElement) {
        document.exitPointerLock();
      }
      mouseIsDown.current = false; // Ensure cleanup
    }
  }, [enabled, gl.domElement, isWalkMode, camera]) // Added camera to deps for PointerLockControls args

  useFrame((_state, delta) => {
    if (!enabled) {
      return;
    }
    // In walk mode, allow movement controls even if pointer isn't locked (for mouse click/touch)
    // PointerLockControls will only activate mouse look when pointer is locked.
    if (!isWalkMode && document.pointerLockElement !== gl.domElement) {
      return; // For non-walk FPS modes, require pointer lock
    }
    if (!model) return; // No model to collide with

    const speedDelta = MOVE_SPEED * delta;
    
    camera.getWorldDirection(direction.current); // This is the direction camera is looking
    const forwardDir = direction.current.clone();
    forwardDir.y = 0;
    forwardDir.normalize();

    const rightDir = new Vector3();
    rightDir.crossVectors(camera.up, forwardDir).normalize(); // camera.up is (0,1,0)

    let moveDelta = new Vector3(0, 0, 0);
    raycaster.far = COLLISION_THRESHOLD;

    // Keyboard Forward
    if (movement.current.forward) {
      raycaster.set(camera.position, forwardDir);
      const intersects = raycaster.intersectObject(model, true);
      if (intersects.length === 0) {
        moveDelta.add(forwardDir.clone().multiplyScalar(speedDelta));
      }
    }
    // Keyboard Backward
    if (movement.current.backward) {
      const backwardDir = forwardDir.clone().negate();
      raycaster.set(camera.position, backwardDir);
      const intersects = raycaster.intersectObject(model, true);
      if (intersects.length === 0) {
        moveDelta.add(backwardDir.multiplyScalar(speedDelta));
      }
    }
    // Keyboard Left
    if (movement.current.left) {
      const leftDir = rightDir.clone().negate();
      raycaster.set(camera.position, leftDir);
      const intersects = raycaster.intersectObject(model, true);
      if (intersects.length === 0) {
        moveDelta.add(leftDir.multiplyScalar(speedDelta));
      }
    }
    // Keyboard Right
    if (movement.current.right) {
      raycaster.set(camera.position, rightDir);
      const intersects = raycaster.intersectObject(model, true);
      if (intersects.length === 0) {
        moveDelta.add(rightDir.clone().multiplyScalar(speedDelta));
      }
    }

    // Mouse click to move forward (if in walk mode)
    // This adds to existing keyboard movement if any, or moves on its own.
    // The final normalization will handle combined speed.
    if (isWalkMode && mouseIsDown.current) {
      raycaster.set(camera.position, forwardDir); // Use camera's forward direction
      const intersects = raycaster.intersectObject(model, true);
      if (intersects.length === 0) {
         // Check if forward movement is already maxed by keyboard to avoid double contribution if W is held
        const tempForwardContribution = forwardDir.clone().multiplyScalar(speedDelta);
        // A simple way to avoid over-contribution: if W is not pressed, or if W is pressed but blocked.
        // This logic can be complex. For now, let's assume mouse adds its own attempt to move forward.
        // The normalization step below will cap the total speed.
        let canAddMouseMovement = true;
        if(movement.current.forward){ // if W is pressed
            raycaster.set(camera.position, forwardDir);
            if(raycaster.intersectObject(model, true).length === 0){ // and W is not blocked
                canAddMouseMovement = false; // W key is already providing max forward, don't add mouse
            }
        }
        if(canAddMouseMovement){
            moveDelta.add(forwardDir.clone().multiplyScalar(speedDelta));
        }
      }
    }
    
    // Normalize combined movement vector to maintain consistent speed, then scale by speedDelta
    if (moveDelta.lengthSq() > 0) {
      moveDelta.normalize().multiplyScalar(speedDelta);
    }

    camera.position.add(moveDelta);
    camera.position.y = PLAYER_HEIGHT; // Maintain player height
  });

  // PointerLockControls are active if enabled (for FPS views including walkMode)
  // Mouse look is handled by PointerLockControls when pointer is locked.
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


// SceneContent component
function SceneContent({
  currentViewKey,
  navigateTo,
  tourStarted
}: {
  currentViewKey: ViewKey;
  navigateTo: (view: ViewKey) => void;
  tourStarted: boolean;
}) {
  const { camera, gl } = useThree();
  const propertyModelRef = useRef<THREE.Group>(null); // Ref for the PropertyModel group

  const [playerInitialPos, setPlayerInitialPos] = useState<Vector3>(viewCameraStates.default.position.clone());
  const [activeControls, setActiveControls] = useState<'fps' | 'orbit' | 'none'>('fps'); 
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [cameraAnimationTarget, setCameraAnimationTarget] = useState<typeof viewCameraStates[ViewKey] | null>(null);

  // guided tour state
  const waypoints = ['hall', 'bedroom', 'kitchen'] as const;
  const [tourIdx, setTourIdx] = useState(0);
  const [tourActive, setTourActive] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [nextIdx, setNextIdx] = useState(0);

  // kick off tour when button clicked
  useEffect(() => {
    if (tourStarted) {
      setTourActive(true);
      setTourIdx(0);
      navigateTo(waypoints[0]);
    }
  }, [tourStarted]);

  useEffect(() => {
    // Start transition
    setIsTransitioning(true);
    setActiveControls('none'); // Disable controls during transition
    const targetState = viewCameraStates[currentViewKey] || viewCameraStates.default;
    setCameraAnimationTarget(targetState);
    if (currentViewKey !== 'topView') { // Includes 'walkMode'
      setPlayerInitialPos(targetState.position.clone());
    }
  }, [currentViewKey]);

  const handleAnimationEnd = useCallback(() => {
    // trigger spin after arriving at waypoint
    if (tourActive && !isSpinning) {
      if (tourIdx < waypoints.length - 1) {
        const nxt = tourIdx + 1;
        setNextIdx(nxt);
        setIsSpinning(true);
        setIsTransitioning(false);
        return;
      }
      // tour finished → enable FPS
      setTourActive(false);
      setActiveControls('fps');
      return;
    }

    setIsTransitioning(false);
    setCameraAnimationTarget(null);
    // Determine controls based on view: 'orbit' for topView, 'fps' for others (hall, bedroom, walkMode, etc.)
    const newControls = (currentViewKey === 'topView') ? 'orbit' : 'fps';
    setActiveControls(newControls);

    if (newControls === 'fps' && document.pointerLockElement !== gl.domElement && (currentViewKey === 'walkMode' /* || other FPS views that might not auto-lock */)) {
        // For walk mode, pointer lock is preferred but not strictly required for movement.
        // User might need to click to lock for mouse look.
    }
    if (newControls === 'orbit' && document.pointerLockElement === gl.domElement) {
        document.exitPointerLock(); // Ensure pointer is unlocked for orbit controls
    }
  }, [currentViewKey, gl.domElement, tourActive, tourIdx, isSpinning]);


  // spin spring for 360° around current lookAt
  const { spin } = useSpring({
    from: { spin: 0 },
    to: { spin: Math.PI * 2 },
    config: { duration: 5000 },
    pause: !isSpinning,
    reset: true,
    onRest: () => {
      if (isSpinning) {
        setTimeout(() => {
          setTourIdx(nextIdx);
          navigateTo(waypoints[nextIdx]);
          setIsSpinning(false);
        }, 2000);
      }
    },
  });

  // apply spin orbit
  useFrame(() => {
    if (isSpinning && cameraAnimationTarget) {
      const look = new Vector3(10, 10, 10);
      const radius = cameraAnimationTarget.position.distanceTo(look);
      const a = spin.get();
      camera.position.set(
        look.x + radius * Math.cos(a),
        look.y,
        look.z + radius * Math.sin(a)
      );
      camera.lookAt(look.x, look.y, look.z);
    }
  });

  return (
    <>
      <PropertyModel ref={propertyModelRef} /> {/* Assign ref to PropertyModel */}

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

      {/* PlayerControls for FPS views (including 'walkMode') */}
      {!tourActive && activeControls === 'fps' && (
        <PlayerControls
          initialPosition={playerInitialPos}
          enabled={true}
          model={propertyModelRef.current} // Pass the model group for collision
          isWalkMode={currentViewKey === 'walkMode'} // Set walk mode flag
        />
      )}
      {/* OrbitControls for topView */}
      {!tourActive && activeControls === 'orbit' && currentViewKey === 'topView' && (
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
  const [tourStarted, setTourStarted] = useState(false);

  const handleNavigate = (viewTargetKey: ViewKey) => {
    setCurrentViewKey(viewTargetKey);
  };
  const handleStartTour = () => setTourStarted(true);

  // Set initial view once on mount
  useEffect(() => {
    handleNavigate('default'); 
  }, []);


  return (
    <> 
      <NavigationBar
        onNavigate={handleNavigate}
        onStartTour={handleStartTour}
      />
      <Canvas
        // Initial camera setup is less critical as CameraAnimator and controls will manage it.
        // However, providing a sensible default is good.
        camera={{ fov: 50, near: 0.1, far: 1000, position: viewCameraStates.default.position.toArray() }}
        style={{ width: '100vw', height: '100vh', background: '#d9d9d9' }}
        // onPointerMissed={(event) => event.stopPropagation()} // May help with controls if needed
      >
        <ambientLight intensity={0.9} /> 
        <directionalLight 
            position={[10, 15, 10]} 
            intensity={1.2} 
        />
        <hemisphereLight skyColor={0xffffff} groundColor={0x444444} intensity={0.6} />

        <SceneContent
          currentViewKey={currentViewKey}
          navigateTo={handleNavigate}
          tourStarted={tourStarted}
        /> 
        
      </Canvas>
    </>
  )
}
