import { Suspense, memo, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Center, ContactShadows, OrbitControls, PerspectiveCamera, useGLTF } from "@react-three/drei";
import { Group, Plane, Vector3 } from "three";
import floorModelUrl from "@/assets/Floor.glb?url";
import hatsModelUrl from "@/assets/Hats.glb?url";
import kickModelUrl from "@/assets/Kick.glb?url";
import leftCrashModelUrl from "@/assets/LeftCrash.glb?url";
import rackModelUrl from "@/assets/Rack.glb?url";
import rideModelUrl from "@/assets/Ride.glb?url";
import rightCrashModelUrl from "@/assets/RightCrash.glb?url";
import snareModelUrl from "@/assets/Snare.glb?url";
import type { DrumKitPiece } from "@/hooks/useDrumTech";

type WearBand = "green" | "yellow" | "orange" | "red" | "neutral";
type SceneViewMode = "angle" | "top";

const SCENE_ORIGIN_X = 50;
const SCENE_ORIGIN_Y = 60;
const X_SCALE = 0.12;
const Z_SCALE = 0.1;
const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0);
const HIT_POINT = new Vector3();
const HEIGHT_STORAGE_KEY = "drum-tech-piece-heights";
const PIECE_MODELS: Partial<Record<string, { url: string; scale?: number }>> = {
  kick: { url: kickModelUrl, scale: 1 },
  snare: { url: snareModelUrl, scale: 0.78 },
  rack_tom: { url: rackModelUrl, scale: 0.84 },
  floor_tom: { url: floorModelUrl, scale: 0.96 },
  hi_hats: { url: hatsModelUrl, scale: 1 },
  left_crash: { url: leftCrashModelUrl, scale: 1 },
  right_crash: { url: rightCrashModelUrl, scale: 1 },
  ride: { url: rideModelUrl, scale: 1 },
};

function getLayoutValue(piece: DrumKitPiece | null, axis: "layout_x" | "layout_y", fallback: number) {
  const value = piece?.[axis];
  return typeof value === "number" ? value : fallback;
}

function layoutToScenePosition(piece: DrumKitPiece): [number, number, number] {
  const layoutX = getLayoutValue(piece, "layout_x", SCENE_ORIGIN_X);
  const layoutY = getLayoutValue(piece, "layout_y", SCENE_ORIGIN_Y);
  return [
    (layoutX - SCENE_ORIGIN_X) * X_SCALE,
    0,
    (SCENE_ORIGIN_Y - layoutY) * Z_SCALE,
  ];
}

function getStoredHeights(): Record<string, number> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(HEIGHT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[0] === "string" && typeof entry[1] === "number"),
    );
  } catch {
    return {};
  }
}

function saveStoredHeights(heights: Record<string, number>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HEIGHT_STORAGE_KEY, JSON.stringify(heights));
}

function sceneToLayout(position: Vector3) {
  const x = SCENE_ORIGIN_X + position.x / X_SCALE;
  const y = SCENE_ORIGIN_Y - position.z / Z_SCALE;
  return {
    x: Number(Math.max(8, Math.min(92, x)).toFixed(2)),
    y: Number(Math.max(16, Math.min(84, y)).toFixed(2)),
  };
}

function ImportedPieceModel({
  modelUrl,
  piece,
  selected,
  editable,
  scale = 1,
  verticalOffset = 0,
  onSelect,
  onMove,
  onHeightChange,
  onDragStateChange,
}: {
  modelUrl: string;
  piece: DrumKitPiece;
  selected: boolean;
  editable: boolean;
  scale?: number;
  verticalOffset?: number;
  onSelect: (pieceId: string) => void;
  onMove: (pieceId: string, x: number, y: number) => void;
  onHeightChange: (pieceId: string, height: number) => void;
  onDragStateChange: (dragging: boolean) => void;
}) {
  const gltf = useGLTF(modelUrl);
  const scene = useMemo(() => gltf.scene.clone(), [gltf.scene]);
  const groupRef = useRef<Group | null>(null);
  const [dragging, setDragging] = useState<"planar" | "vertical" | null>(null);
  const dragStartRef = useRef<{ clientY: number; baseHeight: number } | null>(null);

  const position = layoutToScenePosition(piece);

  return (
    <group
      ref={groupRef}
      position={[position[0], verticalOffset, position[2]]}
      scale={selected ? scale * 1.02 : scale}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(piece.id);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect(piece.id);
        if (!editable || !event.shiftKey) return;
        const mode = event.altKey ? "vertical" : "planar";
        setDragging(mode);
        dragStartRef.current = { clientY: event.clientY, baseHeight: verticalOffset };
        onDragStateChange(true);
      }}
      onPointerMove={(event) => {
        if (!dragging) return;
        event.stopPropagation();
        if (dragging === "vertical") {
          const start = dragStartRef.current;
          if (!start) return;
          const delta = (start.clientY - event.clientY) * 0.01;
          const nextHeight = Number(Math.max(-2, Math.min(6, start.baseHeight + delta)).toFixed(2));
          onHeightChange(piece.id, nextHeight);
          return;
        }
        if (!event.ray.intersectPlane(FLOOR_PLANE, HIT_POINT)) return;
        const next = sceneToLayout(HIT_POINT);
        onMove(piece.id, next.x, next.y);
      }}
      onPointerUp={(event) => {
        if (!dragging) return;
        event.stopPropagation();
        setDragging(null);
        dragStartRef.current = null;
        onDragStateChange(false);
      }}
      onPointerCancel={(event) => {
        if (!dragging) return;
        event.stopPropagation();
        setDragging(null);
        dragStartRef.current = null;
        onDragStateChange(false);
      }}
      onPointerMissed={() => {
        if (!dragging) return;
        setDragging(null);
        dragStartRef.current = null;
        onDragStateChange(false);
      }}
    >
      {selected && editable && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
          <ringGeometry args={[1.05, 1.2, 48]} />
          <meshBasicMaterial color="#1d4ed8" transparent opacity={0.3} />
        </mesh>
      )}
      <Center>
        <primitive object={scene} />
      </Center>
    </group>
  );
}

