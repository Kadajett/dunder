/**
 * Bright, low-contrast daylight like the reference: a near-neutral sky/ground
 * fill (a warm ground bounce turns the floor orange), one soft shadow-casting
 * sun from behind the camera's left shoulder so shadows fall short and back,
 * and a shadowless fill from the camera side that keeps the walls pale cream.
 */
export function Lights() {
	return (
		<>
			<hemisphereLight args={["#fffaf2", "#e6dccb", 1.3]} />
			<directionalLight
				position={[10, 30, 18]}
				intensity={1.75}
				color="#fff7ec"
				castShadow
				shadow-mapSize={[2048, 2048]}
				shadow-camera-left={-24}
				shadow-camera-right={24}
				shadow-camera-top={24}
				shadow-camera-bottom={-24}
				shadow-camera-near={1}
				shadow-camera-far={80}
				shadow-bias={-0.0005}
				shadow-normalBias={0.02}
			/>
			<directionalLight position={[30, 10, 20]} intensity={0.8} color="#fbf6ee" />
		</>
	);
}