useGLTF.preload(kickModelUrl);
useGLTF.preload(snareModelUrl);
useGLTF.preload(rackModelUrl);
useGLTF.preload(floorModelUrl);
useGLTF.preload(hatsModelUrl);
useGLTF.preload(leftCrashModelUrl);
useGLTF.preload(rightCrashModelUrl);
useGLTF.preload(rideModelUrl);

function SceneContent({
  pieces,
  selectedPieceId,
  editable,
  onSelect,
  onMove,
  viewMode,
}: {
  pieces: DrumKitPiece[];
  selectedPieceId: string | null;
  editable: boolean;
  onSelect: (pieceId: string) => void;
  onMove: (pieceId: string, x: number, y: number) => void;
  viewMode: SceneViewMode;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const [dragging, setDragging] = useState(false);
  const [heightOffsets, setHeightOffsets] = useState<Record<string, number>>(() => getStoredHeights());
  const renderedPieces = pieces.filter((piece) => PIECE_MODELS[piece.piece_type]);

  const handleHeightChange = (pieceId: string, height: number) => {
    setHeightOffsets((current) => {
      const next = { ...current, [pieceId]: height };
      saveStoredHeights(next);
      return next;
    });
  };

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (viewMode === "top") {
      camera.position.set(0, 13, 0.01);
      controls.target.set(0, 0, 0);
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = 0;
      controls.minDistance = 6;
      controls.maxDistance = 16;
      controls.enableRotate = false;
    } else {
      camera.position.set(0, 1.5, 4.25);
      controls.target.set(0, 1.2, 3.5);
      controls.minPolarAngle = 0.45;
      controls.maxPolarAngle = 2.3;
      controls.minDistance = 0.75;
      controls.maxDistance = 3.25;
      controls.enableRotate = true;
    }

    camera.updateProjectionMatrix();
    controls.update();
  }, [camera, viewMode]);

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 1.5, 4.25]} fov={24} />
      <ambientLight intensity={1.15} />
      <hemisphereLight intensity={1} groundColor="#98aba4" color="#ffffff" />
      <directionalLight
        castShadow
        position={[12, 16, 10]}
        intensity={2.8}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-8, 6, -6]} intensity={1} />

      {renderedPieces.map((piece) => {
        const model = PIECE_MODELS[piece.piece_type];
        if (!model) return null;

        return (
        <ImportedPieceModel
          key={piece.id}
          modelUrl={model.url}
          piece={piece}
          selected={selectedPieceId === piece.id}
          editable={editable}
          scale={model.scale}
          verticalOffset={heightOffsets[piece.id] ?? 0}
          onSelect={onSelect}
          onMove={onMove}
          onHeightChange={handleHeightChange}
          onDragStateChange={setDragging}
        />
        );
      })}

      <ContactShadows position={[0, -0.02, 0]} opacity={0.34} scale={24} blur={2.6} far={10} />
      <OrbitControls
        ref={controlsRef}
        enabled={!dragging}
        enablePan
        panSpeed={0.6}
        zoomSpeed={0.9}
        minDistance={viewMode === "top" ? 6 : 0.75}
        maxDistance={viewMode === "top" ? 16 : 3.25}
        minPolarAngle={viewMode === "top" ? 0 : 0.45}
        maxPolarAngle={viewMode === "top" ? 0 : 2.3}
        enableRotate={viewMode !== "top"}
        target={viewMode === "top" ? [0, 0, 0] : [0, 1.2, 3.5]}
      />
    </>
  );
}

function KickDrumScene({
  pieces,
  selectedPieceId,
  editable,
  onSelect,
  onMove,
  viewMode = "angle",
}: {
  pieces: DrumKitPiece[];
  selectedPieceId: string | null;
  editable: boolean;
  onSelect: (pieceId: string) => void;
  onMove: (pieceId: string, x: number, y: number) => void;
  viewMode?: SceneViewMode;
  wearValue?: string;
  wearBand?: WearBand;
}) {
  return (
    <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }} className="h-full w-full">
      <color attach="background" args={["#c8d8d2"]} />
      <Suspense fallback={null}>
        <SceneContent
          pieces={pieces}
          selectedPieceId={selectedPieceId}
          editable={editable}
          onSelect={onSelect}
          onMove={onMove}
          viewMode={viewMode}
        />
      </Suspense>
    </Canvas>
  );
}

export default memo(KickDrumScene);
